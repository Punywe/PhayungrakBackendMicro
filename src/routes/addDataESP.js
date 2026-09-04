const express = require('express');
const router = express.Router();
const googleSheets = require('../utils/googleSheets');
const { requireAuth } = require('../middlewares/auth');

/**
 * 4.1 POST /api/addDataESP - บันทึกข้อมูลสุขภาพ/พิกัด จาก ESP32 / BLE ของแอป
 * รองรับทั้งการเรียกพร้อม Bearer token หรือเรียกโดยตรง
 */
router.post('/', async (req, res) => {
  try {
    const { mac, temp, avg_bpm, fall, lat, lng, timestamp, id } = req.body;

    // 1. Validation ตรวจสอบข้อมูลบังคับ
    if (!mac) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ mac (MAC Address)'
      });
    }

    const cleanMac = mac.trim();
    const patientId = id ? id.trim() : null;

    // 2. ตรวจสอบความถูกต้องของ mac ↔ patientId (ถ้ามีการระบุ id มาด้วย)
    if (patientId) {
      try {
        const patientRows = await googleSheets.getRows('patients!A2:N1000');
        const patient = patientRows.find(row => row[0] && row[0].trim().toLowerCase() === patientId.toLowerCase());
        
        // ถ้ามีผู้ป่วยคนนี้ในระบบ แต่ MAC ไม่ตรงกัน
        if (patient && patient[13] && patient[13].trim().toLowerCase() !== cleanMac.toLowerCase()) {
          return res.status(403).json({
            success: false,
            message: 'MAC ไม่ตรงกับอุปกรณ์ที่ผูกไว้กับบัญชีนี้'
          });
        }
      } catch (e) {
        console.warn('⚠️ ไม่สามารถตรวจสอบความสัมพันธ์ patient ↔ mac ได้:', e.message);
      }
    }

    // 3. กำหนดเวลาอัตโนมัติ (UTC+7 เวลาประเทศไทย)
    const now = new Date();
    const thaiDate = new Date((timestamp ? new Date(timestamp) : now).getTime() + (7 * 60 * 60 * 1000));
    const logTimestamp = thaiDate.toISOString();

    const fallStatus = fall !== undefined ? String(fall).trim() : 'ปกติ';
    const parsedTemp = temp !== undefined ? parseFloat(temp) : 0;
    const parsedBpm = avg_bpm !== undefined ? parseInt(avg_bpm) : 0;
    const parsedLat = lat !== undefined ? parseFloat(lat) : 0;
    const parsedLng = lng !== undefined ? parseFloat(lng) : 0;

    // 4. สร้างข้อมูล 1 แถวเพื่อบันทึกลงแผ่นงาน Logs คอลัมน์ A ถึง G
    // [timestamp, mac, temp, avg_bpm, fall, lat, lng]
    const newRow = [
      logTimestamp,
      cleanMac,
      parsedTemp,
      parsedBpm,
      fallStatus,
      parsedLat,
      parsedLng
    ];

    await googleSheets.appendRow('Logs!A:G', [newRow]);

    // 5. ตรวจจับเหตุฉุกเฉินและบันทึกแจ้งเตือนลงชีท alerts อัตโนมัติ (หากเกิดเหตุ)
    const isFall = fallStatus !== 'ปกติ' && fallStatus !== 'normal' && fallStatus !== '';
    const isHighHeartRate = parsedBpm > 120;
    const isLowHeartRate = parsedBpm > 0 && parsedBpm < 45;
    const isHighTemp = parsedTemp >= 38.0;

    if (isFall || isHighHeartRate || isLowHeartRate || isHighTemp) {
      try {
        let alertType = 'เหตุฉุกเฉิน';
        let category = 'vitals';
        let severity = 'ระดับการเตือน (เหลือง)';
        let severityClass = 'warning';

        if (isFall) {
          alertType = fallStatus.includes('ผู้ป่วย') ? 'การล้ม (ผู้ป่วยล้ม)' : `การล้ม (${fallStatus})`;
          category = 'emergency';
          severity = 'ระดับวิกฤต (แดง)';
          severityClass = 'critical';
        } else if (isHighHeartRate) {
          alertType = 'หัวใจเต้นเร็วผิดปกติ';
        } else if (isLowHeartRate) {
          alertType = 'หัวใจเต้นช้าผิดปกติ';
        } else if (isHighTemp) {
          alertType = 'อุณหภูมิร่างกายสูง';
        }

        const alertId = `${severityClass}-${patientId || 'PT'}-${Date.now()}`;
        const locationText = (parsedLat && parsedLng) ? `${parsedLat}, ${parsedLng}` : 'ไม่ระบุพิกัด';

        const newAlertRow = [
          alertId,
          patientId || 'PT-UNKNOWN',
          patientId || 'ผู้ป่วย',
          alertType,
          category,
          severity,
          severityClass,
          'รอดำเนินการ',
          'pending',
          logTimestamp,
          locationText,
          `ตรวจพบ: ${alertType} (BPM: ${parsedBpm}, Temp: ${parsedTemp}°C)`
        ];

        await googleSheets.appendRow('alerts!A:L', [newAlertRow]);
      } catch (err) {
        console.warn('⚠️ บันทึก alert อัตโนมัติไม่สำเร็จ:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'บันทึกข้อมูลสำเร็จ',
      data: {
        timestamp: logTimestamp,
        mac: cleanMac,
        temp: parsedTemp,
        avg_bpm: parsedBpm,
        fall: fallStatus,
        lat: parsedLat,
        lng: parsedLng,
        id: patientId
      }
    });

  } catch (error) {
    console.error('Error adding ESP telemetry data:', error);
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Google Sheets',
      error: error.message
    });
  }
});

module.exports = router;
