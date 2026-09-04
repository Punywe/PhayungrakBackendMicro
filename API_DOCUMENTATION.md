# 📖 คู่มือการใช้งาน API — โครงการพยุงรัก (Phayungrak Backend)

เอกสารฉบับนี้รวบรวมรายละเอียดของ RESTful API ทั้งหมดของระบบหลังบ้าน (Backend Microservice) ที่เชื่อมต่อกับฐานข้อมูล Google Sheets และรองรับการทำงานร่วมกับ Flutter Application (ทั้งฝั่งผู้ดูแล และฝั่งผู้สูงอายุ) ตลอดจนอุปกรณ์ ESP32 Smart Cane

---

## 🌐 Base URL & การเชื่อมต่อ

| สภาพแวดล้อม (Environment) | Base URL |
|---|---|
| **Local (เครื่องพัฒนา)** | `http://localhost:3000` (หรือตามพอร์ตใน `.env`) |
| **Production Server** | `https://api.phayungrak.tech` |

---

## 🔐 มาตรฐานการยืนยันตัวตน (Authentication)

สำหรับ Endpoint ที่มีสัญลักษณ์ 🔒 จำเป็นต้องแนบ **JSON Web Token (JWT)** ใน HTTP Headers เสมอ:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 📦 รูปแบบ Response มาตรฐาน (Envelope Format)

ทุก Endpoint ตอบกลับในโครงสร้าง JSON เดียวกัน:

```json
{
  "success": true,
  "message": "ข้อความอธิบายผลลัพธ์ (มีเสมอเมื่อเกิดข้อผิดพลาด)",
  "data": { }
}
```

### 🚦 HTTP Status Codes ที่ใช้งาน

* `200 OK` — ทำรายการสำเร็จ
* `201 Created` — สร้างข้อมูลใหม่สำเร็จ
* `400 Bad Request` — ข้อมูลที่ส่งมาไม่ถูกต้อง หรือขาดฟิลด์บังคับ
* `401 Unauthorized` — ไม่ได้แนบ Token หรือ Token หมดอายุ / รหัสผ่านไม่ถูกต้อง
* `403 Forbidden` — ไม่มีสิทธิ์เข้าถึง (Role ไม่ถูกต้อง, MAC ไม่ตรงกับบัญชี, หรือบัญชีถูกระงับ)
* `404 Not Found` — ไม่พบข้อมูลที่ร้องขอ
* `409 Conflict` — ข้อมูลซ้ำซ้อน (เช่น MAC นี้ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว)
* `500 Internal Server Error` — ข้อผิดพลาดภายในเซิร์ฟเวอร์

---

## 📑 สรุปสารบัญ API

1. [ระบบตรวจสอบสถานะเซิร์ฟเวอร์ (Health Check)](#1-ระบบตรวจสอบสถานะเซิร์ฟเวอร์-health-check)
2. [ระบบยืนยันตัวตน (Authentication)](#2-ระบบยืนยันตัวตน-authentication)
   - [2.1 เข้าสู่ระบบ (Login)](#21-เข้าสู่ระบบ-post-apiauthlogin)
   - [2.2 ขอ Token ใหม่ (Refresh Token)](#22-ขอ-access-token-ใหม่-post-apiauthrefresh)
   - [2.3 ออกจากระบบ (Logout)](#23-ออกจากระบบ-post-apiauthlogout-)
   - [2.4 ตรวจสอบโปรไฟล์ปัจจุบัน (Get Profile)](#24-ตรวจสอบโปรไฟล์ปัจจุบัน-get-apiauthme-)
3. [ระบบจับคู่อุปกรณ์ด้วย QR Code (QR Pairing)](#3-ระบบจับคู่อุปกรณ์ด้วย-qr-code-qr-pairing)
   - [3.1 ผู้ดูแลสร้าง QR Code (Create Pair QR)](#31-ผู้ดูแลสร้าง-qr-code-post-apipaircreate-)
   - [3.2 ผู้สูงอายุสแกนรับสิทธิ์ (Redeem Pair QR)](#32-ผู้สูงอายุสแกนรับสิทธิ์-post-apipairredeem)
4. [ระบบจัดการและผูกอุปกรณ์ (Device Provisioning)](#4-ระบบจัดการและผูกอุปกรณ์-device-provisioning)
   - [4.1 ผูก MAC เข้ากับผู้ป่วย (Bind Device)](#41-ผูก-mac-เข้ากับผู้ป่วย-post-apidevicesbind-)
   - [4.2 ตรวจสอบข้อมูล MAC Address (Get Device Info)](#42-ตรวจสอบข้อมูล-mac-address-get-apidevicesmac-)
5. [ระบบบันทึกข้อมูล Telemetry จาก ESP32](#5-ระบบบันทึกข้อมูล-telemetry-จาก-esp32)
   - [5.1 บันทึกค่าสุขภาพ/พิกัด (Add Data ESP)](#51-บันทึกค่าสุขภาพพิกัด-post-apiadddataesp-)
6. [ระบบสถิติและข้อมูลเรียลไทม์ (Stats & Real-time)](#6-ระบบสถิติและข้อมูลเรียลไทม์-stats--real-time)
   - [6.1 ข้อมูลล่าสุด Real-time](#61-ดึงข้อมูลสุขภาพล่าสุด-get-apirealtimemac-)
   - [6.2 สถิติเฉลี่ยรายชั่วโมง ย้อนหลัง 24 ชม.](#62-ดึงสถิติเฉลี่ยรายชั่วโมง-24-ชม-get-apihourlymac-)
   - [6.3 สถิติเฉลี่ยรายวัน ย้อนหลัง 7 วัน](#63-ดึงสถิติเฉลี่ยรายวัน-7-วัน-get-apiweeklymac-)
7. [ระบบข้อมูลผู้ป่วยและแจ้งเตือนฉุกเฉิน (Patients & Alerts)](#7-ระบบข้อมูลผู้ป่วยและแจ้งเตือนฉุกเฉิน-patients--alerts)
   - [7.1 ดึงรายชื่อผู้ป่วยทั้งหมด](#71-ดึงรายชื่อผู้ป่วยทั้งหมด-get-apipatients-)
   - [7.2 ดึงข้อมูลผู้ป่วยรายคน](#72-ดึงข้อมูลผู้ป่วยรายคน-get-apipatientsid-)
   - [7.3 ดึงรายการแจ้งเตือนฉุกเฉิน](#73-ดึงรายการแจ้งเตือนฉุกเฉิน-get-apialerts-)
   - [7.4 ปิด/จัดการสถานะการแจ้งเตือน](#74-จัดการปิดสถานะการแจ้งเตือน-put-apialertsidresolve-)

---

## 1. ระบบตรวจสอบสถานะเซิร์ฟเวอร์ (Health Check)

### `GET /api/health`
ใช้สำหรับตรวจสอบว่า Service ยังทำงานอยู่ปกติหรือไม่

* **Auth Required**: ❌ ไม่ต้องใส่
* **Request Headers**: ไม่มี

#### ตัวอย่าง Response `200 OK`
```json
{
  "status": "UP",
  "message": "Payoongrak Backend Microservice is running smoothly",
  "timestamp": "2026-09-04T07:00:00.000Z"
}
```

---

## 2. ระบบยืนยันตัวตน (Authentication)

### 2.1 เข้าสู่ระบบ: `POST /api/auth/login`
เข้าสู่ระบบสำหรับผู้ดูแล (Caregiver), ผู้ป่วย (Patient) หรือเจ้าหน้าที่ (Staff/Admin/Doctor)

* **Auth Required**: ❌ ไม่ต้องใส่
* **Request Body** (`application/json`):
  ```json
  {
    "username": "patient1",
    "password": "patient1234"
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "เข้าสู่ระบบสำเร็จ",
  "user": {
    "id": "ACC-2",
    "username": "patient1",
    "role": "caregiver",
    "status": "active",
    "mac": "20:E7:C8:68:B7:BE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "8f3a1c2e4d5b6a7c...",
  "refreshTokenExpiresIn": 2592000
}
```

#### ตัวอย่าง Response `401 Unauthorized` (รหัสผ่านผิด)
```json
{
  "success": false,
  "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
}
```

---

### 2.2 ขอ Access Token ใหม่: `POST /api/auth/refresh`
เรียกใช้อัตโนมัติเบื้องหลังเมื่อ `accessToken` หมดอายุ (ภายใน 1 ชม.) โดยไม่ต้องให้ผู้ใช้กรอกรหัสผ่านใหม่ ระบบจะทำการหมุน (rotate) `refreshToken` ให้ใหม่ทุกครั้ง

* **Auth Required**: ❌ ไม่ต้องใส่ (ใช้ refreshToken ใน Body)
* **Request Body** (`application/json`):
  ```json
  {
    "refreshToken": "8f3a1c2e4d5b6a7c..."
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...(Token ใหม่)",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "b91d7f4a2c5e6a8d...(Refresh Token หมุนใหม่)",
  "refreshTokenExpiresIn": 2592000
}
```

---

### 2.3 ออกจากระบบ: `POST /api/auth/logout` 🔒
ยกเลิก Session และลบ Refresh Token ออกจากระบบ

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Request Body** (`application/json`):
  ```json
  {
    "refreshToken": "b91d7f4a2c5e6a8d..."
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "ออกจากระบบเรียบร้อยแล้ว"
}
```

---

### 2.4 ตรวจสอบโปรไฟล์ปัจจุบัน: `GET /api/auth/me` 🔒
เรียกใช้ตอนเปิดแอป เพื่อตรวจสอบความถูกต้องของ Token และสถานะบัญชี

* **Auth Required**: 🔒 `Bearer <accessToken>`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "user": {
    "id": "ACC-2",
    "username": "patient1",
    "role": "caregiver",
    "status": "active",
    "mac": "20:E7:C8:68:B7:BE"
  }
}
```

---

## 3. ระบบจับคู่อุปกรณ์ด้วย QR Code (QR Pairing)

### 3.1 ผู้ดูแลสร้าง QR Code: `POST /api/pair/create` 🔒
ผู้ดูแลกดปุ่ม "สร้าง QR เพื่อเชื่อมต่อผู้สูงอายุ" ในแอป เพื่อรับ `pairingToken` (อายุ 5 นาที / 300 วินาที)

* **Auth Required**: 🔒 `Bearer <accessToken>` (Role: `caregiver` / `carer` / `admin` / `staff`)
* **Request Body**: ไม่มี

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "pairingToken": "pt_9f2a8b3c1d4e5f6a7b8c9d0e1f2a3b4c",
  "expiresIn": 300,
  "caregiverId": "ACC-2",
  "caregiverName": "patient1"
}
```
> **ข้อมูลที่แอปนำไป Encode ลงรูปภาพ QR Code:**
> ```json
> {
>   "t": "phayungrak-link",
>   "cid": "ACC-2",
>   "name": "patient1",
>   "tok": "pt_9f2a8b3c1d4e5f6a7b8c9d0e1f2a3b4c"
> }
> ```

---

### 3.2 ผู้สูงอายุสแกนรับสิทธิ์: `POST /api/pair/redeem`
แอปฝั่งผู้สูงอายุสแกน QR แล้วส่ง `tok` (pairingToken) มาแลกเป็น Access Token และ Session ของผู้สูงอายุ

* **Auth Required**: ❌ ไม่ต้องใส่
* **Request Body** (`application/json`):
  ```json
  {
    "pairingToken": "pt_9f2a8b3c1d4e5f6a7b8c9d0e1f2a3b4c"
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "elder": {
    "id": "ED-4471",
    "caregiverId": "ACC-2",
    "caregiverName": "patient1",
    "mac": "20:E7:C8:68:B7:BE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "accessTokenExpiresIn": 3600,
  "refreshToken": "c72e91a03f4e5d6c...",
  "refreshTokenExpiresIn": 2592000
}
```

#### ตัวอย่าง Response `400 Bad Request` (QR หมดอายุหรือใช้ซ้ำ)
```json
{
  "success": false,
  "message": "QR นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่"
}
```

---

## 4. ระบบจัดการและผูกอุปกรณ์ (Device Provisioning)

### 4.1 ผูก MAC เข้ากับผู้ป่วย: `POST /api/devices/bind` 🔒
เจ้าหน้าที่ / หมอ / แอดมิน ทำการผูก MAC Address ของไม้เท้าเข้ากับรหัสผู้ป่วย (บันทึกลงแผ่นงาน `patients` และ `accounts`)

* **Auth Required**: 🔒 `Bearer <accessToken>` (Role: `staff` / `admin` / `doctor` / `หมอ`)
* **Request Body** (`application/json`):
  ```json
  {
    "mac": "20:E7:C8:68:B7:BE",
    "patientId": "PT-552246"
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "ผูกอุปกรณ์ MAC Address กับผู้ป่วยสำเร็จ",
  "data": {
    "mac": "20:E7:C8:68:B7:BE",
    "patientId": "PT-552246"
  }
}
```

#### ตัวอย่าง Response `409 Conflict` (MAC ถูกผูกกับคนอื่นอยู่แล้ว)
```json
{
  "success": false,
  "message": "MAC นี้ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว"
}
```

---

### 4.2 ตรวจสอบข้อมูล MAC Address: `GET /api/devices/:mac` 🔒
ตรวจสอบว่า MAC Address นี้ผูกอยู่กับผู้ป่วยคนใด

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:mac` เช่น `20:E7:C8:68:B7:BE`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "mac": "20:E7:C8:68:B7:BE",
  "patientId": "PT-552246",
  "patientName": "สมชาย ใจดี",
  "boundAt": "2026-09-04T07:00:00.000Z"
}
```

---

## 5. ระบบบันทึกข้อมูล Telemetry จาก ESP32

### 5.1 บันทึกค่าสุขภาพ/พิกัด: `POST /api/addDataESP` 🔒
แอปพลิเคชันฝั่งผู้สูงอายุ (รับข้อมูลจาก ESP32 ผ่านบลูทูธ BLE) หรือตัวบอร์ด ส่งข้อมูลเซนเซอร์ขึ้นเซิร์ฟเวอร์เพื่อบันทึกลงแผ่นงาน `Logs`

> 🚨 **ระบบตรวจจับเหตุฉุกเฉินอัตโนมัติ:** หากค่า `fall` ไม่ใช่ 'ปกติ' หรือ `avg_bpm > 120` หรือ `avg_bpm < 45` หรือ `temp >= 38.0` ระบบจะสร้างรายการแจ้งเตือนลงแผ่นงาน `alerts` ให้อัตโนมัติทันที

* **Auth Required**: ❌ / 🔒 (รองรับทั้งแบบแนบ Token หรือส่งค่าตรง)
* **Request Body** (`application/json`):
  ```json
  {
    "mac": "20:E7:C8:68:B7:BE",
    "temp": 36.6,
    "avg_bpm": 78,
    "fall": "ปกติ",
    "lat": 13.736717,
    "lng": 100.523186,
    "id": "PT-552246"
  }
  ```

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "บันทึกข้อมูลสำเร็จ",
  "data": {
    "timestamp": "2026-09-04T14:00:00.000Z",
    "mac": "20:E7:C8:68:B7:BE",
    "temp": 36.6,
    "avg_bpm": 78,
    "fall": "ปกติ",
    "lat": 13.736717,
    "lng": 100.523186,
    "id": "PT-552246"
  }
}
```

---

## 6. ระบบสถิติและข้อมูลเรียลไทม์ (Stats & Real-time)

### 6.1 ดึงข้อมูลสุขภาพล่าสุด: `GET /api/realtime/:mac` 🔒
ดึงข้อมูลบันทึกแถวล่าสุดของ MAC Address นั้นๆ

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:mac`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "ดึงข้อมูล Real-time ล่าสุดสำเร็จ",
  "data": {
    "timestamp": "2026-09-04T13:45:00.000Z",
    "mac": "20:E7:C8:68:B7:BE",
    "temp": 36.5,
    "avg_bpm": 75,
    "fall": "ปกติ",
    "lat": 13.736717,
    "lng": 100.523186
  }
}
```

---

### 6.2 ดึงสถิติเฉลี่ยรายชั่วโมง (24 ชม.): `GET /api/hourly/:mac` 🔒
ข้อมูลสถิติย้อนหลัง 24 ชั่วโมง แบ่งออกเป็น 24 จุดข้อมูล (รายชั่วโมง) ฝั่งแอปสามารถนำไปพล็อตเป็นกราฟเส้นแสดงแนวโน้มสุขภาพ

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:mac`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "time": "2026-09-04 13:00",
      "temp": 36.6,
      "avg_bpm": 78,
      "fall_count": 0,
      "has_data": true
    },
    {
      "time": "2026-09-04 14:00",
      "temp": 0,
      "avg_bpm": 0,
      "fall_count": 0,
      "has_data": false
    }
  ]
}
```

---

### 6.3 ดึงสถิติเฉลี่ยรายวัน (7 วัน): `GET /api/weekly/:mac` 🔒
ข้อมูลสถิติย้อนหลัง 7 วัน แบ่งออกเป็น 7 จุดข้อมูล (รายวัน)

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:mac`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-08-29",
      "temp": 36.7,
      "avg_bpm": 75,
      "fall_count": 0,
      "has_data": true
    },
    {
      "date": "2026-08-30",
      "temp": 36.5,
      "avg_bpm": 72,
      "fall_count": 1,
      "has_data": true
    }
  ]
}
```

---

## 7. ระบบข้อมูลผู้ป่วยและแจ้งเตือนฉุกเฉิน (Patients & Alerts)

### 7.1 ดึงรายชื่อผู้ป่วยทั้งหมด: `GET /api/patients` 🔒
ดึงข้อมูลรายชื่อและประวัติทางการแพทย์ของผู้ป่วยทั้งหมดจากแผ่นงาน `patients`

* **Auth Required**: 🔒 `Bearer <accessToken>`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "PT-552246",
      "name": "สมชาย ใจดี",
      "age": 65,
      "gender": "ชาย",
      "bloodType": "O",
      "emergencyContact": {
        "name": "สมศักดิ์",
        "phone": "123456789",
        "relation": "ลูกชาย"
      },
      "address": "กรุงเทพมหานคร",
      "medical": {
        "conditions": ["หอบหืด", "เจ็บเข่า"],
        "medications": ["para"],
        "allergies": [],
        "notes": "ต้องกินยาหลังอาหารทุกวัน"
      },
      "mac": "20:E7:C8:68:B7:BE"
    }
  ]
}
```

---

### 7.2 ดึงข้อมูลผู้ป่วยรายคน: `GET /api/patients/:id` 🔒
* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:id` เช่น `PT-552246`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "PT-552246",
    "name": "สมชาย ใจดี",
    "age": 65,
    "gender": "ชาย",
    "bloodType": "O",
    "emergencyContact": {
      "name": "สมศักดิ์",
      "phone": "123456789",
      "relation": "ลูกชาย"
    },
    "address": "กรุงเทพมหานคร",
    "medical": {
      "conditions": ["หอบหืด", "เจ็บเข่า"],
      "medications": ["para"],
      "allergies": [],
      "notes": "ต้องกินยาหลังอาหารทุกวัน"
    },
    "mac": "20:E7:C8:68:B7:BE"
  }
}
```

---

### 7.3 ดึงรายการแจ้งเตือนฉุกเฉิน: `GET /api/alerts` 🔒
ดึงรายการแจ้งเตือนเหตุผิดปกติทั้งหมดจากแผ่นงาน `alerts` โดยเรียงจากเหตุการณ์ล่าสุดขึ้นก่อน

* **Auth Required**: 🔒 `Bearer <accessToken>`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "critical-PT-552246-1725432000000",
      "patientId": "PT-552246",
      "patientName": "สมชาย ใจดี",
      "type": "การล้ม (ผู้ป่วยล้ม)",
      "category": "emergency",
      "severity": "ระดับวิกฤต (แดง)",
      "severityClass": "critical",
      "status": "รอดำเนินการ",
      "statusClass": "pending",
      "timestamp": "2026-09-04T13:30:00.000Z",
      "location": "13.736717, 100.523186",
      "note": "ตรวจพบ: การล้ม (BPM: 95, Temp: 36.8°C)"
    }
  ]
}
```

---

### 7.4 จัดการ/ปิดสถานะการแจ้งเตือน: `PUT /api/alerts/:id/resolve` 🔒
อัปเดตสถานะของ Alert เมื่อได้รับการช่วยเหลือหรือตรวจสอบเรียบร้อยแล้ว (เปลี่ยนสถานะเป็น `จัดการแล้ว` / `resolved`)

* **Auth Required**: 🔒 `Bearer <accessToken>`
* **Path Parameter**: `:id` เช่น `critical-PT-552246-1725432000000`

#### ตัวอย่าง Response `200 OK`
```json
{
  "success": true,
  "message": "อัปเดตสถานะการแจ้งเตือนเรียบร้อยแล้ว"
}
```

---

## 📊 ตารางสรุปการ Mapping ข้อมูลกับ Google Sheets

| แผ่นงาน (Sheet Tab) | คอลัมน์ที่ใช้งาน | ฟังก์ชัน / Endpoint ที่เชื่อมโยง |
|---|---|---|
| **`accounts`** | `username`, `password`, `create_at`, `role`, `status`, `mac` | `/api/auth/login`, `/api/auth/me`, `/api/devices/bind` |
| **`staff`** | `email`, `password`, `name`, `role`, `status` | `/api/auth/login` (สำหรับเจ้าหน้าที่/หมอ) |
| **`patients`** | `id`, `name`, `age`, `gender`, `bloodType`, `em_name`, `em_phone`, `em_relation`, `address`, `medical_conditions`, `medical_medications`, `medical_allergies`, `medical_notes`, `mac` | `/api/patients`, `/api/devices/bind`, `/api/devices/:mac` |
| **`Logs`** | `timestamp`, `mac`, `temp`, `avg_bpm`, `fall`, `lat`, `lng` | `/api/addDataESP`, `/api/realtime/:mac`, `/api/hourly/:mac`, `/api/weekly/:mac` |
| **`alerts`** | `id`, `patientId`, `patientName`, `type`, `category`, `severity`, `severityClass`, `status`, `statusClass`, `timestamp`, `location`, `note` | `/api/alerts`, `/api/alerts/:id/resolve`, Trigger อัตโนมัติจาก `/api/addDataESP` |
