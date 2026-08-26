const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');

// 1. GET: ดึงข้อมูลทั้งหมดจาก Google Sheet (ตัวอย่างเช่น ดึงจาก Sheet1 ช่วง A2:D100)
router.get('/', async (req, res) => {
  try {
    // สมมติว่ามี Sheet ชื่อ 'Sheet1'
    const rows = await googleSheets.getRows('Sheet1!A2:D100');
    
    // แปลงข้อมูลดิบจาก Google Sheets (Array) ให้เป็น JSON Object เพื่อให้ Android เอาไปใช้ง่ายขึ้น
    const dataList = rows.map((row, index) => ({
      id: index + 2, // อ้างอิงตาม Row Index ของ Google Sheet (แถวแรกเริ่มที่ 2 เพราะแถว 1 คือ Header)
      name: row[0] || '',
      email: row[1] || '',
      phone: row[2] || '',
      created_at: row[3] || ''
    }));

    res.json({
      success: true,
      message: 'ดึงข้อมูลสำเร็จ',
      data: dataList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
      error: error.message
    });
  }
});

// 2. POST: เพิ่มข้อมูลใหม่ลงใน Google Sheet
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // ตรวจสอบความถูกต้องเบื้องต้น (Validation)
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก name และ email'
      });
    }

    const createdAt = new Date().toISOString();
    const newRow = [name, email, phone, createdAt];

    // เขียนข้อมูลต่อท้ายสุดของแผ่นงาน Sheet1 ในคอลัมน์ A ถึง D
    await googleSheets.appendRow('Sheet1!A:D', [newRow]);

    res.json({
      success: true,
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
      error: error.message
    });
  }
});

// 3. PUT: อัปเดตข้อมูลในแถวที่กำหนด (ส่ง row หมายเลขแถวมาอัปเดต)
router.put('/:rowId', async (req, res) => {
  try {
    const { rowId } = req.params; // เช่น 2, 3, 4
    const { name, email, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก name และ email'
      });
    }

    const updatedAt = new Date().toISOString();
    const updatedRow = [name, email, phone, updatedAt];

    // ทำการแก้ไขข้อมูลที่แถวที่กำหนด เช่น Sheet1!A2:D2
    await googleSheets.updateRow(`Sheet1!A${rowId}:D${rowId}`, [updatedRow]);

    res.json({
      success: true,
      message: `อัปเดตข้อมูลที่แถว ${rowId} เรียบร้อย`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล',
      error: error.message
    });
  }
});

module.exports = router;
