// โหลดการตั้งค่าจากไฟล์ .env
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN;
// Middleware พื้นฐานสำหรับจัดการข้อมูลที่ส่งเข้ามา
app.use(cors({
  origin: [frontendOrigin, 'http://localhost:3001']
})); // อนุญาตให้ Android App เรียกใช้งานได้
app.use(express.json()); // อ่านข้อมูล JSON จาก Body
app.use(express.urlencoded({ extended: true })); // อ่านข้อมูล Form URL-Encoded

// นำ API Router ทั้งหมดมาเชื่อมต่อที่พาร์ท /api
app.use('/api', apiRouter);

// หน้าโฮมเพจเริ่มต้นของ Backend (เมื่อเปิดผ่าน browser ตรงๆ)
app.get('/', (req, res) => {
  res.send('<h1>Payoongrak Backend Service is running!</h1><p>API Endpoint: <a href="/api/health">/api/health</a></p>');
});

// Middleware จัดการกรณีหา URL ไม่เจอ (404 Page Not Found)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'ไม่พบเส้นทาง API ที่คุณเรียกใช้งาน'
  });
});

// Middleware จัดการกรณีเกิด Server Error (500 Error)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในระบบหลังบ้าน (Internal Server Error)',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// เริ่มต้นเปิด Server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Server is running on port: ${PORT}`);
  console.log(`🔗 Local link: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`========================================`);
});
