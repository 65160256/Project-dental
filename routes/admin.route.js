const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin.controller');
const upload = require('../middlewares/upload');

// // GET: Admin Dashboard
// router.get('/dashboard', (req, res) => {
//   if (!req.session.userId || req.session.role != 1) {
//     return res.redirect('/login');
//   }
//   // เปลี่ยนจากการ render ธรรมดาเป็นการเรียก controller
//   adminController.getDashboard(req, res);
// });

// Middleware to check admin authentication
const checkAdminAuth = (req, res, next) => {
  if (!req.session.userId || req.session.role != 1) {
    return res.redirect('/login');
  }
  next();
};

// router.get('/api/schedule', (req, res) => {
//   if (!req.session.userId || req.session.role != 1) {
//     return res.status(401).json({ success: false, error: 'Unauthorized' });
//   }
//   adminController.getScheduleAPI(req, res);
// });

// Middleware for API authentication
const checkAdminApiAuth = (req, res, next) => {
  if (!req.session.userId || req.session.role != 1) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// ==================== Dashboard Routes ====================
// GET: Admin Dashboard
router.get('/dashboard', checkAdminAuth, adminController.getDashboard);

// API: Get schedule data for calendar
router.get('/api/schedule', checkAdminApiAuth, adminController.getScheduleAPI);

// router.get('/profile', adminController.getProfile);
// router.post('/change-password', adminController.changePassword);

// ==================== Profile Routes ====================
router.get('/profile', checkAdminAuth, adminController.getProfile);
router.post('/change-password', checkAdminAuth, adminController.changePassword);

// router.get('/appointments', adminController.viewAppointments);
// router.get('/appointments/ajax', adminController.ajaxAppointments);
// router.get('/appointments/week', adminController.renderWeekCalendar);

// ==================== Appointments Routes ====================
router.get('/appointments', checkAdminAuth, adminController.viewAppointments);
router.get('/appointments/ajax', checkAdminAuth, adminController.ajaxAppointments);
router.get('/appointments/week', checkAdminAuth, adminController.renderWeekCalendar);

// router.get('/dentists', adminController.viewDentists);
// router.get('/dentists/add', adminController.addDentistForm);
// router.post('/dentists/add', upload.single('photo'), adminController.addDentist);
// router.get('/dentists/:id', adminController.viewDentist);
// router.get('/dentists/:id/edit', adminController.editDentistForm);
// router.post('/dentists/:id/edit', upload.single('photo'), adminController.editDentist);
// router.get('/dentists/delete/:id', adminController.deleteDentist);
// router.get('/dentists/:id/schedule', adminController.dentistSchedule);

// ==================== Dentists Routes ====================
router.get('/dentists', checkAdminAuth, adminController.viewDentists);
router.get('/dentists/add', checkAdminAuth, adminController.addDentistForm);
router.post('/dentists/add', checkAdminAuth, upload.single('photo'), adminController.addDentist);
router.get('/dentists/:id', checkAdminAuth, adminController.viewDentist);
router.get('/dentists/:id/edit', checkAdminAuth, adminController.editDentistForm);
router.post('/dentists/:id/edit', checkAdminAuth, upload.single('photo'), adminController.editDentist);
router.get('/dentists/delete/:id', checkAdminAuth, adminController.deleteDentist);
router.get('/dentists/:id/schedule', checkAdminAuth, adminController.dentistSchedule);


// ==================== Dentists API Routes ====================
// API: Get all dentists data
router.get('/api/dentists', checkAdminApiAuth, adminController.getDentistsAPI);

// API: Get single dentist details
router.get('/api/dentists/:id', checkAdminApiAuth, adminController.getDentistByIdAPI);

// API: Delete dentist
router.delete('/api/dentists/:id', checkAdminApiAuth, adminController.deleteDentistAPI);

// API: Get dentist specialties for filters
router.get('/api/dentists/specialties/list', checkAdminApiAuth, adminController.getDentistSpecialtiesAPI);

// API: Get current user info
router.get('/profile/api', checkAdminApiAuth, adminController.getCurrentUserAPI);

// router.get('/patients', adminController.getPatients); 
// // แสดงหน้า patients ทั้งหมด
// router.get('/admin/patients', adminController.listPatients);
// // หน้าเพิ่ม patient
// router.get('/patients/add', adminController.showAddPatientForm);
// router.post('/patients/add', adminController.addPatient);
// // หน้าแก้ไข patient
// router.get('/patients/:id/edit', adminController.showEditPatientForm);
// router.post('/patients/:id/edit', adminController.editPatient);
// // ดูรายละเอียด patient
// router.get('/patients/:id', adminController.viewPatient);
// // ลบ patient
// router.get('/patients/:id/delete', adminController.deletePatient);
// router.get('/patients/:id/treatments', adminController.viewPatientTreatmentHistory);
// // router.get('/patients/:patientId/treatments/:treatmentId', adminController.viewTreatmentDetail);
// router.get('/patients/:id/treatments/:queueId', adminController.viewTreatmentDetails);


// ==================== Patients Routes ====================
router.get('/patients', checkAdminAuth, adminController.getPatients);
router.get('/admin/patients', checkAdminAuth, adminController.listPatients);
router.get('/patients/add', checkAdminAuth, adminController.showAddPatientForm);
router.post('/patients/add', checkAdminAuth, adminController.addPatient);
router.get('/patients/:id/edit', checkAdminAuth, adminController.showEditPatientForm);
router.post('/patients/:id/edit', checkAdminAuth, adminController.editPatient);
router.get('/patients/:id', checkAdminAuth, adminController.viewPatient);
router.get('/patients/:id/delete', checkAdminAuth, adminController.deletePatient);
router.get('/patients/:id/treatments', checkAdminAuth, adminController.viewPatientTreatmentHistory);
router.get('/patients/:id/treatments/:queueId', checkAdminAuth, adminController.viewTreatmentDetails);

// // -----treatments-------
// router.get('/treatments', adminController.listTreatments);
// // ✅ ต้องอยู่ก่อน /:id
// router.get('/treatments/add', adminController.showAddTreatmentForm);
// router.post('/treatments/add', adminController.addTreatment);
// // แล้วค่อยตามด้วย
// router.get('/treatments/:id', adminController.viewTreatment);
// router.get('/treatments/:id/edit', adminController.showEditTreatmentForm);
// router.post('/treatments/:id/edit', adminController.updateTreatment);
// router.get('/treatments/:id/delete', adminController.deleteTreatment);

// ==================== Treatments Routes ====================
router.get('/treatments', checkAdminAuth, adminController.listTreatments);
router.get('/treatments/add', checkAdminAuth, adminController.showAddTreatmentForm);
router.post('/treatments/add', checkAdminAuth, adminController.addTreatment);
router.get('/treatments/:id', checkAdminAuth, adminController.viewTreatment);
router.get('/treatments/:id/edit', checkAdminAuth, adminController.showEditTreatmentForm);
router.post('/treatments/:id/edit', checkAdminAuth, adminController.updateTreatment);
router.get('/treatments/:id/delete', checkAdminAuth, adminController.deleteTreatment);

// ==================== Notifications API Routes ====================
// GET: Get all notifications
router.get('/api/notifications', checkAdminApiAuth, adminController.getNotifications);

// GET: Get single notification details
router.get('/api/notifications/:id', checkAdminApiAuth, adminController.getNotificationById);

// POST: Mark notification as read
router.post('/api/notifications/:id/read', checkAdminApiAuth, adminController.markNotificationAsRead);

// POST: Mark all notifications as read
router.post('/api/notifications/read-all', checkAdminApiAuth, adminController.markAllNotificationsAsRead);

// DELETE: Delete notification
router.delete('/api/notifications/:id', checkAdminApiAuth, adminController.deleteNotification);

// POST: Create notification (for testing/manual creation)
router.post('/api/notifications', checkAdminApiAuth, adminController.createNotification);

module.exports = router;
