const express = require('express');
const router = express.Router();

// นำเข้า Router ย่อยแต่ละโมดูล
const authRouter = require('./auth');
const pairRouter = require('./pair');
const devicesRouter = require('./devices');
const addDataESPRouter = require('./addDataESP');
const realtimeRouter = require('./realtime');
const hourlyRouter = require('./hourly');
const weeklyRouter = require('./weekly');
const patientsRouter = require('./patients');
const alertsRouter = require('./alerts');

// Health Check Endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    message: 'Payoongrak Backend Microservice is running smoothly',
    timestamp: new Date().toISOString()
  });
});

// เชื่อมต่อแต่ละ Endpoint เข้ากับเส้นทางย่อย
router.use('/auth', authRouter);
router.use('/pair', pairRouter);
router.use('/devices', devicesRouter);
router.use('/addDataESP', addDataESPRouter);
router.use('/realtime', realtimeRouter);
router.use('/hourly', hourlyRouter);
router.use('/weekly', weeklyRouter);
router.use('/patients', patientsRouter);
router.use('/alerts', alertsRouter);

module.exports = router;
