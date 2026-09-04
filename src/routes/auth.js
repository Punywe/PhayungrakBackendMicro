const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const {
  generateAccessToken,
  generateRefreshToken,
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
    let userRowIndex = -1;
    let userSheetName = null;

    // 1. ค้นหาในแผ่นงาน accounts (แถว A2:H) -> username, password, create_at, role, status, mac, refresh_token, refresh_token_expires_at
    try {
      const accountRows = await googleSheets.getRows('accounts!A2:H1000');
      const userIndex = accountRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === username.trim().toLowerCase());

      if (userIndex !== -1) {
        const row = accountRows[userIndex];
        userRowIndex = userIndex + 2;
        userSheetName = 'accounts';
        foundUser = {
          id: `ACC-${userRowIndex}`,
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

    // 2. ถ้าไม่พบใน accounts ให้ลองหาในชีท admin_accounts (A2:G) -> email, password, name, role, status, refresh_token, refresh_token_expires_at
    if (!foundUser) {
      try {
        const staffRows = await googleSheets.getRows('admin_accounts!A2:G100');
        const staffIndex = staffRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === username.trim().toLowerCase());

        if (staffIndex !== -1) {
          const row = staffRows[staffIndex];
          userRowIndex = staffIndex + 2;
          userSheetName = 'admin_accounts';
          foundUser = {
            id: `ADM-${userRowIndex}`,
            username: row[0].trim(),
            password: row[1] || '',
            name: row[2] || '',
            role: row[3] || 'staff',
            status: row[4] || 'active',
            mac: null
          };
        }
      } catch (e) {
        console.warn('⚠️ ไม่สามารถดึงชีท admin_accounts ได้:', e.message);
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
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_SEC * 1000).toISOString();

    // บันทึก Refresh Token ลง Google Sheets ทันที
    try {
      if (userSheetName === 'accounts') {
        await googleSheets.updateRow(`accounts!G${userRowIndex}:H${userRowIndex}`, [[refreshToken, refreshTokenExpiresAt]]);
      } else if (userSheetName === 'admin_accounts') {
        await googleSheets.updateRow(`admin_accounts!F${userRowIndex}:G${userRowIndex}`, [[refreshToken, refreshTokenExpiresAt]]);
      }
    } catch (saveErr) {
      console.warn('⚠️ ไม่สามารถบันทึก refresh token ลง Google Sheets:', saveErr.message);
    }

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
 * 1.2 POST /api/auth/refresh - ขอ Access Token ใหม่ด้วย Refresh Token (Validate & Rotate ใน Sheet)
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ refreshToken'
      });
    }

    const cleanRefreshToken = refreshToken.trim();
    let foundUser = null;
    let userRowIndex = -1;
    let userSheetName = null;

    // 1. ค้นหาในชีท accounts (คอลัมน์ G คือ refresh_token, index 6)
    try {
      const accountRows = await googleSheets.getRows('accounts!A2:H1000');
      const userIndex = accountRows.findIndex(row => row[6] && row[6].trim() === cleanRefreshToken);

      if (userIndex !== -1) {
        const row = accountRows[userIndex];
        userRowIndex = userIndex + 2;
        userSheetName = 'accounts';
        foundUser = {
          id: `ACC-${userRowIndex}`,
          username: row[0] ? row[0].trim() : '',
          role: row[3] || 'caregiver',
          status: row[4] || 'active',
          mac: row[5] ? row[5].trim() : null,
          refreshTokenExpiresAt: row[7] || ''
        };
      }
    } catch (e) {
      console.warn('⚠️ เกิดข้อผิดพลาดในการค้นหา token ใน accounts:', e.message);
    }

    // 2. ถ้าไม่พบใน accounts ให้ค้นหาใน admin_accounts (คอลัมน์ F คือ refresh_token, index 5)
    if (!foundUser) {
      try {
        const adminRows = await googleSheets.getRows('admin_accounts!A2:G100');
        const adminIndex = adminRows.findIndex(row => row[5] && row[5].trim() === cleanRefreshToken);

        if (adminIndex !== -1) {
          const row = adminRows[adminIndex];
          userRowIndex = adminIndex + 2;
          userSheetName = 'admin_accounts';
          foundUser = {
            id: `ADM-${userRowIndex}`,
            username: row[0] ? row[0].trim() : '',
            name: row[2] || '',
            role: row[3] || 'staff',
            status: row[4] || 'active',
            mac: null,
            refreshTokenExpiresAt: row[6] || ''
          };
        }
      } catch (e) {
        console.warn('⚠️ เกิดข้อผิดพลาดในการค้นหา token ใน admin_accounts:', e.message);
      }
    }

    // หากไม่พบ Refresh Token ในฐานข้อมูล
    if (!foundUser) {
      return res.status(401).json({
        success: false,
        message: 'refresh token ไม่ถูกต้อง'
      });
    }

    // ตรวจสอบวันหมดอายุ
    const expiresAt = foundUser.refreshTokenExpiresAt ? new Date(foundUser.refreshTokenExpiresAt).getTime() : 0;
    if (!expiresAt || Date.now() > expiresAt) {
      return res.status(401).json({
        success: false,
        message: 'refresh token หมดอายุ กรุณาเข้าสู่ระบบใหม่'
      });
    }

    // ตรวจสอบสถานะบัญชี
    if (foundUser.status.toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีถูกระงับการใช้งาน'
      });
    }

    // ผ่านการตรวจสอบ -> ออก Token คู่ใหม่ (Rotate Refresh Token)
    const userPayload = {
      id: foundUser.id,
      username: foundUser.username,
      name: foundUser.name || foundUser.username,
      role: foundUser.role,
      status: foundUser.status,
      mac: foundUser.mac
    };

    const newAccessToken = generateAccessToken(userPayload);
    const newRefreshToken = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_SEC * 1000).toISOString();

    // เขียน Token ใหม่ทับลงในแถวเดิม
    if (userSheetName === 'accounts') {
      await googleSheets.updateRow(`accounts!G${userRowIndex}:H${userRowIndex}`, [[newRefreshToken, newExpiresAt]]);
    } else if (userSheetName === 'admin_accounts') {
      await googleSheets.updateRow(`admin_accounts!F${userRowIndex}:G${userRowIndex}`, [[newRefreshToken, newExpiresAt]]);
    }

    return res.json({
      success: true,
      accessToken: newAccessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
      refreshToken: newRefreshToken,
      refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SEC
    });

  } catch (error) {
    console.error('Error in /api/auth/refresh:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการรีเฟรช token',
      error: error.message
    });
  }
});

/**
 * 1.3 POST /api/auth/logout - ออกจากระบบ (Revoke Refresh Token ใน Google Sheets)
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken && typeof refreshToken === 'string') {
      const cleanRefreshToken = refreshToken.trim();

      // ล้างในชีท accounts
      try {
        const accountRows = await googleSheets.getRows('accounts!A2:H1000');
        const userIndex = accountRows.findIndex(row => row[6] && row[6].trim() === cleanRefreshToken);
        if (userIndex !== -1) {
          const rowIndex = userIndex + 2;
          await googleSheets.updateRow(`accounts!G${rowIndex}:H${rowIndex}`, [['', '']]);
        }
      } catch (e) {
        console.warn('⚠️ ไม่สามารถล้าง refresh token ใน accounts ได้:', e.message);
      }

      // ล้างในชีท admin_accounts
      try {
        const adminRows = await googleSheets.getRows('admin_accounts!A2:G100');
        const adminIndex = adminRows.findIndex(row => row[5] && row[5].trim() === cleanRefreshToken);
        if (adminIndex !== -1) {
          const rowIndex = adminIndex + 2;
          await googleSheets.updateRow(`admin_accounts!F${rowIndex}:G${rowIndex}`, [['', '']]);
        }
      } catch (e) {
        console.warn('⚠️ ไม่สามารถล้าง refresh token ใน admin_accounts ได้:', e.message);
      }
    }

    return res.json({
      success: true,
      message: 'ออกจากระบบเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error in /api/auth/logout:', error);
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

