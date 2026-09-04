const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth, requireRole } = require('../middlewares/auth');

/**
 * 3.1 POST /api/devices/bind 🔒 (role: staff/admin)
 * ผูก MAC Address กับผู้ป่วย
 */
router.post('/bind', requireAuth, requireRole(['staff', 'admin', 'doctor', 'หมอ']), async (req, res) => {
  try {
    const { mac, patientId } = req.body;

    if (!mac || !patientId) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ mac และ patientId'
      });
    }

    const cleanMac = mac.trim();
    const cleanPatientId = patientId.trim();

    // 1. ดึงข้อมูลจากชีท patients (A2:N1000)
    // คอลัมน์: A=id, B=name, C=age, D=gender, E=bloodType, F=em_name, G=em_phone, H=em_relation, I=address, J=medical_conditions, K=medical_medications, L=medical_allergies, M=medical_notes, N=mac
    const patientRows = await googleSheets.getRows('patients!A2:N1000');

    // ตรวจสอบว่า MAC นี้ถูกผูกกับผู้ป่วยรายอื่นอยู่หรือไม่ (MAC อยู่คอลัมน์ N -> index 13)
    const existingBindingIndex = patientRows.findIndex(row => {
      const rowMac = row[13] ? row[13].trim().toLowerCase() : '';
      const rowId = row[0] ? row[0].trim().toLowerCase() : '';
      return rowMac === cleanMac.toLowerCase() && rowId !== cleanPatientId.toLowerCase();
    });

    if (existingBindingIndex !== -1) {
      return res.status(409).json({
        success: false,
        message: 'MAC นี้ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว'
      });
    }

    // หาแถวของผู้ป่วยคนนี้เพื่ออัปเดต MAC
    const targetPatientIndex = patientRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === cleanPatientId.toLowerCase());

    if (targetPatientIndex !== -1) {
      const rowIndex = targetPatientIndex + 2; // แถวในชีท (แถว 1 คือ Header)
      await googleSheets.updateRow(`patients!N${rowIndex}:N${rowIndex}`, [[cleanMac]]);
    }

    // 2. อัปเดต MAC ในชีท accounts ด้วยหากมี (คอลัมน์ F -> index 5)
    try {
      const accountRows = await googleSheets.getRows('accounts!A2:F1000');
      const targetAccountIndex = accountRows.findIndex(row => row[0] && row[0].trim().toLowerCase() === cleanPatientId.toLowerCase());

      if (targetAccountIndex !== -1) {
        const accRowIndex = targetAccountIndex + 2;
        await googleSheets.updateRow(`accounts!F${accRowIndex}:F${accRowIndex}`, [[cleanMac]]);
      }
    } catch (e) {
      console.warn('⚠️ อัปเดต accounts!F ไม่สำเร็จ:', e.message);
    }

    return res.json({
      success: true,
      message: 'ผูกอุปกรณ์ MAC Address กับผู้ป่วยสำเร็จ',
      data: {
        mac: cleanMac,
        patientId: cleanPatientId
      }
    });

  } catch (error) {
    console.error('Error binding device:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการผูกอุปกรณ์',
      error: error.message
    });
  }
});

/**
 * 3.2 GET /api/devices/:mac 🔒
 * เช็คว่า MAC นี้ผูกกับผู้ป่วยรายใด
 */
router.get('/:mac', requireAuth, async (req, res) => {
  try {
    const targetMac = req.params.mac.trim().toLowerCase();

    // 1. ค้นหาในชีท patients
    const patientRows = await googleSheets.getRows('patients!A2:N1000');
    const matchedPatient = patientRows.find(row => row[13] && row[13].trim().toLowerCase() === targetMac);

    if (matchedPatient) {
      return res.json({
        success: true,
        mac: req.params.mac,
        patientId: matchedPatient[0] || '',
        patientName: matchedPatient[1] || '',
        boundAt: new Date().toISOString()
      });
    }

    // 2. ถ้าไม่พบใน patients ให้ค้นหาในชีท accounts
    const accountRows = await googleSheets.getRows('accounts!A2:F1000');
    const matchedAccount = accountRows.find(row => row[5] && row[5].trim().toLowerCase() === targetMac);

    if (matchedAccount) {
      return res.json({
        success: true,
        mac: req.params.mac,
        patientId: matchedAccount[0] || '',
        boundAt: matchedAccount[2] || new Date().toISOString()
      });
    }

    return res.status(404).json({
      success: false,
      message: `ไม่พบข้อมูลอุปกรณ์ที่ผูกกับ MAC Address: ${req.params.mac}`
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการตรวจสอบอุปกรณ์',
      error: error.message
    });
  }
});

module.exports = router;
