# 🚨 Backend ต้องแก้วันนี้ — Token Refresh, QR Pairing, MAC Binding

ตอนนี้แอปเชื่อมต่อ API ตาม [API_REFERENCE.md](API_REFERENCE.md) ครบแล้ว แต่ 3 เรื่องนี้บล็อกการใช้งานจริง
ยืนยันจาก log จริง + ตรวจ Google Sheets จริง (`Logs`, `accounts`, `admin_accounts`, `Patients`, `Alerts`)

**Evidence:**
```
[API] realtime/20:E7:C8:68:B7:BE 401: {"success":false,"message":"token หมดอายุหรือไม่ถูกต้อง"}
```
→ accessToken หมดอายุ (ครบ 1 ชม.) → แอปลองยิง `/api/auth/refresh` ให้อัตโนมัติ → **ยังคง 401** →
ผู้ดูแลหลุดใช้งานทุก ~1 ชม. ต้อง logout/login เองตลอด

**สาเหตุร่วม**: `accounts` sheet ตอนนี้มีแค่คอลัมน์ `username | password | create_at | role | status | mac`
**ไม่มีที่เก็บ refresh token เลย** และไม่มี sheet ไหนรองรับ pairing token ของ QR ด้วย

---

## ✅ Checklist งานวันนี้ (เรียงตามผลกระทบ)

- [ ] 1. เพิ่มคอลัมน์ `refresh_token`, `refresh_token_expires_at` ใน `accounts`
- [ ] 2. แก้ `POST /api/auth/login` ให้เขียน refresh token ลง sheet ตอน login
- [ ] 3. ทำ `POST /api/auth/refresh` ให้ validate/rotate token จริง (ตอนนี้ค้าง/ไม่ทำงาน)
- [ ] 4. ทำ `POST /api/auth/logout` ให้ล้าง refresh token ใน sheet จริง (revoke จริง)
- [ ] 5. สร้าง sheet ใหม่ `pairing_tokens` — รองรับ `/api/pair/create` + `/api/pair/redeem`
- [ ] 6. `/api/pair/redeem` สำเร็จแล้ว **ต้องผูก mac กลับเข้าบัญชีผู้ดูแลด้วย** (ไม่ใช่แค่บัญชีผู้ป่วย)

---

## 1. Database — เพิ่มใน `accounts` (2 คอลัมน์)

| คอลัมน์ | ชนิด | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `refresh_token` | string | `8f3a1c2e4d5b6a7c...` | สุ่มด้วย crypto (เช่น 32 bytes hex) ห้ามเดาได้ง่าย |
| `refresh_token_expires_at` | ISO datetime string | `2026-10-04T09:42:14.066Z` | login/refresh ครั้งล่าสุด + 30 วัน |

แถวว่าง (ยังไม่เคย login) ปล่อย 2 คอลัมน์นี้ว่างไว้ได้ ไม่ต้อง migrate ข้อมูลเก่า

---

## 2. `POST /api/auth/login` — ต้องแก้เพิ่ม

**สิ่งที่ต้องทำเพิ่มจากตอนนี้:**
1. หลัง validate username/password ผ่าน → generate:
   - `accessToken` = JWT signed, payload อย่างน้อย `{id, role, mac}`, อายุ 3600 วิ (1 ชม.)
   - `refreshToken` = random string ปลอดภัย (เช่น `crypto.randomBytes(32).toString('hex')`) — **ห้ามใช้ JWT** สำหรับ refresh token (ต้อง revoke ได้จริง ต่างจาก access token ที่ verify ด้วย signature อย่างเดียว)
2. เขียนกลับลง `accounts` row ของ user นั้น:
   ```
   refresh_token = <refreshToken ที่สุ่มได้>
   refresh_token_expires_at = now + 30 วัน
   ```
3. Response เดิม (ดู [API_REFERENCE.md#21](API_REFERENCE.md#21-เข้าสู่ระบบ-post-apiauthlogin)) — ตรวจว่ามี `accessToken`, `accessTokenExpiresIn`, `refreshToken`, `refreshTokenExpiresIn` ครบจริง (ไม่ใช่แค่ตัวอย่างใน doc)

---

## 3. `POST /api/auth/refresh` — ต้อง**ทำให้ทำงานจริง** (จุดที่พังอยู่ตอนนี้)

**Request**
```json
{ "refreshToken": "8f3a1c2e4d5b6a7c..." }
```

**Logic (pseudocode):**
```
input = body.refreshToken
row = accounts.find(r => r.refresh_token == input)

if (!row) → return 401 { success:false, message:"refresh token ไม่ถูกต้อง" }
if (now > row.refresh_token_expires_at) → return 401 { success:false, message:"refresh token หมดอายุ กรุณาเข้าสู่ระบบใหม่" }

// ผ่าน — ออก token คู่ใหม่ (rotate refresh token กันโดนขโมยแล้วใช้วน)
newAccessToken = signJWT({id: row.id, role: row.role, mac: row.mac}, exp: 3600s)
newRefreshToken = randomHex(32)

row.refresh_token = newRefreshToken
row.refresh_token_expires_at = now + 30 วัน

return 200 {
  success: true,
  accessToken: newAccessToken,
  accessTokenExpiresIn: 3600,
  refreshToken: newRefreshToken,
  refreshTokenExpiresIn: 2592000
}
```

**สำคัญ**: ต้อง match `refresh_token` แบบ exact string เท่านั้น (ห้ามเผลอเทียบกับ access token หรือ field อื่น) — เข้าใจว่านี่คือจุดที่พังอยู่ตอนนี้ (endpoint อาจ return 404/500 หรือไม่เช็ค sheet เลยเพราะ column ยังไม่มี)

---

## 4. `POST /api/auth/logout` — revoke ให้จริง

**Request** (ต้องแนบ `Authorization: Bearer <accessToken>` ด้วย)
```json
{ "refreshToken": "8f3a1c2e4d5b6a7c..." }
```

**Logic:**
```
row = accounts.find(r => r.refresh_token == body.refreshToken)
if (row) {
  row.refresh_token = ""
  row.refresh_token_expires_at = ""
}
return 200 { success: true }
```
(หา row ไม่เจอก็ตอบ success เหมือนกัน — ผลลัพธ์ที่ผู้ใช้ต้องการคือ "token นี้ใช้ไม่ได้แล้ว" ซึ่งเป็นจริงอยู่แล้วไม่ว่าจะเจอ row หรือไม่)

---

## 5. Database ใหม่ — sheet `pairing_tokens`

สร้าง sheet ใหม่ชื่อ `pairing_tokens` คอลัมน์:

| คอลัมน์ | ชนิด | ตัวอย่าง |
|---|---|---|
| `token` | string | `pt_9f2a8b3c1d4e5f6a...` |
| `caregiver_id` | string | `ACC-2` |
| `caregiver_name` | string | `carer1` |
| `created_at` | ISO datetime | `2026-09-04T09:00:00.000Z` |
| `expires_at` | ISO datetime | `2026-09-04T09:05:00.000Z` (created_at + 5 นาที) |
| `used` | boolean | `FALSE` |
| `redeemed_by` | string | ว่างจนกว่าจะถูกใช้ — ใส่ elder id ตอน redeem |
| `redeemed_at` | ISO datetime | ว่างจนกว่าจะถูกใช้ |

### 5.1 `POST /api/pair/create` 🔒 (role: carer/admin/staff)

```
token = "pt_" + randomHex(16)
insert pairing_tokens row:
  token, caregiver_id: <จาก JWT ของ caller>, caregiver_name: <จาก accounts.username ของ caller>,
  created_at: now, expires_at: now + 300s, used: FALSE

return 200 {
  success: true,
  pairingToken: token,
  expiresIn: 300,
  caregiverId: <caller.id>,
  caregiverName: <caller.username>
}
```

### 5.2 `POST /api/pair/redeem` (ไม่ต้อง auth — ใช้ pairingToken แทน)

```json
{ "pairingToken": "pt_9f2a8b3c1d4e5f6a..." }
```

```
row = pairing_tokens.find(r => r.token == body.pairingToken)

if (!row) → 400 { success:false, message:"QR ไม่ถูกต้อง" }
if (row.used == TRUE) → 400 { success:false, message:"QR นี้ถูกใช้ไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่" }
if (now > row.expires_at) → 400 { success:false, message:"QR หมดอายุแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่" }

row.used = TRUE
row.redeemed_at = now

// หา/สร้างบัญชีผู้สูงอายุ — ดูหัวข้อ 6 ว่าใช้ตัวเลือกไหน
elderAccount = ... (ดูหัวข้อ 6)
row.redeemed_by = elderAccount.id

elderAccessToken = signJWT({id: elderAccount.id, role: "patient", mac: elderAccount.mac}, exp: 3600s)
elderRefreshToken = randomHex(32)
elderAccount.refresh_token = elderRefreshToken
elderAccount.refresh_token_expires_at = now + 30 วัน

return 200 {
  success: true,
  elder: {
    id: elderAccount.id,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
    mac: elderAccount.mac
  },
  accessToken: elderAccessToken,
  accessTokenExpiresIn: 3600,
  refreshToken: elderRefreshToken,
  refreshTokenExpiresIn: 2592000
}
```

---

## 6. 🔑 ผูก MAC เข้าบัญชีผู้ดูแลอัตโนมัติ — จุดสำคัญที่สุด

**ปัญหาปัจจุบัน**: `accounts` sheet ตอนนี้มีแค่ `patient1` ที่มี `mac` (`20:E7:C8:68:B7:BE`) ส่วน `carer1` ไม่มี `mac` เลย
→ ผู้ดูแล login แล้ว `user.mac` ว่าง → แอปไม่รู้จะดึงข้อมูลของ mac ไหน → ค้างที่ "กำลังรอข้อมูลจากเซิร์ฟเวอร์" ตลอด

**ต้องทำ**: ใน `POST /api/pair/redeem` (หัวข้อ 5.2) ตอนที่ redeem สำเร็จ นอกจากสร้าง session ให้ elder แล้ว
**ต้อง UPDATE mac ของบัญชีผู้ดูแล (`caregiver_id` ใน `pairing_tokens` row) ให้ตรงกับ mac ของ elder คนนี้ด้วย**:

```
caregiverRow = accounts.find(r => r.id == row.caregiver_id)
caregiverRow.mac = elderAccount.mac
```

ผลลัพธ์: ผู้ดูแล login/refresh ครั้งถัดไป จะได้ `user.mac` ที่ถูกต้องทันที ไม่ต้องรอแก้ manual ใน sheet

**หา `elderAccount` จากไหน** (เลือก 1 ในนี้ตามที่ backend implement จริงตอนนี้):

- **ถ้ามีระบบ provisioning อยู่แล้ว** (staff ผูก mac ↔ ผู้ป่วยไว้ล่วงหน้าใน `Patients`/`accounts`): หา `accounts` row ที่ `role == "patient"` และผูกกับ `Patients.id` ที่ตรงกับสิทธิ์ของผู้ดูแลคนนี้ (เช่นจาก `Patients.em_phone`/ข้อมูลติดต่อที่ตรงกับผู้ดูแล) แล้วใช้ mac ของแถวนั้น
- **ถ้ายังไม่มี** (ทางลัดง่ายสุดสำหรับวันนี้): ให้ `pairing_tokens` เก็บ `mac` ไปเลยตอน `/api/pair/create` (ผู้ดูแลเลือก/กรอก mac ตอนสร้าง QR ถ้ามีมากกว่า 1 เครื่อง หรือถ้ามีแค่เครื่องเดียวต่อผู้ดูแลก็ดึงจาก `accounts` row เดิมของผู้ดูแลถ้ามีอยู่แล้ว) แล้วใช้ค่านั้นตรง ๆ ตอน redeem

> **ข้อจำกัดที่ต้องรู้**: การเก็บ `mac` เป็น field เดียวใน `accounts` แปลว่า **ผู้ดูแล 1 คนดูแลผู้ป่วยได้พร้อมกันแค่ 1 คน** ถ้าต้องรองรับหลายคนต่อผู้ดูแล 1 คนในอนาคต ต้องแยกเป็นตาราง `caregiver_patients` (caregiver_id, patient_id/mac) ต่างหาก — แต่เกินสโคปที่ต้องทำวันนี้ ทำแบบ 1:1 นี้ไปก่อนได้

---

## 🧪 ทดสอบก่อนส่งกลับมาให้แอปเทส

1. Login `carer1` → เช็คใน `accounts` sheet ว่า `refresh_token` มีค่าจริง
2. ปลอม `accessTokenExpiresIn` ให้สั้นมาก (เช่น 10 วิ) ชั่วคราว → รอหมดอายุ → เรียก endpoint ใดก็ได้ที่ 🔒 → ต้องได้ 401 ครั้งแรก แล้วพอลอง `/api/auth/refresh` ด้วย `refreshToken` เดิม → ต้องได้ `accessToken` ใหม่ → เรียก endpoint เดิมซ้ำด้วย token ใหม่ → ต้องผ่าน (200)
3. `/api/pair/create` → คัดลอก `pairingToken` → `/api/pair/redeem` ด้วย token เดียวกันครั้งที่ 2 → ต้องได้ `400 "ใช้ไปแล้ว"`
4. Redeem สำเร็จแล้ว → เช็ค `accounts` row ของ `carer1` (หรือบัญชีผู้ดูแลที่สร้าง QR) → คอลัมน์ `mac` ต้องมีค่าตรงกับไม้เท้าที่ผูกแล้ว
5. Logout ด้วย `refreshToken` ที่ยังไม่หมดอายุ → ลองเรียก `/api/auth/refresh` ด้วย `refreshToken` ตัวเดิมอีกครั้ง → ต้องได้ `401` (ใช้ไม่ได้แล้วจริง ๆ ไม่ใช่แค่ token เก่ายังทำงานได้ต่อ)

ครบ 5 ข้อนี้แล้วแจ้งกลับมาได้เลย ฝั่งแอปพร้อมใช้ทันที (โค้ดฝั่งแอปรองรับ contract นี้ไว้หมดแล้ว ไม่ต้องแก้อะไรเพิ่ม)
