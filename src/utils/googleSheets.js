const { google } = require('googleapis');
const path = require('path');

// โหลดค่าจาก Environment Variables
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// ตั้งค่า Google Auth (ใช้ Service Account Credentials)
// แนะนำให้วางไฟล์ credentials.json ไว้ที่โฟลเดอร์ root หรือส่งข้อมูลผ่าน ENV
let auth;
try {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS 
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : path.join(__dirname, '../../credentials.json');

  auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
} catch (error) {
  console.warn('⚠️ Google Sheets Auth initialization warning. Please check your credentials file.');
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
