const express = require('express'); 
const router = express.Router();
const patientController = require('../controller/patient.controller');

console.log('🧪 typeof renderDayView =', typeof patientController.renderDayView);

// Forgot password
router.get('/forgot-password', patientController.showForgotPasswordForm);
router.post('/forgot-password', patientController.handleForgotPassword);
router.get('/reset-password', patientController.showResetPasswordForm);
router.post('/reset-password', patientController.resetPassword);

// Dashboard
router.get('/dashboard', patientController.getDashboard);


// Appointment views

router.get('/appointment/week', (req, res) => {
  console.log("📥 request received on /appointment/week");
  res.render('patient/appointment/week');
});
router.get('/appointment/month', (req, res) => {
  console.log("📥 request received on /appointment/month");
  res.render('patient/appointment/month');
});
// Booking form
router.get('/appointment/form', patientController.renderForm);
router.post('/appointment/confirm', patientController.renderConfirm);

// Optional: all appointments
router.get('/appointments', patientController.renderDayView);

module.exports = router;
