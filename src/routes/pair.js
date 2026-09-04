const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  generateAccessToken,
  generateRefreshToken,
  generatePairingTokenString,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  PAIRING_TOKEN_EXPIRES_IN_SEC
} = require('../utils/token');

/**
 * 2.1 POST /api/pair/create 🔒 (role: caregiver/carer/admin/staff)
 * ผู้ดูแลกดสร้าง QR ในแอป → ขอ pairing token อายุสั้น 5 นาที (300 วินาที)
 */
router.post('/create', requireAuth, requireRole(['caregiver', 'carer', 'admin', 'staff', 'doctor', 'หมอ']), async (req, res) => {
  try {
    const caregiverUser = req.user;
    const caregiverId = caregiverUser.id || '';
    const caregiverName = caregiverUser.name || caregiverUser.username || 'ผู้ดูแล';

    const token = generatePairingTokenString();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + PAIRING_TOKEN_EXPIRES_IN_SEC * 1000).toISOString();

    // บันทึกลงแผ่นงาน pairing_tokens คอลัมน์ A ถึง H:
    // [token, caregiver_id, caregiver_name, created_at, expires_at, used, redeemed_by, redeemed_at]
    await googleSheets.appendRow('pairing_tokens!A:H', [[
      token,
      caregiverId,
      caregiverName,
      createdAt,
      expiresAt,
      'FALSE',
      '',
      ''
    ]]);

    return res.json({
      success: true,
      pairingToken: token,
      expiresIn: PAIRING_TOKEN_EXPIRES_IN_SEC,
      caregiverId: caregiverId,
      caregiverName: caregiverName
    });

  } catch (error) {
    console.error('Error in /api/pair/create:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้าง Pairing Token',
      error: error.message
    });
  }
});

/**
 * 2.2 POST /api/pair/redeem
 * ผู้สูงอายุสแกน QR แล้ว → แลก pairing token เป็น session จริงของผู้สูงอายุ พร้อมผูก MAC Address กลับเข้าบัญชีผู้ดูแล
 */
router.post('/redeem', async (req, res) => {
  try {
    const { pairingToken } = req.body;

    if (!pairingToken || typeof pairingToken !== 'string' || pairingToken.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ pairingToken'
      });
    }

    const cleanPairingToken = pairingToken.trim();

    // 1. ตรวจสอบโทเคนในแผ่นงาน pairing_tokens
    const pairRows = await googleSheets.getRows('pairing_tokens!A2:H1000');
    const pairIndex = pairRows.findIndex(row => row[0] && row[0].trim() === cleanPairingToken);

    if (pairIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'QR ไม่ถูกต้อง'
      });
    }

    const pairRow = pairRows[pairIndex];
    const isUsed = pairRow[5] === true || String(pairRow[5]).toUpperCase() === 'TRUE';
    if (isUsed) {
      return res.status(400).json({
        success: false,
        message: 'QR นี้ถูกใช้ไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่'
      });
    }

    const expiresAt = pairRow[4] ? new Date(pairRow[4]).getTime() : 0;
    if (!expiresAt || Date.now() > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'QR หมดอายุแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่'
      });
    }

    const caregiverId = pairRow[1] || '';
    const caregiverName = pairRow[2] || '';
    const tokenRowIndex = pairIndex + 2;
    const redeemedAt = new Date().toISOString();

    // 2. ค้นหาข้อมูลบัญชีผู้ป่วย/ผู้สูงอายุในชีท accounts
    const accountRows = await googleSheets.getRows('accounts!A2:H1000');
    let elderAccount = null;
    let elderRowIndex = -1;

    // หาแถวที่มี role เป็น patient หรือ elder
    const elderIndex = accountRows.findIndex(row => {
      const role = (row[3] || '').toLowerCase();
      return role === 'patient' || role === 'elder' || role === 'ผู้ป่วย' || role === 'ผู้สูงอายุ';
    });

    if (elderIndex !== -1) {
      const elderRow = accountRows[elderIndex];
      elderRowIndex = elderIndex + 2;
      elderAccount = {
        id: `ACC-${elderRowIndex}`,
        username: elderRow[0] ? elderRow[0].trim() : `elder_${elderRowIndex}`,
        role: 'patient',
        status: elderRow[4] || 'active',
        mac: elderRow[5] ? elderRow[5].trim() : null
      };
    } else {
      // หากไม่พบใน accounts ให้ดึงจากชีท Patients
      try {
        const patientRows = await googleSheets.getRows('Patients!A2:N1000');
        if (patientRows.length > 0 && patientRows[0][0]) {
          elderAccount = {
            id: patientRows[0][0].trim(),
            username: patientRows[0][1] ? patientRows[0][1].trim() : 'patient1',
            role: 'patient',
            status: 'active',
            mac: patientRows[0][13] ? patientRows[0][13].trim() : null
          };
        }
      } catch (pe) {
        console.warn('⚠️ ไม่สามารถดึงชีท Patients ได้:', pe.message);
      }

      if (!elderAccount) {
        elderAccount = {
          id: 'ACC-2',
          username: 'patient1',
          role: 'patient',
          status: 'active',
          mac: '20:E7:C8:68:B7:BE'
        };
      }
    }

    // 3. ทำเครื่องหมายว่า Pairing Token ถูกใช้งานแล้ว
    await googleSheets.updateRow(`pairing_tokens!F${tokenRowIndex}:H${tokenRowIndex}`, [['TRUE', elderAccount.id, redeemedAt]]);

    // 4. 🔑 ผูก MAC เข้ากับบัญชีของผู้ดูแลอัตโนมัติ (จุดสำคัญที่สุด)
    if (elderAccount.mac) {
      let caregiverRowIndex = -1;

      // ค้นหาแถวของผู้ดูแลจาก caregiverId หรือ caregiverName
      if (caregiverId.startsWith('ACC-')) {
        const parsedIndex = parseInt(caregiverId.replace('ACC-', ''));
        if (!isNaN(parsedIndex) && parsedIndex >= 2) {
          caregiverRowIndex = parsedIndex;
        }
      }

      if (caregiverRowIndex === -1) {
        const cIndex = accountRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === caregiverName.trim().toLowerCase());
        if (cIndex !== -1) {
          caregiverRowIndex = cIndex + 2;
        }
      }

      if (caregiverRowIndex !== -1) {
        try {
          await googleSheets.updateRow(`accounts!F${caregiverRowIndex}:F${caregiverRowIndex}`, [[elderAccount.mac]]);
        } catch (macErr) {
          console.warn('⚠️ ผูก mac เข้าบัญชีผู้ดูแลไม่สำเร็จ:', macErr.message);
        }
      }
    }

    // 5. ออก Token สำหรับผู้สูงอายุ และบันทึก refresh token ลงชีท accounts
    const elderPayload = {
      id: elderAccount.id,
      username: elderAccount.username,
      name: elderAccount.username,
      role: elderAccount.role,
      status: elderAccount.status,
      mac: elderAccount.mac
    };

    const elderAccessToken = generateAccessToken(elderPayload);
    const elderRefreshToken = generateRefreshToken();
    const elderRefreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_SEC * 1000).toISOString();

    if (elderRowIndex !== -1) {
      try {
        await googleSheets.updateRow(`accounts!G${elderRowIndex}:H${elderRowIndex}`, [[elderRefreshToken, elderRefreshTokenExpiresAt]]);
      } catch (erErr) {
        console.warn('⚠️ บันทึก refresh token ของ elder ไม่สำเร็จ:', erErr.message);
      }
    }

    return res.json({
      success: true,
      elder: {
        id: elderAccount.id,
        caregiverId: caregiverId,
        caregiverName: caregiverName,
        mac: elderAccount.mac
      },
      accessToken: elderAccessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
      refreshToken: elderRefreshToken,
      refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SEC
    });

  } catch (error) {
    console.error('Error in /api/pair/redeem:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการแลกรับสิทธิ์ Pairing QR',
      error: error.message
    });
  }
});

module.exports = router;

