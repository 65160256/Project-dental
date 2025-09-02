const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin.controller');


const upload = require('../middlewares/upload');

// Middleware to check admin authentication
const checkAdminAuth = (req, res, next) => {
  if (!req.session.userId || req.session.role != 1) {
    return res.redirect('/login');
  }
  next();
};

// Middleware for API authentication
const checkAdminApiAuth = (req, res, next) => {
  if (!req.session.userId || req.session.role != 1) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// ==================== Dashboard Routes ====================
router.get('/dashboard', checkAdminAuth, adminController.getDashboard);
router.get('/api/schedule', checkAdminApiAuth, adminController.getScheduleAPI);

// ==================== Profile Routes ====================
router.get('/profile', checkAdminAuth, adminController.getProfile);
router.post('/change-password', checkAdminAuth, adminController.changePassword);

// ==================== Appointments Routes ====================
router.get('/appointments', checkAdminAuth, adminController.viewAppointments);
router.get('/appointments/ajax', checkAdminAuth, adminController.ajaxAppointments);
router.get('/appointments/week', checkAdminAuth, adminController.renderWeekCalendar);

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
router.get('/api/dentists', checkAdminApiAuth, adminController.getDentistsAPI);
router.get('/api/dentists/:id', checkAdminApiAuth, adminController.getDentistByIdAPI);
router.delete('/api/dentists/:id', checkAdminApiAuth, adminController.deleteDentistAPI);
router.get('/api/dentists/specialties/list', checkAdminApiAuth, adminController.getDentistSpecialtiesAPI);
router.get('/profile/api', checkAdminApiAuth, adminController.getCurrentUserAPI);

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
router.get('/patients/api', checkAdminAuth, adminController.getPatientsAPI);
// ==================== Patients API Routes ====================
router.get('/api/patients', checkAdminApiAuth, adminController.getPatientsAPI);
router.get('/api/patients/:id', checkAdminApiAuth, adminController.getPatientByIdAPI);
router.delete('/api/patients/:id', checkAdminApiAuth, adminController.deletePatientAPI);

// API route สำหรับการอัปเดตข้อมูลผู้ป่วย
router.put('/api/patients/:id', checkAdminApiAuth, adminController.updatePatientAPI);

// ตรวจสอบอีเมลแบบเฉพาะเจาะจง สำหรับ patients (ยกเว้นอีเมลปัจจุบันของผู้ป่วย)
router.get('/api/patients/:id/check-email', checkAdminApiAuth, adminController.checkPatientEmailAvailability);

// Modern edit patient form (ใช้หน้าใหม่)
router.get('/patients/:id/edit-modern', checkAdminAuth, adminController.showEditPatientFormModern);

// ==================== อัปเดต check-email route ให้รองรับ patient ====================

// อัปเดต route check-email เดิมให้รองรับการยกเว้น patient
router.get('/api/check-email', checkAdminApiAuth, async (req, res) => {
  const db = require('../models/db'); // ต้อง import db
  
  try {
    const { email, exclude_patient_id, exclude_user_id } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
    let params = [email];

    // ยกเว้นอีเมลของผู้ป่วยปัจจุบัน ถ้าระบุ
    if (exclude_patient_id) {
      query += ' AND user_id != (SELECT user_id FROM patient WHERE patient_id = ?)';
      params.push(exclude_patient_id);
    }
    
    // หรือยกเว้นโดย user_id โดยตรง
    if (exclude_user_id) {
      query += ' AND user_id != ?';
      params.push(exclude_user_id);
    }

    const [existingUser] = await db.execute(query, params);
    const exists = existingUser[0].count > 0;

    res.json({
      success: true,
      exists: exists
    });

  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email availability'
    });
  }
});
// ==================== Treatments Routes ====================
router.get('/treatments', checkAdminAuth, adminController.listTreatments);
router.get('/treatments/add', checkAdminAuth, adminController.showAddTreatmentForm);
router.post('/treatments/add', checkAdminAuth, adminController.addTreatment);
router.get('/treatments/:id', checkAdminAuth, adminController.viewTreatment);
router.get('/treatments/:id/edit', checkAdminAuth, adminController.showEditTreatmentForm);
router.post('/treatments/:id/edit', checkAdminAuth, adminController.updateTreatment);
router.get('/treatments/:id/delete', checkAdminAuth, adminController.deleteTreatment);

// ==================== Notifications API Routes ====================
router.get('/api/notifications', checkAdminApiAuth, adminController.getNotifications);
router.get('/api/notifications/:id', checkAdminApiAuth, adminController.getNotificationById);
router.post('/api/notifications/:id/read', checkAdminApiAuth, adminController.markNotificationAsRead);
router.post('/api/notifications/read-all', checkAdminApiAuth, adminController.markAllNotificationsAsRead);
router.delete('/api/notifications/:id', checkAdminApiAuth, adminController.deleteNotification);
router.post('/api/notifications', checkAdminApiAuth, adminController.createNotification);

// Add this route for email checking
router.get('/api/check-email', checkAdminApiAuth, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const [existingUser] = await db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
    const exists = existingUser[0].count > 0;

    res.json({
      success: true,
      exists: exists
    });

  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email availability'
    });
  }
});

module.exports = router;