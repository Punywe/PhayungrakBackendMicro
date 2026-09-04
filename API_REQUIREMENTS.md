# ข้อกำหนด API — พยุงรัก (Phayungrak)

เอกสารนี้สรุป endpoint ที่แอปฝั่ง Flutter ต้องการทั้งหมด แบ่งเป็น
**(มีอยู่แล้ว)** endpoint ที่ backend มีอยู่ตอนนี้แต่ยังขาด auth/ต้องปรับ response
กับ **(ใหม่)** endpoint ที่ยังไม่มีและต้องสร้างเพิ่ม ตามที่คุยกันไว้เรื่อง
auth แบบ token + การผูก MAC กับผู้ป่วย

Base URL: `https://api.phayungrak.tech`

---

## หลักการร่วม (ใช้กับทุก endpoint ด้านล่าง)

### รูปแบบ response มาตรฐาน

ทุก endpoint ควรตอบกลับ envelope เดียวกัน:

```json
{
  "success": true,
  "message": "คำอธิบาย (ใช้ตอน success=false เป็นหลัก)",
  "data": { }
}
```

- `success` (bool, required)
- `message` (string, optional — ควรมีเสมอเมื่อ `success=false`)
- `data` (object/array, optional — เนื้อหาจริงของ response)

### การยืนยันตัวตน (Authorization header)

ทุก endpoint ที่ทำเครื่องหมาย 🔒 ต้องแนบ:

```
Authorization: Bearer <access_token>
```

ไม่แนบ หรือ token หมดอายุ/ไม่ถูกต้อง → ตอบ `401 Unauthorized`:

```json
{ "success": false, "message": "token หมดอายุหรือไม่ถูกต้อง" }
```

บัญชีที่ถูกระงับ (`status != "active"`) → ตอบ `403 Forbidden`:

```json
{ "success": false, "message": "บัญชีถูกระงับการใช้งาน" }
```

### HTTP status codes ที่ใช้

| Code | ความหมาย |
|---|---|
| 200 | สำเร็จ |
| 400 | payload ผิดรูปแบบ/ข้อมูลไม่ครบ |
| 401 | ไม่ได้ login / token หมดอายุ |
| 403 | ไม่มีสิทธิ์ (role ผิด, บัญชีถูกระงับ, mac ไม่ผูกกับบัญชีนี้) |
| 404 | ไม่พบทรัพยากร (เช่น mac ที่ไม่เคยผูกไว้) |
| 409 | ข้อมูลชนกัน (เช่น username ซ้ำตอนสมัคร) |
| 500 | server error |

---

## 1. Authentication

### 1.1 `POST /api/auth/login` — (มีอยู่แล้ว — ต้องปรับ response)

เข้าสู่ระบบผู้ดูแล (username/password ที่พยาบาล/เจ้าหน้าที่สร้างให้)

**Request**
```json
{
  "username": "patient1",
  "password": "••••••••"
}
```

**Response 200**
```json
{
  "success": true,
  "message": "เข้าสู่ระบบสำเร็จ",
  "user": {
    "id": "CG-1001",
    "username": "patient1",
    "role": "caregiver",
    "status": "active",
    "mac": "20:E7:C8:68:B7:BE"
  },
  "accessToken": "eyJhbGciOi...",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "8f3a1c2e...",
  "refreshTokenExpiresIn": 2592000
}
```

**Response 401 (login ผิด)**
```json
{ "success": false, "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
```

การเปลี่ยนแปลงจากปัจจุบัน:
- เพิ่ม field **`mac`** ใน `user` — คือ MAC ของไม้เท้าที่ผูกกับผู้ป่วยรายนี้ (ใช้ให้ฝั่งผู้ดูแลดึง `/api/hourly`, `/api/weekly` โดยไม่ต้องเชื่อมต่อ ESP32/BLE เอง — ดูข้อ 5)
- เพิ่ม **`accessToken`** (อายุสั้น ~1 ชม.) และ **`refreshToken`** (อายุยาว ~30 วัน) แทนการให้แอปเก็บแค่ `user` object เฉย ๆ

---

### 1.2 `POST /api/auth/refresh` — (ใหม่)

ขอ access token ใหม่ด้วย refresh token (ทำอัตโนมัติเบื้องหลังตอน access token หมดอายุ ไม่ต้องให้ผู้ใช้ login ใหม่)

**Request**
```json
{ "refreshToken": "8f3a1c2e..." }
```

**Response 200**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOi...(ใหม่)",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "b91d7f4a...(หมุนใหม่)",
  "refreshTokenExpiresIn": 2592000
}
```

**Response 401 (refresh token หมดอายุ/ถูก revoke)**
```json
{ "success": false, "message": "session หมดอายุ กรุณาเข้าสู่ระบบใหม่" }
```

> แนะนำให้ **หมุน (rotate) refresh token ทุกครั้งที่ใช้** — ของเก่าใช้ซ้ำไม่ได้ ป้องกัน token หลุดแล้วถูกใช้วนซ้ำ

---

### 1.3 `POST /api/auth/logout` 🔒 — (ใหม่)

ยกเลิก session จริงฝั่ง backend (ไม่ใช่แค่ลบข้อมูลในเครื่อง)

**Request**
```json
{ "refreshToken": "8f3a1c2e..." }
```

**Response 200**
```json
{ "success": true }
```

---

### 1.4 `GET /api/auth/me` 🔒 — (ใหม่, แนะนำ)

ยืนยันตัวตน + สถานะบัญชีปัจจุบัน — เรียกตอนเปิดแอปแทนการเชื่อ session ที่เก็บในเครื่องเฉย ๆ

**Response 200**
```json
{
  "success": true,
  "user": {
    "id": "CG-1001",
    "username": "patient1",
    "role": "caregiver",
    "status": "active",
    "mac": "20:E7:C8:68:B7:BE"
  }
}
```

---

## 2. QR Pairing — ผู้สูงอายุเข้าระบบด้วย QR (ไม่ใช้รหัสผ่าน)

### 2.1 `POST /api/pair/create` 🔒 (role: caregiver) — (ใหม่)

ผู้ดูแลกดสร้าง QR ในแอป → ขอ pairing token อายุสั้นจาก backend (แทนการฝัง token คงที่ในเครื่องแบบตอนนี้)

**Request** — ไม่มี body

**Response 200**
```json
{
  "success": true,
  "pairingToken": "pt_9f2a...",
  "expiresIn": 300,
  "caregiverId": "CG-1001",
  "caregiverName": "สมหญิง ใจดี"
}
```

ค่าที่เข้ารหัสลง QR (ฝั่งแอปยังทำเหมือนเดิม แค่เปลี่ยน `tok` มาใช้ `pairingToken` ที่ได้จาก endpoint นี้แทนค่าคงที่):
```json
{ "t": "phayungrak-link", "cid": "CG-1001", "name": "สมหญิง ใจดี", "tok": "pt_9f2a..." }
```

---

### 2.2 `POST /api/pair/redeem` — (ใหม่)

ผู้สูงอายุสแกน QR แล้ว → แอปแลก pairing token เป็น session จริงของฝั่งผู้สูงอายุ

**Request**
```json
{ "pairingToken": "pt_9f2a..." }
```

**Response 200**
```json
{
  "success": true,
  "elder": {
    "id": "ED-4471",
    "caregiverId": "CG-1001",
    "caregiverName": "สมหญิง ใจดี",
    "mac": null
  },
  "accessToken": "eyJhbGciOi...",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "c72e91a0...",
  "refreshTokenExpiresIn": 2592000
}
```

**Response 400 (token หมดอายุ/ใช้ไปแล้ว)**
```json
{ "success": false, "message": "QR นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่" }
```

> `pairingToken` ควร **ใช้ได้ครั้งเดียว** และหมดอายุไว (เช่น 5 นาที) ต่างจาก access/refresh token ปกติ

---

## 3. Device provisioning — ผูก MAC กับผู้ป่วย (ฝั่ง staff/admin)

ไม่ได้เรียกจากแอป Flutter นี้โดยตรง (น่าจะเรียกจากระบบหลังบ้าน/แอดมินตอนแจกไม้เท้า) แต่ backend **ต้องมี** เพื่อให้ข้อ 4 ตรวจสอบความถูกต้องของ mac↔patient ได้

### 3.1 `POST /api/devices/bind` 🔒 (role: staff/admin) — (ใหม่)

**Request**
```json
{ "mac": "20:E7:C8:68:B7:BE", "patientId": "ED-4471" }
```

**Response 200**
```json
{ "success": true }
```

**Response 409 (mac ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว)**
```json
{ "success": false, "message": "MAC นี้ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว" }
```

### 3.2 `GET /api/devices/:mac` 🔒 — (ใหม่, optional)

เช็คว่า mac ผูกกับผู้ป่วยรายใด (ใช้ debug/support)

**Response 200**
```json
{ "success": true, "mac": "20:E7:C8:68:B7:BE", "patientId": "ED-4471", "boundAt": "2026-08-01T09:00:00Z" }
```

---

## 4. Telemetry — ข้อมูลจาก ESP32 (มีอยู่แล้ว — ต้องเพิ่ม auth + ตรวจ mac↔patient)

### 4.1 `POST /api/addDataESP` 🔒 (role: elder) — (มีอยู่แล้ว)

แอปฝั่งผู้สูงอายุรับข้อมูลจาก ESP32 ผ่าน BLE แล้วส่งขึ้น server จุดนี้ (ไม่ใช่ ESP32 ยิงตรง)

**Request**
```json
{
  "mac": "20:E7:C8:68:B7:BE",
  "temp": 36.5,
  "avg_bpm": 76,
  "fall": "ปกติ",
  "lat": 13.7563,
  "lng": 100.5018,
  "id": "ED-4471"
}
```

**Response 200**
```json
{ "success": true }
```

**Response 403 (mac ที่ส่งมาไม่ตรงกับที่ผูกไว้กับ `id` นี้ในข้อ 3.1)**
```json
{ "success": false, "message": "MAC ไม่ตรงกับอุปกรณ์ที่ผูกไว้กับบัญชีนี้" }
```

การเปลี่ยนแปลงจากปัจจุบัน: เดิม backend เชื่อคู่ `mac`+`id` ที่ส่งมาตรง ๆ — ควรเช็คกับตาราง provisioning (ข้อ 3) ก่อนบันทึก กันคนอื่นปลอมข้อมูลส่งเข้าระบบโดยอ้าง mac/id ของคนอื่น

---

## 5. สถิติย้อนหลัง (มีอยู่แล้ว — ต้องเพิ่ม auth เท่านั้น payload เดิมใช้ได้)

ทั้งสองเส้นนี้ **ใช้ทั้งฝั่งผู้สูงอายุและผู้ดูแล**:
- ผู้สูงอายุ: ดูกราฟย้อนหลังของตัวเอง
- ผู้ดูแล: ใช้เป็นแหล่งข้อมูล "ปัจจุบัน" ด้วย (ไม่เชื่อมต่อ ESP32/BLE เลย — แอป poll เส้นนี้ทุก ~20 วินาที แล้วเอาจุดข้อมูลล่าสุดที่ `has_data=true` มาแสดงแทนค่าเรียลไทม์)

### 5.1 `GET /api/hourly/:mac` 🔒

24 ชั่วโมงล่าสุด แบ่งเป็นราย 1 ชม.

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "time": "2026-09-04 14:00",
      "temp": 36.6,
      "avg_bpm": 78,
      "fall_count": 0,
      "has_data": true
    },
    {
      "time": "2026-09-04 15:00",
      "temp": 0,
      "avg_bpm": 0,
      "fall_count": 0,
      "has_data": false
    }
  ]
}
```

### 5.2 `GET /api/weekly/:mac` 🔒

7 วันล่าสุด แบ่งเป็นรายวัน — เหมือนข้อ 5.1 ทุกอย่าง ต่างแค่ key เวลาเป็น **`date`** แทน `time`:

```json
{
  "success": true,
  "data": [
    { "date": "2026-08-29", "temp": 36.7, "avg_bpm": 75, "fall_count": 0, "has_data": true }
  ]
}
```

**Response 403 (mac นี้ไม่ผูกกับ token ที่แนบมา)**
```json
{ "success": false, "message": "ไม่มีสิทธิ์เข้าถึงข้อมูลอุปกรณ์นี้" }
```

> ต้องตรวจว่า `token` (ของผู้ดูแล/ผู้สูงอายุ) มีสิทธิ์ดูข้อมูลของ `:mac` นี้จริง (ผูกกันไว้ตามข้อ 3) — ไม่ใช่ใครก็ตามที่มี token ใด ๆ ยิง mac คนอื่นแล้วดึงข้อมูลได้

---

## สรุป endpoint ทั้งหมด

| Method | Path | Auth | สถานะ |
|---|---|---|---|
| POST | `/api/auth/login` | ❌ | มีอยู่แล้ว — ต้องปรับ response (เพิ่ม `mac`, token) |
| POST | `/api/auth/refresh` | ❌ (ใช้ refreshToken แทน) | ใหม่ |
| POST | `/api/auth/logout` | 🔒 | ใหม่ |
| GET | `/api/auth/me` | 🔒 | ใหม่ (แนะนำ) |
| POST | `/api/pair/create` | 🔒 (caregiver) | ใหม่ |
| POST | `/api/pair/redeem` | ❌ (ใช้ pairingToken แทน) | ใหม่ |
| POST | `/api/devices/bind` | 🔒 (staff/admin) | ใหม่ |
| GET | `/api/devices/:mac` | 🔒 | ใหม่ (optional) |
| POST | `/api/addDataESP` | 🔒 (elder) | มีอยู่แล้ว — ต้องเพิ่ม auth + ตรวจ mac↔patient |
| GET | `/api/hourly/:mac` | 🔒 | มีอยู่แล้ว — ต้องเพิ่ม auth |
| GET | `/api/weekly/:mac` | 🔒 | มีอยู่แล้ว — ต้องเพิ่ม auth |
