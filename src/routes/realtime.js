const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');

// GET: /api/realtime/:mac - ดึงข้อมูลล่าสุด (Real-time) ของ MAC Address นั้นๆ
router.get('/:mac', async (req, res) => {
  try {
    const targetMac = req.params.mac; // เช่น 4A:75:A8:12:34:56 หรือ MAC Address

    // ดึงข้อมูลทั้งหมดจากชีท Logs (Header อยู่แถวแรก: timestamp, mac, temp, avg_bpm, fall, lat, lng, id)
    const rows = await googleSheets.getRows('Logs!A2:H10000');

    // กรองเอาเฉพาะข้อมูลที่มี mac ตรงกับที่ขอมา (คอลัมน์ B -> row[1])
    const userLogs = rows.filter(row => row[1] && row[1].trim().toLowerCase() === targetMac.trim().toLowerCase());

    if (userLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: `ไม่พบข้อมูลสำหรับ MAC Address: ${targetMac}`
      });
    }

    // ข้อมูลล่าสุดคือแถวสุดท้ายที่กรองมาได้
    const latestRow = userLogs[userLogs.length - 1];

    res.json({
      success: true,
      message: 'ดึงข้อมูล Real-time ล่าสุดสำเร็จ',
      data: {
        timestamp: latestRow[0] || '',
        mac: latestRow[1] || '',
        temp: parseFloat(latestRow[2]) || 0,
        avg_bpm: parseInt(latestRow[3]) || 0,
        fall: latestRow[4] || '',
        lat: parseFloat(latestRow[5]) || 0,
        lng: parseFloat(latestRow[6]) || 0,
        id: latestRow[7] || ''
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Real-time',
      error: error.message
    });
  }
});

module.exports = router;
