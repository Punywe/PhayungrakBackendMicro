const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'phayungrak_super_secret_jwt_key_2026';
const ACCESS_TOKEN_EXPIRES_IN_SEC = 3600; // 1 ชั่วโมง (3600 วินาที)
const REFRESH_TOKEN_EXPIRES_IN_SEC = 2592000; // 30 วัน (2592000 วินาที)
const PAIRING_TOKEN_EXPIRES_IN_SEC = 300; // 5 นาที (300 วินาที)

/**
 * สร้าง Access Token (JWT อายุ 1 ชม.)
 */
function generateAccessToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      username: payload.username,
      name: payload.name || payload.username,
      role: payload.role,
      mac: payload.mac || null,
      patientId: payload.patientId || null
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * สร้าง Refresh Token (สุ่ม Hex 32 bytes - ไม่ใช้ JWT เพื่อให้ Revoke ได้จริง)
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * สร้าง Pairing Token (สุ่ม Hex 16 bytes นำหน้าด้วย pt_)
 */
function generatePairingTokenString() {
  return `pt_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * ตรวจสอบความถูกต้องของ Access Token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

module.exports = {
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  PAIRING_TOKEN_EXPIRES_IN_SEC,
  generateAccessToken,
  generateRefreshToken,
  generatePairingTokenString,
  verifyAccessToken
};

