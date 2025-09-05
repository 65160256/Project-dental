const express = require('express');
const router = express.Router();
const patientController = require('../controller/patient.controller');

// Middleware to check if user is patient
function requirePatient(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Password reset routes
router.get('/forgot-password', patientController.showForgotPasswordForm);
router.post('/forgot-password', patientController.handleForgotPassword);
router.get('/reset-password', patientController.showResetPasswordForm);
router.post('/reset-password', patientController.resetPassword);

// Protected routes (require patient login)
router.get('/dashboard', requirePatient, patientController.getDashboard);

// === Appointment routes ===
// เปลี่ยนเส้นทางหลักไปยังระบบจองใหม่
router.get('/appointments', requirePatient, (req, res) => {
    res.redirect('/patient/appointment/schedule');
});
router.get('/appointment', requirePatient, (req, res) => {
    res.redirect('/patient/appointment/schedule');
});

// หน้าจองแบบใหม่ที่ใช้ระบบ Schedule
router.get('/appointment/schedule', requirePatient, patientController.showNewBookingForm);

// Calendar views (สำหรับดูตารางเวลา - ไม่จำเป็นต้องใช้สำหรับการจองแล้ว)
router.get('/appointment/month', requirePatient, patientController.appointmentMonth);
router.get('/appointment/week', requirePatient, patientController.appointmentWeek);
router.get('/appointment/day', requirePatient, patientController.appointmentDay);

// Booking routes (เก่า - เก็บไว้เผื่อใช้)
router.get('/appointment/book', requirePatient, patientController.showBookingForm);
router.post('/appointment/book', requirePatient, patientController.bookAppointment);

// === API Routes สำหรับระบบจองใหม่ ===
router.get('/api/available-dentists', requirePatient, patientController.getAvailableDentistsForBooking);
router.get('/api/available-slots', requirePatient, patientController.getAvailableTimeSlots);
router.post('/api/book-appointment', requirePatient, patientController.bookAppointmentWithSchedule);
router.post('/api/cancel-appointment', requirePatient, patientController.cancelMyAppointment);
router.get('/api/my-appointments', requirePatient, patientController.getMyAppointments);

// === History routes ===
router.get('/history', requirePatient, patientController.getHistory);
router.get('/history/details/:id', requirePatient, patientController.getAppointmentDetails);
router.get('/history/edit/:id', requirePatient, patientController.showEditAppointment);
router.post('/history/edit/:id', requirePatient, patientController.updateAppointment);
router.post('/history/cancel/:id', requirePatient, patientController.cancelAppointment);

// === My Treatments routes ===
router.get('/my-treatments', requirePatient, patientController.getMyTreatments);
router.get('/my-treatments/:id', requirePatient, patientController.getTreatmentDetails);

// === Dentists routes (Enhanced) ===
router.get('/dentists', requirePatient, patientController.getDentistsEnhanced);
router.get('/dentists/appointment/:dentistId', requirePatient, patientController.makeAppointmentWithDentist);

// === New API Routes สำหรับ Dentist Profile ===
router.get('/api/dentist-profile/:dentistId', requirePatient, patientController.getDentistProfile);
router.get('/api/dentist-availability/:dentistId', requirePatient, patientController.getDentistAvailability);

module.exports = router;