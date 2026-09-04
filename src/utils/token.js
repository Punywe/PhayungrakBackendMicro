const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'phayungrak_super_secret_jwt_key_2026';
const ACCESS_TOKEN_EXPIRES_IN_SEC = 3600; // 1 ชั่วโมง (3600 วินาที)
const REFRESH_TOKEN_EXPIRES_IN_SEC = 2592000; // 30 วัน (2592000 วินาที)
const PAIRING_TOKEN_EXPIRES_IN_SEC = 300; // 5 นาที (300 วินาที)

// Store ในหน่วยความจำสำหรับ Refresh Token และ Pairing Token
const refreshTokensStore = new Map(); // refreshToken -> { userId, username, role, mac, expiresAt }
const pairingTokensStore = new Map(); // pairingToken -> { caregiverId, caregiverName, patientId, mac, expiresAt, redeemed }

// ฟังก์ชันล้าง Token ที่หมดอายุเป็นระยะ (ทุก 10 นาที)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of refreshTokensStore.entries()) {
    if (data.expiresAt < now) refreshTokensStore.delete(token);
  }
  for (const [token, data] of pairingTokensStore.entries()) {
    if (data.expiresAt < now) pairingTokensStore.delete(token);
  }
}, 10 * 60 * 1000);

/**
 * สร้าง Access Token (JWT อายุ 1 ชม.)
 */
function generateAccessToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      username: payload.username,
      name: payload.name,
      role: payload.role,
      mac: payload.mac || null,
      patientId: payload.patientId || null
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * สร้าง Refresh Token (อายุ 30 วัน)
 */
function generateRefreshToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (REFRESH_TOKEN_EXPIRES_IN_SEC * 1000);

  refreshTokensStore.set(token, {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    mac: user.mac || null,
    patientId: user.patientId || null,
    expiresAt
  });

  return token;
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

/**
 * ตรวจสอบและหมุน (Rotate) Refresh Token
 */
function rotateRefreshToken(oldRefreshToken) {
  const tokenData = refreshTokensStore.get(oldRefreshToken);
  if (!tokenData) return null;

  // ตรวจสอบวันหมดอายุ
  if (tokenData.expiresAt < Date.now()) {
    refreshTokensStore.delete(oldRefreshToken);
    return null;
  }

  // ลบ token เดิมทิ้งเพื่อป้องกันการใช้ซ้ำ
  refreshTokensStore.delete(oldRefreshToken);

  // สร้าง access token ใหม่ และ refresh token ใหม่
  const newAccessToken = generateAccessToken(tokenData);
  const newRefreshToken = generateRefreshToken(tokenData);

  return {
    accessToken: newAccessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
    refreshToken: newRefreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SEC,
    user: tokenData
  };
}

/**
 * ยกเลิก Refresh Token (Logout)
 */
function revokeRefreshToken(token) {
  if (token) {
    refreshTokensStore.delete(token);
  }
}

/**
 * สร้าง Pairing Token สำหรับผู้สูงอายุสแกน QR (อายุ 5 นาที ใช้ได้ครั้งเดียว)
 */
function generatePairingToken(caregiver) {
  const pairingToken = `pt_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = Date.now() + (PAIRING_TOKEN_EXPIRES_IN_SEC * 1000);

  pairingTokensStore.set(pairingToken, {
    caregiverId: caregiver.id,
    caregiverName: caregiver.name || caregiver.username || 'ผู้ดูแล',
    mac: caregiver.mac || null,
    patientId: caregiver.patientId || null,
    expiresAt,
    redeemed: false
  });

  return {
    pairingToken,
    expiresIn: PAIRING_TOKEN_EXPIRES_IN_SEC,
    caregiverId: caregiver.id,
    caregiverName: caregiver.name || caregiver.username || 'ผู้ดูแล'
  };
}

/**
 * แลก Pairing Token เป็น Session ของผู้สูงอายุ (Redeem)
 */
function redeemPairingToken(pairingToken) {
  const pairData = pairingTokensStore.get(pairingToken);
  if (!pairData) {
    return { success: false, message: 'QR นี้ไม่ถูกต้องหรือไม่มีในระบบ' };
  }

  if (pairData.redeemed) {
    return { success: false, message: 'QR นี้ถูกใช้งานไปแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่' };
  }

  if (pairData.expiresAt < Date.now()) {
    pairingTokensStore.delete(pairingToken);
    return { success: false, message: 'QR นี้หมดอายุแล้ว กรุณาให้ผู้ดูแลสร้าง QR ใหม่' };
  }

  // ทำเครื่องหมายว่าถูกใช้งานแล้ว
  pairData.redeemed = true;
  pairingTokensStore.delete(pairingToken);

  const elderId = pairData.patientId || `ED-${Math.floor(1000 + Math.random() * 9000)}`;
  const elderUser = {
    id: elderId,
    username: `elder_${elderId}`,
    role: 'elder',
    mac: pairData.mac,
    patientId: elderId,
    caregiverId: pairData.caregiverId,
    caregiverName: pairData.caregiverName
  };

  const accessToken = generateAccessToken(elderUser);
  const refreshToken = generateRefreshToken(elderUser);

  return {
    success: true,
    elder: {
      id: elderId,
      caregiverId: pairData.caregiverId,
      caregiverName: pairData.caregiverName,
      mac: pairData.mac
    },
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
    refreshToken,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN_SEC
  };
}

module.exports = {
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  PAIRING_TOKEN_EXPIRES_IN_SEC,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  rotateRefreshToken,
  revokeRefreshToken,
  generatePairingToken,
  redeemPairingToken
};
