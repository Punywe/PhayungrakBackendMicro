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
 * 5.2 GET /api/weekly/:mac 🔒
 * ข้อมูลเฉลี่ยย้อนหลัง 7 วัน (7 data points)
 */
router.get('/:mac', requireAuth, checkMacAccess, async (req, res) => {
  try {
    const targetMac = req.params.mac.trim().toLowerCase();
    const rows = await googleSheets.getRows('Logs!A2:G10000');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    // กรองและแปลงข้อมูล
    const userLogs = rows
      .filter(row => row[1] && row[1].trim().toLowerCase() === targetMac)
      .map(row => ({
        timestamp: parseDate(row[0]),
        temp: parseFloat(row[2]) || 0,
        avg_bpm: parseInt(row[3]) || 0,
        fall: row[4] || 'ปกติ',
        lat: parseFloat(row[5]) || 0,
        lng: parseFloat(row[6]) || 0
      }))
      .filter(item => item.timestamp && item.timestamp >= sevenDaysAgo);

    // สร้าง Bucket สำหรับ 7 วันย้อนหลัง
    const dailyGroups = {};
    for (let i = 0; i < 7; i++) {
      const dayBucket = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const key = `${dayBucket.getFullYear()}-${String(dayBucket.getMonth() + 1).padStart(2, '0')}-${String(dayBucket.getDate()).padStart(2, '0')}`;
      dailyGroups[key] = [];
    }

    userLogs.forEach(item => {
      const t = item.timestamp;
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      if (dailyGroups[key]) {
        dailyGroups[key].push(item);
      }
    });

    // คำนวณหาค่าเฉลี่ย
    const weeklyData = Object.keys(dailyGroups).map(dateKey => {
      const group = dailyGroups[dateKey];
      if (group.length === 0) {
        return {
          date: dateKey,
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
        date: dateKey,
        temp: Math.round((totalTemp / group.length) * 10) / 10,
        avg_bpm: Math.round(totalBpm / group.length),
        fall_count: fallCount,
        has_data: true
      };
    }).reverse();

    return res.json({
      success: true,
      data: weeklyData
    });

  } catch (error) {
    console.error('Error in /api/weekly:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการคำนวณสถิติรายสัปดาห์',
      error: error.message
    });
  }
});

module.exports = router;
