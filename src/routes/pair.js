const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const { generatePairingToken, redeemPairingToken } = require('../utils/token');

/**
 * 2.1 POST /api/pair/create 🔒 (role: caregiver)
 * ผู้ดูแลกดสร้าง QR ในแอป → ขอ pairing token อายุสั้น 5 นาที (300 วินาที)
 */
router.post('/create', requireAuth, requireRole(['caregiver', 'carer', 'admin', 'staff']), (req, res) => {
  try {
    const caregiverUser = req.user;

    const pairingData = generatePairingToken({
      id: caregiverUser.id,
      name: caregiverUser.name || caregiverUser.username,
      username: caregiverUser.username,
      mac: caregiverUser.mac,
      patientId: caregiverUser.patientId
    });

    return res.json({
      success: true,
      pairingToken: pairingData.pairingToken,
      expiresIn: pairingData.expiresIn,
      caregiverId: pairingData.caregiverId,
      caregiverName: pairingData.caregiverName
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้าง Pairing Token',
      error: error.message
    });
  }
});

/**
 * 2.2 POST /api/pair/redeem
 * ผู้สูงอายุสแกน QR แล้ว → แลก pairing token เป็น session จริงของผู้สูงอายุ
 */
router.post('/redeem', (req, res) => {
  try {
    const { pairingToken } = req.body;

    if (!pairingToken) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ pairingToken'
      });
    }

    const redeemResult = redeemPairingToken(pairingToken);

    if (!redeemResult.success) {
      return res.status(400).json({
        success: false,
        message: redeemResult.message || 'QR นี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่'
      });
    }

    return res.json({
      success: true,
      elder: redeemResult.elder,
      accessToken: redeemResult.accessToken,
      accessTokenExpiresIn: redeemResult.accessTokenExpiresIn,
      refreshToken: redeemResult.refreshToken,
      refreshTokenExpiresIn: redeemResult.refreshTokenExpiresIn
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการแลกรับสิทธิ์ Pairing QR',
      error: error.message
    });
  }
});

module.exports = router;
