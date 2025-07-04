const express = require('express');
const router = express.Router();
const patientController = require('../controller/patient.controller');

// Show forgot password form
router.get('/forgot-password', patientController.showForgotPasswordForm);

// Handle submit email for reset
router.post('/forgot-password', patientController.handleForgotPassword);

// เส้นทางหน้าแดชบอร์ดของผู้ป่วย
router.get('/home', patientController.getDashboard);

router.get('/appointments', patientController.getAppointmentsPage);

module.exports = router;
