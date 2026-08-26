const { google } = require('googleapis');

// โหลดค่าจาก Environment Variables
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// ตั้งค่า Google Auth จาก Environment Variables (Service Account Credentials)
let auth;
try {
  const credentials = {
    type:                        process.env.GOOGLE_SA_TYPE || 'service_account',
    project_id:                  process.env.GOOGLE_SA_PROJECT_ID,
    private_key_id:              process.env.GOOGLE_SA_PRIVATE_KEY_ID,
    private_key:                 (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email:                process.env.GOOGLE_SA_CLIENT_EMAIL,
    client_id:                   process.env.GOOGLE_SA_CLIENT_ID,
    auth_uri:                    process.env.GOOGLE_SA_AUTH_URI        || 'https://accounts.google.com/o/oauth2/auth',
    token_uri:                   process.env.GOOGLE_SA_TOKEN_URI       || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.GOOGLE_SA_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:        process.env.GOOGLE_SA_CLIENT_X509_CERT_URL,
    universe_domain:             process.env.GOOGLE_SA_UNIVERSE_DOMAIN || 'googleapis.com',
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Missing GOOGLE_SA_CLIENT_EMAIL or GOOGLE_SA_PRIVATE_KEY in environment variables');
  }

  auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
} catch (error) {
  console.warn('⚠️ Google Sheets Auth initialization warning:', error.message);
}

const sheets = google.sheets({ version: 'v4', auth });

/**

 * ฟังก์ชันดึงข้อมูลจาก Google Sheets ตาม Range ที่ระบุ (เช่น 'Sheet1!A1:D10')
 */
async function getRows(range) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });
    return response.data.values || [];
  } catch (error) {
    console.error('Error fetching rows from Google Sheets:', error);
    throw error;
  }
}

/**
 * ฟังก์ชันเขียน/เพิ่มข้อมูลใหม่ (Append) เข้าไปที่ Google Sheets (แถวใหม่ต่อท้ายสุด)
 * @param {string} range ชื่อ Sheet หรือแถวเริ่มต้น เช่น 'Sheet1!A:A'
 * @param {Array} values ข้อมูลที่ต้องการเพิ่ม เช่น [['data1', 'data2']] (ต้องเป็น array ซ้อน array)
 */
async function appendRow(range, values) {
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error appending row to Google Sheets:', error);
    throw error;
  }
}

/**
 * ฟังก์ชันอัปเดตข้อมูล (Update) บน Google Sheets
 * @param {string} range ช่วงพื้นที่ที่ต้องการอัปเดต เช่น 'Sheet1!A2:B2'
 * @param {Array} values ข้อมูลใหม่ที่ต้องการทับลงไป เช่น [['new_data1', 'new_data2']]
 */
async function updateRow(range, values) {
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: values,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error updating row in Google Sheets:', error);
    throw error;
  }
}

module.exports = {
  getRows,
  appendRow,
  updateRow,
  SPREADSHEET_ID
};
