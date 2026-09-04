const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth } = require('../middlewares/auth');

/**
 * GET /api/alerts 🔒 - ดึงรายการแจ้งเตือนทั้งหมด
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await googleSheets.getRows('alerts!A2:L1000');

    const alerts = rows
      .filter(row => row[0])
      .map(row => ({
        id: row[0] || '',
        patientId: row[1] || '',
        patientName: row[2] || '',
        type: row[3] || '',
        category: row[4] || '',
        severity: row[5] || '',
        severityClass: row[6] || '',
        status: row[7] || '',
        statusClass: row[8] || '',
        timestamp: row[9] || '',
        location: row[10] || '',
        note: row[11] || ''
      }))
      .reverse(); // เอาเหตุการณ์ล่าสุดขึ้นก่อน

    return res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงรายการแจ้งเตือน',
      error: error.message
    });
  }
});

/**
 * PUT /api/alerts/:id/resolve 🔒 - จัดการ/ปิดสถานะการแจ้งเตือน
 */
router.put('/:id/resolve', requireAuth, async (req, res) => {
  try {
    const alertId = req.params.id.trim().toLowerCase();
    const rows = await googleSheets.getRows('alerts!A2:L1000');

    const alertIndex = rows.findIndex(row => row[0] && row[0].trim().toLowerCase() === alertId);

    if (alertIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `ไม่พบรายการแจ้งเตือนรหัส ${req.params.id}`
      });
    }

    const rowIndex = alertIndex + 2;
    // อัปเดต status (H) เป็น 'จัดการแล้ว' และ statusClass (I) เป็น 'resolved'
    await googleSheets.updateRow(`alerts!H${rowIndex}:I${rowIndex}`, [['จัดการแล้ว', 'resolved']]);

    return res.json({
      success: true,
      message: 'อัปเดตสถานะการแจ้งเตือนเรียบร้อยแล้ว'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะแจ้งเตือน',
      error: error.message
    });
  }
});

module.exports = router;
