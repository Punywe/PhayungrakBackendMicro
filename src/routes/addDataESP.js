const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');

// POST: /api/logs - บันทึกข้อมูลสุขภาพ/ตำแหน่งใหม่ลงในชีท Logs
router.post('/', async (req, res) => {
  try {
    const { mac, temp, avg_bpm, fall, lat, lng, timestamp } = req.body;

    // Validation ตรวจสอบข้อมูลบังคับ
    if (!mac) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ mac (MAC Address)'
      });
    }

    // กำหนดเวลาอัตโนมัติเพิ่ม +7 ชั่วโมง (เวลาปัจจุบันของประเทศไทย UTC+7)
    const now = new Date();
    const thaiDate = new Date((timestamp ? new Date(timestamp) : now).getTime() + (7 * 60 * 60 * 1000));
    const logTimestamp = thaiDate.toISOString();

    const fallStatus = fall !== undefined ? fall : 'ปกติ';
    const parsedTemp = temp !== undefined ? parseFloat(temp) : 0;
    const parsedBpm = avg_bpm !== undefined ? parseInt(avg_bpm) : 0;
    const parsedLat = lat !== undefined ? parseFloat(lat) : 0;
    const parsedLng = lng !== undefined ? parseFloat(lng) : 0;

    // สร้างข้อมูล 1 แถวเพื่อต่อท้ายใน Google Sheet ตามลำดับคอลัมน์ A ถึง G
    // คอลัมน์: [timestamp, mac, temp, avg_bpm, fall, lat, lng]
    const newRow = [
      logTimestamp,
      mac.trim(),
      parsedTemp,
      parsedBpm,
      fallStatus,
      parsedLat,
      parsedLng
    ];

    // เขียนข้อมูลต่อท้ายสุดในแผ่นงาน Logs ช่วง A ถึง G
    await googleSheets.appendRow('Logs!A:G', [newRow]);

    res.status(201).json({
      success: true,
      message: 'บันทึกข้อมูลสำเร็จ',
      data: {
        timestamp: logTimestamp,
        mac: mac.trim(),
        temp: parsedTemp,
        avg_bpm: parsedBpm,
        fall: fallStatus,
        lat: parsedLat,
        lng: parsedLng
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Google Sheets',
      error: error.message
    });
  }
});

module.exports = router;
