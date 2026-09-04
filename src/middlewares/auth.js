const { verifyAccessToken } = require('../utils/token');

/**
 * Middleware ตรวจสอบ JWT Access Token ใน Authorization Header
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'token หมดอายุหรือไม่ถูกต้อง'
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'token หมดอายุหรือไม่ถูกต้อง'
    });
  }

  // ผูกข้อมูล user เข้ากับ request object
  req.user = decoded;
  next();
}

/**
 * Middleware ตรวจสอบ Role ของผู้ใช้งาน
 * @param {string[]|string} allowedRoles รายการ Role ที่อนุญาต เช่น ['caregiver', 'carer', 'admin', 'staff']
 */
function requireRole(allowedRoles) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้'
      });
    }

    const userRole = req.user.role.toLowerCase();
    
    // จัดกลุ่ม Role เสมือนที่เทียบเท่ากัน
    const roleAliases = {
      'caregiver': ['caregiver', 'carer', 'ผู้ดูแล'],
      'carer': ['caregiver', 'carer', 'ผู้ดูแล'],
      'elder': ['elder', 'patient', 'ผู้สูงอายุ', 'ผู้ป่วย'],
      'patient': ['elder', 'patient', 'ผู้สูงอายุ', 'ผู้ป่วย'],
      'admin': ['admin', 'staff', 'หมอ', 'doctor'],
      'staff': ['admin', 'staff', 'หมอ', 'doctor'],
      'doctor': ['admin', 'staff', 'หมอ', 'doctor']
    };

    const isAuthorized = rolesArray.some(role => {
      const targetRole = role.toLowerCase();
      if (userRole === targetRole) return true;
      if (roleAliases[targetRole] && roleAliases[targetRole].includes(userRole)) return true;
      return false;
    });

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'ไม่มีสิทธิ์ในการทำรายการนี้ (Role ไม่ถูกต้อง)'
      });
    }

    next();
  };
}

/**
 * Middleware ตรวจสอบว่า User มีสิทธิ์เข้าถึง MAC Address นี้หรือไม่
 */
function checkMacAccess(req, res, next) {
  const targetMac = req.params.mac || req.body.mac;
  if (!targetMac) {
    return next();
  }

  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }

  const userRole = (user.role || '').toLowerCase();

  // แอดมิน / หมอ / เจ้าหน้าที่ เข้าถึงได้ทุก MAC
  const adminRoles = ['admin', 'staff', 'หมอ', 'doctor'];
  if (adminRoles.includes(userRole)) {
    return next();
  }

  // หากเป็นผู้ใช้ทั่วไป / ผู้สูงอายุ / ผู้ดูแล ต้องตรงกับ MAC ที่ผูกไว้
  if (!user.mac || user.mac.trim().toLowerCase() !== targetMac.trim().toLowerCase()) {
    return res.status(403).json({
      success: false,
      message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลอุปกรณ์นี้'
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireRole,
  checkMacAccess
};
