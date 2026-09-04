const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth, checkMacAccess } = require('../middlewares/auth');

function parseDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}

/**
 * 5.1 GET /api/hourly/:mac 🔒
 * ดึงข้อมูลย้อนหลัง 24 ชม. แบ่งเฉลี่ยราย 1 ชม.
 */
router.get('/:mac', requireAuth, checkMacAccess, async (req, res) => {
  try {
    const targetMac = req.params.mac.trim().toLowerCase();
    const rows = await googleSheets.getRows('Logs!A2:G10000');

    // กรองเฉพาะ MAC ที่ระบุ และอยู่ในช่วง 24 ชั่วโมงที่ผ่านมา
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const userLogs = rows
      .filter(row => row[1] && row[1].trim().toLowerCase() === targetMac)
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

    // สร้าง Bucket 24 ชั่วโมง
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
          has_data: false
        };
      }

      const totalTemp = group.reduce((sum, item) => sum + item.temp, 0);
      const totalBpm = group.reduce((sum, item) => sum + item.avg_bpm, 0);
      const fallCount = group.filter(item => item.fall !== 'ปกติ' && item.fall !== 'normal' && item.fall !== '').length;

      return {
        time: hourKey,
        temp: Math.round((totalTemp / group.length) * 10) / 10,
        avg_bpm: Math.round(totalBpm / group.length),
        fall_count: fallCount,
        has_data: true
      };
    }).reverse();

    return res.json({
      success: true,
      data: hourlyData
    });

  } catch (error) {
    console.error('Error in /api/hourly:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการคำนวณสถิติรายชั่วโมง',
      error: error.message
    });
  }
});

module.exports = router;
