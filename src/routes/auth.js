const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');

// POST: /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. ตรวจสอบข้อมูลนำเข้าพื้นฐาน
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก username และ password'
      });
    }

    // 2. ดึงข้อมูลผู้ใช้ทั้งหมดจากแผ่นงาน 'accounts'
    // ข้อมูลเริ่มต้นที่ A2 (แถวแรก A1 คือ Header: username, password, create_at, role, status)
    const rows = await googleSheets.getRows('accounts!A2:E1000');

    // 3. ค้นหาบัญชีผู้ใช้ที่มี username ตรงกับที่ส่งมา
    const userIndex = rows.findIndex(row => row[0] && row[0].trim().toLowerCase() === username.trim().toLowerCase());

    if (userIndex === -1) {
      return res.status(401).json({
        success: false,
        message: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ'
      });
    }

    const userRow = rows[userIndex];
    const userId = userIndex + 2; // อ้างอิงแถวใน Google Sheet เพื่อใช้เป็น ID (เริ่มแถวแรกที่ 2)

    // โครงสร้างของข้อมูลแถว:
    // row[0] = username
    // row[1] = password (เปรียบเทียบตรงๆ หรือในอนาคตใช้ bcrypt)
    // row[2] = create_at
    // row[3] = role
    // row[4] = status
    const dbPassword = userRow[1];
    const dbRole = userRow[3] || 'user';
    const dbStatus = userRow[4] || 'active';

    // 4. ตรวจสอบสถานะบัญชี
    if (dbStatus.trim().toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน'
      });
    }

    // 5. ตรวจสอบรหัสผ่าน
    if (dbPassword !== password) {
      return res.status(401).json({
        success: false,
        message: 'รหัสผ่านไม่ถูกต้อง'
      });
    }

    // 6. ส่งข้อมูลผู้ใช้กลับไปเมื่อเข้าสู่ระบบสำเร็จ (สำหรับ Android ไปเซฟลง Session/SharedPreferences)
    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        id: userId, // ส่ง ID แถวคืนกลับไป
        username: username,
        role: dbRole,
        status: dbStatus
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูลเข้าสู่ระบบ',
      error: error.message
    });
  }
});

module.exports = router;
