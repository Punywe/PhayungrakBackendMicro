const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');

// ฟังก์ชันช่วยย่อย (Helper) เพื่อแปลงวันเวลา
function parseDate(dateStr) {
  try {
    return new Date(dateStr);
  } catch (e) {
    return null;
  }
}

// GET: /api/hourly/:mac - ข้อมูลย้อนหลัง 24 ชม. เฉลี่ยรายชั่วโมง
router.get('/:mac', async (req, res) => {
  try {
    const targetMac = req.params.mac;
    const rows = await googleSheets.getRows('Logs!A2:H10000');

    // กรองเฉพาะ MAC และข้อมูลที่อยู่ใน 24 ชั่วโมงที่ผ่านมา
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const userLogs = rows
      .filter(row => row[1] && row[1].trim().toLowerCase() === targetMac.trim().toLowerCase())
      .map(row => ({
        timestamp: parseDate(row[0]),
        mac: row[1] || '',
        temp: parseFloat(row[2]) || 0,
        avg_bpm: parseInt(row[3]) || 0,
        fall: row[4] || 'ปกติ',
        lat: parseFloat(row[5]) || 0,
        lng: parseFloat(row[6]) || 0
      }))
      .filter(item => item.timestamp && item.timestamp >= oneDayAgo);

    if (userLogs.length === 0) {
      return res.json({
        success: true,
        message: 'ไม่พบข้อมูลในช่วง 24 ชั่วโมงที่ผ่านมา',
        data: []
      });
    }

    // จัดกลุ่มข้อมูลรายชั่วโมง (0-23)
    const hourlyGroups = {};
    for (let i = 0; i < 24; i++) {
      const timeBucket = new Date(now.getTime() - (i * 60 * 60 * 1000));
      const key = `${timeBucket.getFullYear()}-${String(timeBucket.getMonth() + 1).padStart(2, '0')}-${String(timeBucket.getDate()).padStart(2, '0')} ${String(timeBucket.getHours()).padStart(2, '0')}:00`;
      hourlyGroups[key] = [];
    }

    userLogs.forEach(item => {
      const t = item.timestamp;
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:00`;
      if (hourlyGroups[key]) {
        hourlyGroups[key].push(item);
      }
    });

    // คำนวณค่าเฉลี่ย
    const hourlyData = Object.keys(hourlyGroups).map(hourKey => {
      const group = hourlyGroups[hourKey];
      if (group.length === 0) {
        return {
          time: hourKey,
          temp: 0,
          avg_bpm: 0,
          fall_count: 0,
          lat: 0,
          lng: 0,
          has_data: false
        };
      }

      const totalTemp = group.reduce((sum, item) => sum + item.temp, 0);
      const totalBpm = group.reduce((sum, item) => sum + item.avg_bpm, 0);
      const fallCount = group.filter(item => item.fall !== 'ปกติ').length;
      const latestItem = group[group.length - 1];

      return {
        time: hourKey,
        temp: Math.round((totalTemp / group.length) * 10) / 10,
        avg_bpm: Math.round(totalBpm / group.length),
        fall_count: fallCount,
        lat: latestItem.lat,
        lng: latestItem.lng,
        has_data: true
      };
    }).reverse();

    res.json({
      success: true,
      message: 'ดึงข้อมูลเฉลี่ยรายชั่วโมงย้อนหลัง 24 ชม. สำเร็จ',
      data: hourlyData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการคำนวณรายชั่วโมง',
      error: error.message
    });
  }
});

module.exports = router;
