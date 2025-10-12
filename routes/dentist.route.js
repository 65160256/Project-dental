const express = require('express');
const router = express.Router();

// ตรวจสอบ path ให้ถูกต้อง - เปลี่ยนตาม folder structure ของคุณ
const dentistController = require('../controller/dentist.controller'); // หรือ ../controllers/
const multer = require('multer');
const path = require('path');

// ตั้งค่า multer สำหรับอัพโหลดรูป
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, GIF, WEBP)'));
    }
  }
});
// Middleware สำหรับตรวจสอบการล็อกอิน
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Middleware สำหรับตรวจสอบ role dentist
const requireDentist = (req, res, next) => {
    if (!req.session.user || req.session.user.role_id !== 2) {
        return res.status(403).render('error', { 
            message: 'Access denied. Dentist role required.',
            error: { status: 403 }
        });
    }
    next();
};

// Simple validation middleware
const validateAppointmentUpdate = (req, res, next) => {
    const { queueId, status } = req.body;
    
    if (!queueId || !Number.isInteger(parseInt(queueId))) {
        return res.status(400).json({ success: false, error: 'Invalid queue ID' });
    }
    
    if (!status || !['pending', 'completed', 'cancel'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    next();
};

// =================
// Dashboard Routes
// =================
router.get('/dashboard', requireAuth, requireDentist, dentistController.getDashboard);

// =================
// Schedule Routes
// =================
router.get('/schedule', requireAuth, requireDentist, dentistController.getSchedule);
router.get('/schedule', dentistController.showScheduleMonthly);

// =================
// Schedule API Routes
// =================
router.post('/api/schedule/save', requireAuth, requireDentist, dentistController.saveSchedule);
router.get('/api/schedule/load', requireAuth, requireDentist, dentistController.loadSchedule);
router.delete('/api/schedule/delete', requireAuth, requireDentist, dentistController.deleteSchedule);
router.get('/api/schedule/available-slots', requireAuth, requireDentist, dentistController.getAvailableSlots);

// =================
// Appointment Routes
// =================
router.get('/appointments', requireAuth, requireDentist, dentistController.getAppointments);
router.get('/appointments/:id', requireAuth, requireDentist, dentistController.getAppointmentDetail);
router.post('/appointments/update-status', requireAuth, requireDentist, validateAppointmentUpdate, dentistController.updateAppointmentStatus);

// =================
// Patient Routes
// =================
router.get('/patients', requireAuth, requireDentist, dentistController.getPatients);
router.get('/patients/:id', requireAuth, requireDentist, dentistController.getPatientDetail);

// =================
// History Routes  
// =================
// router.get('/history', requireAuth, requireDentist, dentistController.getHistory);
// router.get('/patient-history', requireAuth, requireDentist, dentistController.getPatientHistory);
// router.get('/api/patient-history', requireAuth, requireDentist, dentistController.getPatientHistoryAPI);
// router.get('/api/patient-history/search', requireAuth, requireDentist, dentistController.searchPatientHistory);
// router.get('/api/patient-history/:patientId', requireAuth, requireDentist, dentistController.getPatientDetailedHistory);

// =================
// Profile Routes
// =================
router.get('/profile', requireAuth, requireDentist, dentistController.getProfile);
router.post('/profile/update', requireAuth, requireDentist, upload.single('photo'), dentistController.updateProfile);
router.post('/profile/update-password', requireAuth, requireDentist, dentistController.updatePassword);
router.get('/profile/edit', requireAuth, requireDentist, dentistController.getEditProfile);
router.get('/profile/change-password', requireAuth, requireDentist, dentistController.getChangePassword);
router.post('/profile/update-email', requireAuth, requireDentist, dentistController.updateEmail);

// =================
// Treatment Routes
// =================
router.get('/history', requireAuth, requireDentist, dentistController.getHistory);
// router.get('/patient-history', requireAuth, requireDentist, dentistController.getPatientHistory);
router.put('/treatments/:id', requireAuth, requireDentist, dentistController.updateTreatment);
router.delete('/treatments/:id', requireAuth, requireDentist, dentistController.deleteTreatment);

// =================
// Report Routes
// =================
router.get('/reports', requireAuth, requireDentist, dentistController.getReports);
router.get('/reports/monthly', requireAuth, requireDentist, dentistController.getMonthlyReport);
// router.get('/reports/patient-history/:id', requireAuth, requireDentist, dentistController.getPatientHistoryReport);

// =================
// API Routes - เฉพาะที่จำเป็น
// =================

// Appointment Management API
router.get('/api/appointments', requireAuth, requireDentist, dentistController.getAppointmentsAPI);
router.get('/api/appointments/today', requireAuth, requireDentist, dentistController.getTodayAppointments);
router.get('/api/appointments/upcoming', requireAuth, requireDentist, dentistController.getUpcomingAppointments);
router.post('/api/appointment/confirm', requireAuth, requireDentist, dentistController.confirmAppointment);
router.post('/api/appointment/cancel', requireAuth, requireDentist, dentistController.cancelAppointment);
router.post('/api/appointment/complete', requireAuth, requireDentist, dentistController.completeAppointment);

// Calendar API
router.get('/api/calendar/:year/:month', requireAuth, requireDentist, dentistController.getCalendarData);

// Dashboard Stats API
router.get('/api/stats/dashboard', requireAuth, requireDentist, dentistController.getDashboardStats);

// Patient API
router.get('/api/patients/search', requireAuth, requireDentist, dentistController.searchPatientsAPI);
router.get('/api/patients/:patientId/detail', requireAuth, requireDentist, dentistController.getPatientDetailAPI);
router.get('/api/patients/export', requireAuth, requireDentist, dentistController.exportPatientsData);
router.get('/api/patients/:patientId/treatments/search', requireAuth, requireDentist, dentistController.searchPatientTreatments);

router.get('/api/patients/:patientId/latest-appointments', requireAuth, requireDentist, dentistController.getLatestPatientAppointment);
router.post('/api/treatment-history/create', requireAuth, requireDentist, dentistController.createTreatmentHistory);
// Treatment History API
router.post('/api/treatment-history/add', requireAuth, requireDentist, dentistController.addTreatmentHistory);
// =================
// Treatment History Routes
// =================
router.get('/treatment-history/:queueId', requireAuth, requireDentist, dentistController.getTreatmentHistoryPage);
router.get('/api/treatment-history/:queueId', requireAuth, requireDentist, dentistController.getTreatmentHistoryDetail);

// Error handling middleware
router.use((err, req, res, next) => {
    console.error('Dentist route error:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    } else {
        res.status(500).render('error', { 
            message: 'เกิดข้อผิดพลาดในระบบ',
            error: err 
        });
    }
});


// =================
// Add History Routes - ใหม่
// =================

// หน้าเพิ่มประวัติการรักษา
router.get('/add-history', requireAuth, requireDentist, dentistController.getAddHistoryPage);
router.get('/api/appointment/:queueId/for-history', requireAuth, requireDentist, dentistController.getAppointmentForAddHistory);
router.post('/api/add-history/save', requireAuth, requireDentist, dentistController.saveAddHistory);

router.get('/add-history/:queueId', requireAuth, requireDentist, dentistController.getAddHistoryPage);
// API สำหรับดึงข้อมูลการจองของผู้ป่วย
router.get('/api/patients/:patientId/appointments-for-history', requireAuth, requireDentist, dentistController.getAppointmentForHistory);

// ใน dentist.routes.js
router.get('/schedule', requireAuth, requireDentist, dentistController.getMonthlySchedule);
router.post('/api/schedule/save-range', requireAuth, requireDentist, dentistController.saveScheduleRange);
router.delete('/api/schedule/delete-range', requireAuth, requireDentist, dentistController.deleteScheduleRange);
module.exports = router;
