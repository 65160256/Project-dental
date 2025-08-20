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

// Appointment routes
router.get('/appointments', requirePatient, patientController.getAppointmentsPage); // เพิ่ม s
router.get('/appointment', requirePatient, patientController.getAppointmentsPage);
router.get('/appointment/month', requirePatient, patientController.appointmentMonth);
router.get('/appointment/week', requirePatient, patientController.appointmentWeek);
router.get('/appointment/day', requirePatient, patientController.appointmentDay);

// Booking routes
router.get('/appointment/book', requirePatient, patientController.showBookingForm);
router.post('/appointment/book', requirePatient, patientController.bookAppointment);

// ===== เพิ่ม Routes ใหม่สำหรับ Schedule Integration =====

// หน้าจองนัดหมายใหม่ที่ใช้ระบบ Schedule
router.get('/appointment/new', requirePatient, patientController.showNewBookingForm);

// API Routes สำหรับระบบจองนัดหมายผ่าน Schedule
router.get('/api/available-dentists', requirePatient, patientController.getAvailableDentistsForBooking);
router.get('/api/available-slots', requirePatient, patientController.getAvailableTimeSlots);
router.post('/api/book-appointment', requirePatient, patientController.bookAppointmentWithSchedule);
router.post('/api/cancel-appointment', requirePatient, patientController.cancelMyAppointment);
router.get('/api/my-appointments', requirePatient, patientController.getMyAppointments);

// Dashboard ที่รองรับ Schedule (ทางเลือก)
router.get('/dashboard-schedule', requirePatient, patientController.getDashboardWithSchedule);

// ===== Routes เดิมที่มีอยู่แล้ว =====

// History routes
router.get('/history', requirePatient, patientController.getHistory);
router.get('/history/details/:id', requirePatient, patientController.getAppointmentDetails);
router.get('/history/edit/:id', requirePatient, patientController.showEditAppointment);
router.post('/history/edit/:id', requirePatient, patientController.updateAppointment);
router.post('/history/cancel/:id', requirePatient, patientController.cancelAppointment);

// My Treatments routes
router.get('/my-treatments', requirePatient, patientController.getMyTreatments);
router.get('/my-treatments/:id', requirePatient, patientController.getTreatmentDetails);

// Dentists routes
router.get('/dentists', requirePatient, patientController.getDentists);
router.get('/dentists/appointment/:dentistId', requirePatient, patientController.makeAppointmentWithDentist);

module.exports = router;