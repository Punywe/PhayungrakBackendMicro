const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_EXPIRES_IN_SEC
} = require('../utils/token');
const { requireAuth } = require('../middlewares/auth');

/**
 * 1.1 POST /api/auth/login - เข้าสู่ระบบ
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน'
      });
    }

    let foundUser = null;
    let userId = null;

    // 1. ค้นหาในแผ่นงาน accounts (แถว A2:F) -> username, password, create_at, role, status, mac
    try {
      const accountRows = await googleSheets.getRows('accounts!A2:F1000');
      const userIndex = accountRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === username.trim().toLowerCase());

      if (userIndex !== -1) {
        const row = accountRows[userIndex];
        userId = `ACC-${userIndex + 2}`;
        foundUser = {
          id: userId,
          username: row[0].trim(),
          password: row[1] || '',
          create_at: row[2] || '',
          role: row[3] || 'caregiver',
          status: row[4] || 'active',
          mac: row[5] ? row[5].trim() : null
        };
      }
    } catch (e) {
      console.warn('⚠️ ไม่สามารถดึงชีท accounts ได้:', e.message);
    }

    // 2. ถ้าไม่พบใน accounts ให้ลองหาในชีท staff (A2:E) -> email, password, name, role, status
    if (!foundUser) {
      try {
        const staffRows = await googleSheets.getRows('staff!A2:E100');
        const staffIndex = staffRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === username.trim().toLowerCase());

        if (staffIndex !== -1) {
          const row = staffRows[staffIndex];
          userId = `STF-${staffIndex + 2}`;
          foundUser = {
            id: userId,
            username: row[0].trim(),
            password: row[1] || '',
            name: row[2] || '',
            role: row[3] || 'staff',
            status: row[4] || 'active',
            mac: null
          };
        }
      } catch (e) {
        console.warn('⚠️ ไม่สามารถดึงชีท staff ได้:', e.message);
      }
    }

    // หากไม่พบบัญชีใดๆ
    if (!foundUser) {
      return res.status(401).json({
        success: false,
        message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // ตรวจสอบสถานะบัญชี
    if (foundUser.status.toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีถูกระงับการใช้งาน'
      });
    }

    // ตรวจสอบรหัสผ่าน
    if (foundUser.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // สร้าง Token
    const userPayload = {
      id: foundUser.id,
      username: foundUser.username,
      name: foundUser.name || foundUser.username,
      role: foundUser.role,
      status: foundUser.status,
      mac: foundUser.mac
    };

    const accessToken = generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken(userPayload);

    return res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: foundUser.id,
        username: foundUser.username,
        role: foundUser.role,
        status: foundUser.status,
        mac: foundUser.mac
      },
      accessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
      refreshToken,
      refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SEC
    });

  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลเข้าสู่ระบบ',
      error: error.message
    });
  }
});

/**
 * 1.2 POST /api/auth/refresh - ขอ Access Token ใหม่ด้วย Refresh Token
 */
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ refreshToken'
      });
    }

    const rotated = rotateRefreshToken(refreshToken);

    if (!rotated) {
      return res.status(401).json({
        success: false,
        message: 'session หมดอายุ กรุณาเข้าสู่ระบบใหม่'
      });
    }

    return res.json({
      success: true,
      accessToken: rotated.accessToken,
      accessTokenExpiresIn: rotated.accessTokenExpiresIn,
      refreshToken: rotated.refreshToken,
      refreshTokenExpiresIn: rotated.refreshTokenExpiresIn
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการรีเฟรช token',
      error: error.message
    });
  }
});

/**
 * 1.3 POST /api/auth/logout - ออกจากระบบ
 */
router.post('/logout', requireAuth, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      revokeRefreshToken(refreshToken);
    }

    return res.json({
      success: true,
      message: 'ออกจากระบบเรียบร้อยแล้ว'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการออกจากระบบ',
      error: error.message
    });
  }
});

/**
 * 1.4 GET /api/auth/me - ยืนยันตัวตนและดึงข้อมูลโปรไฟล์ปัจจุบัน
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const currentUser = req.user;

    return res.json({
      success: true,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        status: 'active',
        mac: currentUser.mac
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีผู้ใช้',
      error: error.message
    });
  }
});

module.exports = router;
