const express = require('express');
const router = express.Router();

// นำเข้า (Import) routes ย่อยๆ
const exampleRouter = require('./example');
const authRouter = require('./auth');
const realtimeRouter = require('./realtime');
const hourlyRouter = require('./hourly');
const weeklyRouter = require('./weekly');
const addDataESP = require('./addDataESP');

// หน้าแรกสุดของ API (เอาไว้ทดสอบระบบ)
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    message: 'Backend Service is running smoothly',
    timestamp: new Date().toISOString()
  });
});

// เชื่อมเส้นทาง API (สามารถเพิ่มชุดใหม่ๆ ตรงนี้ได้เลยเมื่อมีไฟล์เพิ่มขึ้น)
router.use('/example', exampleRouter);
router.use('/auth', authRouter);
router.use('/realtime', realtimeRouter);
router.use('/hourly', hourlyRouter);
router.use('/weekly', weeklyRouter);
router.use('/addDataESP', addDataESP);

// ส่งออก router หลัก
module.exports = router;
