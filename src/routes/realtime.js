const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth, checkMacAccess } = require('../middlewares/auth');

/**
 * GET /api/realtime/:mac 🔒 - ดึงข้อมูลล่าสุด (Real-time) ของ MAC Address
 */
router.get('/:mac', requireAuth, checkMacAccess, async (req, res) => {
  try {
    const targetMac = req.params.mac.trim().toLowerCase();

    // ดึงข้อมูลทั้งหมดจากชีท Logs (A2:G)
    const rows = await googleSheets.getRows('Logs!A2:G10000');

    // กรองเอาเฉพาะข้อมูลที่มี MAC ตรงกับที่ขอมา
    const userLogs = rows.filter(row => row[1] && row[1].trim().toLowerCase() === targetMac);

    if (userLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: `ไม่พบข้อมูลสำหรับ MAC Address: ${req.params.mac}`
      });
    }

    // ข้อมูลล่าสุดคือแถวสุดท้ายที่กรองมาได้
    const latestRow = userLogs[userLogs.length - 1];

    return res.json({
      success: true,
      message: 'ดึงข้อมูล Real-time ล่าสุดสำเร็จ',
      data: {
        timestamp: latestRow[0] || '',
        mac: latestRow[1] || '',
        temp: parseFloat(latestRow[2]) || 0,
        avg_bpm: parseInt(latestRow[3]) || 0,
        fall: latestRow[4] || 'ปกติ',
        lat: parseFloat(latestRow[5]) || 0,
        lng: parseFloat(latestRow[6]) || 0
      }
    });

  } catch (error) {
    console.error('Error in /api/realtime:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Real-time',
      error: error.message
    });
  }
});

module.exports = router;
