const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth, requireRole } = require('../middlewares/auth');

/**
 * GET /api/patients 🔒 - ดึงรายชื่อผู้ป่วยทั้งหมด
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await googleSheets.getRows('patients!A2:N1000');

    // คอลัมน์: 0=id, 1=name, 2=age, 3=gender, 4=bloodType, 5=em_name, 6=em_phone, 7=em_relation, 8=address, 9=medical_conditions, 10=medical_medications, 11=medical_allergies, 12=medical_notes, 13=mac
    const patients = rows
      .filter(row => row[0])
      .map(row => ({
        id: row[0] || '',
        name: row[1] || '',
        age: parseInt(row[2]) || null,
        gender: row[3] || '',
        bloodType: row[4] || '',
        emergencyContact: {
          name: row[5] || '',
          phone: row[6] || '',
          relation: row[7] || ''
        },
        address: row[8] || '',
        medical: {
          conditions: row[9] ? row[9].split(',').map(s => s.trim()) : [],
          medications: row[10] ? row[10].split(',').map(s => s.trim()) : [],
          allergies: row[11] ? row[11].split(',').map(s => s.trim()) : [],
          notes: row[12] || ''
        },
        mac: row[13] || null
      }));

    return res.json({
      success: true,
      data: patients
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย',
      error: error.message
    });
  }
});

/**
 * GET /api/patients/:id 🔒 - ดึงข้อมูลผู้ป่วยรายคน
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id.trim().toLowerCase();
    const rows = await googleSheets.getRows('patients!A2:N1000');
    const patient = rows.find(row => row[0] && row[0].trim().toLowerCase() === targetId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: `ไม่พบข้อมูลผู้ป่วยรหัส ${req.params.id}`
      });
    }

    return res.json({
      success: true,
      data: {
        id: patient[0] || '',
        name: patient[1] || '',
        age: parseInt(patient[2]) || null,
        gender: patient[3] || '',
        bloodType: patient[4] || '',
        emergencyContact: {
          name: patient[5] || '',
          phone: patient[6] || '',
          relation: patient[7] || ''
        },
        address: patient[8] || '',
        medical: {
          conditions: patient[9] ? patient[9].split(',').map(s => s.trim()) : [],
          medications: patient[10] ? patient[10].split(',').map(s => s.trim()) : [],
          allergies: patient[11] ? patient[11].split(',').map(s => s.trim()) : [],
          notes: patient[12] || ''
        },
        mac: patient[13] || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย',
      error: error.message
    });
  }
});

module.exports = router;
