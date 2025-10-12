const express = require('express');
const router = express.Router();
const patientController = require('../controller/patient.controller');
const { requirePatient, check24HourRule, checkClinicHours } = require('../middlewares/patient.middleware');





// === Profile routes ===
router.get('/profile', requirePatient, patientController.getProfile);
router.get('/profile/edit', requirePatient, patientController.showEditProfile);
router.post('/profile/edit', requirePatient, patientController.updateProfile);
router.get('/profile/change-password', requirePatient, patientController.showChangePassword);
router.post('/profile/change-password', requirePatient, patientController.changePassword);

// Password reset routes
router.get('/forgot-password', patientController.showForgotPasswordForm);
router.post('/forgot-password', patientController.handleForgotPassword);
router.get('/reset-password', patientController.showResetPasswordForm);
router.post('/reset-password', patientController.resetPassword);

// Protected routes (require patient login)
router.get('/dashboard', requirePatient, patientController.getDashboard);

// === Appointments (redirects) ===
router.get('/appointments', requirePatient, (req, res) => res.redirect('/patient/appointment/schedule'));
router.get('/appointment',  requirePatient, (req, res) => res.redirect('/patient/appointment/schedule'));

// หน้าจองแบบใหม่ที่ใช้ระบบ Schedule
router.get('/appointment/schedule', requirePatient, patientController.showNewBookingForm);
router.get('/appointment/schedule', requirePatient, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Get patient info
        const [patientRows] = await db.execute(
            'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
            [userId]
        );
        
        if (!patientRows[0]) return res.redirect('/login');
        const patient = patientRows[0];

        res.render('patient/appointment/book', {
            title: 'Book Appointment - Smile Clinic',
            patient: patient,
            user: req.session
        });
    } catch (error) {
        console.error('Error loading booking page:', error);
        res.redirect('/patient/dashboard');
    }
});
// Calendar views (สำหรับดูตารางเวลา - ไม่จำเป็นต้องใช้สำหรับการจองแล้ว)
// router.get('/appointment/month', requirePatient, patientController.appointmentMonth);
// router.get('/appointment/week', requirePatient, patientController.appointmentWeek);
// router.get('/appointment/day', requirePatient, patientController.appointmentDay);

// Booking routes (เก่า - เก็บไว้เผื่อใช้)
router.get('/appointment/book', requirePatient, patientController.showBookingForm);
router.post('/appointment/book', requirePatient, patientController.bookAppointment);
router.get('/appointment/book', requirePatient, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Get patient info
        const [patientRows] = await db.execute(
            'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
            [userId]
        );
        
        if (!patientRows[0]) return res.redirect('/login');
        const patient = patientRows[0];

        res.render('patient/appointment/book', {
            title: 'Book Appointment - Smile Clinic',
            patient: patient,
            user: req.session
        });
    } catch (error) {
        console.error('Error loading booking page:', error);
        res.redirect('/patient/dashboard');
    }
});
// === API Routes สำหรับระบบจองใหม่ ===
router.get('/api/calendar-data', requirePatient, patientController.getCalendarData);  // ← เพิ่มบรรทัดนี้

router.get('/api/available-dentists', requirePatient, patientController.getAvailableDentistsForBooking);
router.get('/api/available-slots', requirePatient, patientController.getAvailableTimeSlots);
router.post('/api/book-appointment', requirePatient, patientController.bookAppointmentWithSchedule);
// Get patient's upcoming appointments
router.get('/api/my-upcoming-appointments', requirePatient, patientController.getMyUpcomingAppointments);
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
// Get dentist profile information
router.get('/api/dentist-profile/:dentistId', requirePatient, async (req, res) => {
    try {
        const { dentistId } = req.params;
        const db = require('../config/db');

        const [dentistResult] = await db.execute(`
            SELECT 
                d.dentist_id,
                d.fname,
                d.lname,
                CONCAT(d.fname, ' ', d.lname) as full_name,
                d.specialty,
                d.education,
                d.phone,
                d.photo,
                u.email
            FROM dentist d
            JOIN user u ON d.user_id = u.user_id
            WHERE d.dentist_id = ?
        `, [dentistId]);

        if (dentistResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Dentist not found'
            });
        }

        const dentist = dentistResult[0];

        // Get dentist's treatments
        const [treatments] = await db.execute(`
            SELECT t.treatment_name, t.duration
            FROM dentist_treatment dt
            JOIN treatment t ON dt.treatment_id = t.treatment_id
            WHERE dt.dentist_id = ?
            ORDER BY t.treatment_name
        `, [dentistId]);

        dentist.treatments = treatments;

        res.json({
            success: true,
            dentist: dentist
        });

    } catch (error) {
        console.error('Error getting dentist profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dentist profile'
        });
    }
});
// Emergency appointment cancellation (for urgent cases)
router.post('/api/emergency-cancel/:queueId', requirePatient, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { reason } = req.body;
        const userId = req.session.userId;
        const db = require('../config/db');

        // Get patient info
        const [patientResult] = await db.execute(`
            SELECT patient_id FROM patient WHERE user_id = ?
        `, [userId]);

        if (patientResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Patient not found' 
            });
        }

        const patientId = patientResult[0].patient_id;

        // Verify appointment ownership
        const [appointmentCheck] = await db.execute(`
            SELECT q.queue_id, q.time, q.queue_status
            FROM queue q
            WHERE q.queue_id = ? AND q.patient_id = ?
        `, [queueId, patientId]);

        if (appointmentCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Appointment not found'
            });
        }

        // Cancel the appointment with emergency flag
        await db.execute(`
            UPDATE queue 
            SET queue_status = 'cancel', 
                diagnosis = CONCAT(COALESCE(diagnosis, ''), ' [EMERGENCY CANCELLATION: ', ?, ']'),
                updated_at = NOW()
            WHERE queue_id = ? AND patient_id = ?
        `, [reason || 'Emergency cancellation', queueId, patientId]);

        res.json({
            success: true,
            message: 'Emergency cancellation processed successfully'
        });

    } catch (error) {
        console.error('Error processing emergency cancellation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process emergency cancellation'
        });
    }
});
router.get('/api/dentist-availability/:dentistId', requirePatient, patientController.getDentistAvailability);

// Get treatments list
router.get('/api/treatments', requirePatient, patientController.getTreatmentsAPI);

// === Additional helper routes ===

// Check if a date is bookable (respects 24-hour rule)
router.get('/api/check-date-availability', requirePatient, async (req, res) => {
    try {
        const { date } = req.query;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Date parameter is required'
            });
        }

        const appointmentDate = new Date(date);
        const now = new Date();
        const timeDiff = appointmentDate.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 3600);
        const dayOfWeek = appointmentDate.getDay();

        const isAvailable = hoursDiff >= 24 && dayOfWeek !== 0; // Not Sunday and at least 24 hours ahead

        res.json({
            success: true,
            date: date,
            is_available: isAvailable,
            hours_until: Math.floor(hoursDiff),
            day_of_week: dayOfWeek,
            message: !isAvailable ? 
                (dayOfWeek === 0 ? 'Clinic closed on Sunday' : 'Must book at least 24 hours in advance') : 
                'Date is available for booking'
        });

    } catch (error) {
        console.error('Error checking date availability:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check date availability'
        });
    }
});
// Get patient's appointment statistics
router.get('/api/my-appointment-stats', requirePatient, async (req, res) => {
    try {
        const userId = req.session.userId;
        const db = require('../config/db');
        
        // Get patient_id
        const [patientResult] = await db.execute(`
            SELECT patient_id FROM patient WHERE user_id = ?
        `, [userId]);

        if (patientResult.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Patient not found' 
            });
        }

        const patientId = patientResult[0].patient_id;

        // Get appointment statistics
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN queue_status = 'confirm' THEN 1 END) as confirmed_appointments,
                COUNT(CASE WHEN queue_status = 'pending' THEN 1 END) as pending_appointments,
                COUNT(CASE WHEN queue_status = 'cancel' THEN 1 END) as cancelled_appointments,
                COUNT(CASE WHEN time > NOW() AND queue_status IN ('pending', 'confirm') THEN 1 END) as upcoming_appointments
            FROM queue
            WHERE patient_id = ?
        `, [patientId]);

        res.json({
            success: true,
            stats: stats[0] || {}
        });

    } catch (error) {
        console.error('Error getting appointment stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get appointment statistics'
        });
    }
});

router.get('/api/my-profile', requirePatient, patientController.getMyProfile);
router.get('/api/dentist-treatments/:dentistId', requirePatient, patientController.getDentistTreatments);
router.get('/api/treatment-history/:id', requirePatient, patientController.getTreatmentHistoryDetails);

const notificationController = require('../controller/notification.controller');

// Notification routes for patient
router.get('/api/notifications', notificationController.getPatientNotifications);
router.get('/api/notifications/unread-count', notificationController.getUnreadCount);
router.put('/api/notifications/:id/read', notificationController.markAsRead);
router.put('/api/notifications/mark-all-read', notificationController.markAllAsRead);
router.delete('/api/notifications/:id', notificationController.deleteNotification);
module.exports = router;
