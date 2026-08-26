# Payoongrak Backend (Node.js + Google Sheets + Docker)

ระบบหลังบ้านแบบง่าย (Simplified Node.js Backend) สำหรับแอปพลิเคชัน Android โดยใช้ Google Sheets ทำหน้าที่เป็นฐานข้อมูล (Database)

---

## 📂 โครงสร้างโฟลเดอร์ (Directory Structure)

```text
payoongrak/
├── src/
│   ├── routes/          # แหล่งรวม API endpoints
│   │   ├── index.js     # ตัวรวมเส้นทาง API ทั้งหมด (Main Router)
│   │   └── example.js   # โค้ดตัวอย่างการ ดึง/เขียน/อัปเดต ข้อมูลลง Google Sheets
│   ├── utils/           # ฟังก์ชันอเนกประสงค์
│   │   └── googleSheets.js # ตัวช่วยเชื่อมต่อกับ Google Sheets API
│   └── server.js        # ไฟล์หลักในการเริ่มทำงาน (Entry Point)
├── .env                 # ไฟล์กำหนดค่าตัวแปรระบบ (สร้างตามแบบ .env.example)
├── Dockerfile           # กำหนดการสร้าง Container สำหรับ Backend
└── docker-compose.yml   # รันระบบทั้งหมดด้วยคำสั่งเดียว
```

---

## 🛠️ การเตรียมพร้อมก่อนรันระบบ (Prerequisites)

1. **เตรียม Google Sheet**:
   - สร้าง Google Sheet ใหม่ และคัดลอก **Spreadsheet ID** จาก URL (เช่น `https://docs.google.com/spreadsheets/d/⚡IDตรงนี้⚡/edit`)
   - จดค่า ID นั้นไว้
2. **สร้าง Service Account Key**:
   - ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
   - เปิดใช้งาน **Google Sheets API**
   - สร้าง **Credentials** แบบ **Service Account** และดาวน์โหลดไฟล์คีย์เป็นแบบ `.json`
   - เปลี่ยนชื่อไฟล์นั้นเป็น `credentials.json` และนำไปวางไว้ที่ root โฟลเดอร์ของโปรเจกต์นี้ (`payoongrak/credentials.json`)
   - **สำคัญ**: อย่าลืมเปิดแชร์สิทธิ์ Google Sheets ของคุณ (Share) ให้กับ Email ของ Service Account ที่ระบุอยู่ในไฟล์ json (ช่อง `client_email`) โดยกำหนดสิทธิ์เป็น **Editor**

3. **ตั้งค่า .env**:
   - คัดลอกไฟล์ `.env.example` แล้วเปลี่ยนชื่อเป็น `.env`
   - ใส่ ID ของ Google Sheets ที่คัดลอกมาในหัวข้อ `GOOGLE_SHEETS_SPREADSHEET_ID`

---

## 🚀 วิธีการรันระบบ (How to Run)

### ช่องทางที่ 1: รันด้วย Docker (แนะนำสำหรับขึ้น Production หรือทดสอบร่วมกัน)
เปิด Terminal ในโฟลเดอร์โปรเจกต์นี้ แล้วพิมพ์คำสั่ง:
```bash
docker compose up --build
```
ระบบจะสร้าง Container และจำลองสภาพแวดล้อม พร้อมรัน Backend ให้ทันทีที่พอร์ต `3000` (มีการรองรับ Hot-reload เซฟโค้ดแล้วรีสตาร์ทตัวเองให้ด้วย)

### ช่องทางที่ 2: รันแบบไม่ใช้ Docker (Local Node.js)
1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
2. รันแบบ Developer Mode (จะรีสตาร์ทตัวเองเมื่อเซฟไฟล์):
   ```bash
   npm run dev
   ```
3. รันแบบปกติ (Production Mode):
   ```bash
   npm start
   ```

---

## 📝 วิธีการเพิ่ม API endpoints ใหม่ (สำหรับ Junior Dev)

หากต้องการเพิ่ม API สำหรับตารางการทำงานใหม่ เช่น ระบบบทความ (Articles):

1. **สร้างไฟล์ Route**:
   สร้างไฟล์ใหม่ชื่อ `src/routes/article.js`
   ```javascript
   const express = require('express');
   const router = express.Router();
   const googleSheets = require('../utils/googleSheets'); // ดึงฟังก์ชันช่วยมาใช้

   router.get('/', async (req, res) => {
     try {
       // ดึงข้อมูลจากแผ่นงานที่ชื่อ 'Articles' ตั้งแต่แถว A2 ถึง E100
       const rows = await googleSheets.getRows('Articles!A2:E100');
       res.json({ success: true, data: rows });
     } catch (e) {
       res.status(500).json({ success: false, error: e.message });
     }
   });

   module.exports = router;
   ```

2. **เชื่อมกับ Router หลัก**:
   เปิดไฟล์ [src/routes/index.js](file:///c:/Code/payoongrak/src/routes/index.js) แล้วทำการ `require` และเชื่อม Route เข้าไป:
   ```javascript
   const articleRouter = require('./article');
   // ...
   router.use('/articles', articleRouter);
   ```
   ตอนนี้คุณก็จะได้ API เส้นใหม่พร้อมใช้งานที่ `http://localhost:3000/api/articles` ทันที!

---

## 📱 ตัวอย่างการเชื่อมต่อของ Android App

แอป Android สามารถเรียกข้อมูลผ่าน HTTP client เช่น Retrofit, Volley หรือ Ktor client โดยเรียกไปที่เครื่องแม่ข่าย:
- **Local Dev (Emulator)**: `http://10.0.2.2:3000/api/example` (IP `10.0.2.2` เป็น IP ชี้หาเครื่อง Host ของ Android Emulator)
- **Local Dev (เครื่องจริงเชื่อมต่อ WiFi เดียวกัน)**: ใช้ IP เครื่องคอมพิวเตอร์ของคุณ เช่น `http://192.168.1.XX:3000/api/example`
