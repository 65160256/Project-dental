const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin.controller');
const reportsController = require('../controller/reports.controller');
const db = require('../config/db'); 

const upload = require('../middlewares/upload');
const notificationController = require('../controller/notification.controller');


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
router.get('/api/current-user', checkAdminApiAuth, adminController.getCurrentUserAPI);
router.get('/api/schedule', checkAdminApiAuth, adminController.getScheduleAPI);

// ==================== Reports API Routes ====================
router.get('/api/reports/treatment-stats', checkAdminApiAuth, reportsController.getTreatmentStats);
router.get('/api/reports/doctor-stats', checkAdminApiAuth, reportsController.getDoctorStats);
router.get('/api/reports/appointment-stats', checkAdminApiAuth, reportsController.getAppointmentStats);
router.get('/api/reports/calendar-appointments', checkAdminApiAuth, reportsController.getCalendarAppointments);
router.get('/api/reports/revenue-stats', checkAdminApiAuth, reportsController.getRevenueStats);

// ==================== Dashboard Routes ====================
router.get('/dashboard', checkAdminAuth, adminController.getReportsDashboard);

router.get('/schedule', checkAdminAuth, adminController.getSchedulePage);

router.get('/api/schedule', checkAdminApiAuth, adminController.getScheduleAPI);

// ==================== Dashboard API Routes ====================
// รับสถิติการนัดหมายสำหรับแดชบอร์ด
router.get('/api/dashboard/appointments', checkAdminApiAuth, adminController.getAppointmentStatsAPI);
// รับสถิติการรักษาสำหรับแดชบอร์ด
router.get('/api/dashboard/treatments', checkAdminApiAuth, adminController.getTreatmentStatsAPI);
// รับสถิติรายงานสำหรับแดชบอร์ด
router.get('/api/reports/treatment-stats', checkAdminApiAuth, adminController.getTreatmentReportStatsAPI);
router.get('/api/reports/doctor-stats', checkAdminApiAuth, adminController.getDoctorReportStatsAPI);
router.get('/api/reports/appointment-stats', checkAdminApiAuth, adminController.getAppointmentReportStatsAPI);


// รับข้อมูลสรุปแดชบอร์ด
router.get('/api/dashboard/summary', checkAdminApiAuth, async (req, res) => {
  try {
    const db = require('../config/db');
    
    // นับจำนวนสำหรับการ์ดแดชบอร์ด
    const [patientCount] = await db.execute('SELECT COUNT(*) as count FROM patient');
    const [dentistCount] = await db.execute('SELECT COUNT(*) as count FROM dentist');
    const [todayAppointments] = await db.execute(`
      SELECT COUNT(*) as count FROM queue 
      WHERE DATE(time) = CURDATE()
    `);
    const [pendingAppointments] = await db.execute(`
      SELECT COUNT(*) as count FROM queue 
      WHERE queue_status = 'pending' AND DATE(time) >= CURDATE()
    `);

    res.json({
      success: true,
      summary: {
        totalPatients: patientCount[0].count,
        totalDentists: dentistCount[0].count,
        todayAppointments: todayAppointments[0].count,
        pendingAppointments: pendingAppointments[0].count
      }
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสรุปแดชบอร์ด:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงข้อมูลสรุปแดชบอร์ดได้'
    });
  }
});

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

// Get dentist schedule/availability
router.get('/api/dentists/:id/schedule', adminController.getDentistSchedule);

// Add this new route for getting real dentist schedule data
router.get('/api/dentists/:id/schedule-data', checkAdminApiAuth, adminController.getDentistScheduleData);

// Debug route for schedule data - REMOVED (function not defined)

// ==================== Patients Routes ====================
router.get('/patients', checkAdminAuth, adminController.getPatients);
router.get('/patients/add', checkAdminAuth, adminController.showAddPatientForm);
router.post('/patients/add', checkAdminAuth, adminController.addPatient);
router.get('/patients/:id/edit', checkAdminAuth, adminController.showEditPatientForm);
router.post('/patients/:id/edit', checkAdminAuth, adminController.editPatient);
router.get('/patients/:id', checkAdminAuth, adminController.viewPatient);
router.get('/patients/:id/delete', checkAdminAuth, adminController.deletePatient);
router.get('/patients/:id/treatments', checkAdminAuth, adminController.viewPatientTreatmentHistory);
router.get('/patients/:id/treatments/:queueId', checkAdminAuth, adminController.viewTreatmentDetails);

// ==================== Patients API Routes ====================
router.get('/api/patients', checkAdminApiAuth, adminController.getPatientsAPI);
router.get('/api/patients/:id', checkAdminApiAuth, adminController.getPatientByIdAPI);
router.delete('/api/patients/:id', checkAdminApiAuth, adminController.deletePatientAPI);

router.get('/api/patients/:id/treatments', checkAdminApiAuth, adminController.getPatientTreatmentHistoryAPI);

router.get('/patients/:id/treatments', checkAdminAuth, (req, res) => {
  res.render('patient-treatment-history', { 
    patientId: req.params.id,
    title: 'Treatment History - Smile Clinic'
  });
});
// API route สำหรับการอัปเดตข้อมูลผู้ป่วย
router.put('/api/patients/:id', checkAdminApiAuth, adminController.updatePatientAPI);

// ตรวจสอบอีเมลแบบเฉพาะเจาะจง สำหรับ patients (ยกเว้นอีเมลปัจจุบันของผู้ป่วย)
router.get('/api/patients/:id/check-email', checkAdminApiAuth, adminController.checkPatientEmailAvailability);

// Modern edit patient form (ใช้หน้าใหม่)
router.get('/patients/:id/edit-modern', checkAdminAuth, adminController.showEditPatientFormModern);

// ==================== Validation Routes ====================
// ==================== Treatments Routes ====================
router.get('/treatments', checkAdminAuth, adminController.listTreatments);
router.get('/treatments/add', checkAdminAuth, adminController.showAddTreatmentForm);
router.post('/treatments/add', checkAdminAuth, adminController.addTreatment);
router.get('/treatments/:id', checkAdminAuth, adminController.viewTreatment);
router.get('/treatments/:id/edit', checkAdminAuth, adminController.showEditTreatmentForm);
router.post('/treatments/:id/edit', checkAdminAuth, adminController.updateTreatment);
router.get('/treatments/:id/delete', checkAdminAuth, adminController.deleteTreatment);
// In your admin routes file, add:
router.get('/api/treatments', checkAdminApiAuth, adminController.getTreatmentsAPI);
router.get('/api/treatments/:id', checkAdminApiAuth, adminController.getTreatmentByIdAPI);
router.get('/api/treatments/:id/dentists', checkAdminApiAuth, adminController.getTreatmentDentistsAPI);
router.put('/api/treatments/:id', checkAdminApiAuth, adminController.updateTreatmentAPI);
router.post('/api/treatments', checkAdminApiAuth, adminController.createTreatmentAPI);
// Make sure this route exists
router.delete('/api/treatments/:id', checkAdminApiAuth, (req, res, next) => {
  console.log('DELETE request received for treatment:', req.params.id);
  adminController.deleteTreatmentAPI(req, res, next);
});

// Get all dentist-treatment mappings
router.get('/api/dentist-treatments/mappings', checkAdminApiAuth, adminController.getDentistTreatmentMappingAPI);

// Get treatments for a specific dentist
router.get('/api/dentists/:id/treatments', checkAdminApiAuth, adminController.getDentistTreatmentsAPI);


// ==================== Appointment Detail Route ====================
// หน้ารายละเอียดการจอง - ต้องอยู่ก่อน /appointments/:id
router.get('/appointments/detail', checkAdminAuth, (req, res) => {
  const appointmentId = req.query.id;
  
  if (!appointmentId) {
    req.flash('error', 'ไม่พบรหัสการจอง');
    return res.redirect('/admin/appointments');
  }
  
  res.render('admin/appointment/appointment-detail', { 
    appointmentId: appointmentId,
    title: 'รายละเอียดการจอง - Smile Clinic'
  });
});

// Update appointment status (confirm/cancel)
router.put('/api/appointments/:id/status', adminController.updateAppointmentStatus);

// Get pending appointments count
router.get('/api/appointments/pending/count', adminController.getPendingAppointmentsCount);

// Get appointment statistics
router.get('/api/appointments/statistics', adminController.getAppointmentStatistics);

// Bulk update appointment status
router.put('/api/appointments/bulk-status', adminController.bulkUpdateAppointmentStatus);

// ==================== Enhanced Appointment API Routes ====================

// Get appointments with enhanced filtering
router.get('/api/appointments', adminController.getAppointmentsAPI);

// Get single appointment details (make sure this exists)
router.get('/api/appointments/:id', checkAdminApiAuth, adminController.getAppointmentById);

// Update appointment
router.put('/api/appointments/:id', checkAdminApiAuth, adminController.updateAppointment);

// Delete appointment
router.delete('/api/appointments/:id', checkAdminApiAuth, adminController.deleteAppointment);
// Validate appointment time conflicts
router.get('/api/appointments/validate-time', adminController.validateAppointmentTime);


// Show add appointment form
router.get('/appointments/add', checkAdminAuth, adminController.showAddAppointmentForm);

// Create new appointment (API endpoint)
router.post('/api/appointments', checkAdminApiAuth, adminController.createAppointmentAPI);

// ==================== Notification Routes ====================

// หน้าแสดงการแจ้งเตือนทั้งหมด
router.get('/notifications', checkAdminAuth, (req, res) => {
  res.render('admin/notifications', {
    title: 'การแจ้งเตือน - Smile Clinic'
  });
});

// Get all notifications
router.get('/api/notifications', adminController.getNotifications);

// Get unread notification count
router.get('/api/notifications/unread-count', adminController.getUnreadNotificationCount);

// Get single notification
router.get('/api/notifications/:id', adminController.getNotificationById);

// Mark notification as read
router.put('/api/notifications/:id/read', adminController.markNotificationAsRead);

// Mark all notifications as read
router.put('/api/notifications/mark-all-read', adminController.markAllNotificationsAsRead);

// Delete notification
router.delete('/api/notifications/:id', adminController.deleteNotification);

// Create notification (for testing)
router.post('/api/notifications', adminController.createNotification);

// ==================== Other API Routes ====================

// Get current user info
router.get('/api/user/current', adminController.getCurrentUserAPI);

// ==================== Appointment Edit Routes ====================

// Show edit appointment form
router.get('/appointments/edit/:id', checkAdminAuth, adminController.showEditAppointmentForm);
router.get('/appointments/edit', checkAdminAuth, adminController.showEditAppointmentForm);

const passwordResetController = require('../controller/password-reset.controller');
const { runDetailedCleanup } = require('../jobs/cleanup-tokens');

// ==================== PASSWORD RESET MONITORING ====================

// หน้า Password Reset Dashboard
router.get('/password-resets', async (req, res) => {
  try {
    const db = require('../config/db');
    
    // Get statistics
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN expires_at > NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as active_tokens,
        SUM(CASE WHEN expires_at <= NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as expired_tokens,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as successful_resets,
        AVG(CASE WHEN used_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, used_at) END) as avg_completion_time
      FROM password_resets
    `);

    // Get recent activity
    const [recentActivity] = await db.execute(`
      SELECT 
        pr.id,
        pr.email,
        pr.created_at,
        pr.expires_at,
        pr.used_at,
        CASE 
          WHEN pr.used_at IS NOT NULL THEN 'completed'
          WHEN pr.expires_at <= NOW() THEN 'expired'
          ELSE 'active'
        END as status,
        u.user_id,
        CONCAT(
          COALESCE(d.fname, p.fname, 'Unknown'), ' ',
          COALESCE(d.lname, p.lname, 'User')
        ) as user_name,
        CASE 
          WHEN u.role_id = 1 THEN 'Admin'
          WHEN u.role_id = 2 THEN 'Dentist'
          WHEN u.role_id = 3 THEN 'Patient'
          ELSE 'Unknown'
        END as user_role
      FROM password_resets pr
      LEFT JOIN user u ON pr.email = u.email
      LEFT JOIN dentist d ON u.user_id = d.user_id
      LEFT JOIN patient p ON u.user_id = p.user_id
      ORDER BY pr.created_at DESC
      LIMIT 50
    `);

    // Get daily statistics for the last 30 days
    const [dailyStats] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as successful_resets,
        ROUND(AVG(CASE WHEN used_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, used_at) END), 1) as avg_completion_minutes
      FROM password_resets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.render('admin/password-resets', {
      title: 'Password Reset Monitoring',
      stats: stats[0] || {},
      recentActivity: recentActivity || [],
      dailyStats: dailyStats || []
    });

  } catch (error) {
    console.error('Admin password resets page error:', error);
    res.status(500).render('error', {
      message: 'Error loading password reset data',
      error: error
    });
  }
});

// API: Get password reset statistics
router.get('/api/password-resets/stats', async (req, res) => {
  try {
    const db = require('../config/db');
    
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN expires_at <= NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as used,
        ROUND(
          (SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*)) * 100, 
          2
        ) as success_rate
      FROM password_resets
    `);

    res.json({
      success: true,
      data: stats[0] || {}
    });

  } catch (error) {
    console.error('Password reset stats API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// API: Manual cleanup expired tokens
router.post('/api/password-resets/cleanup', async (req, res) => {
  try {
    const result = await runDetailedCleanup();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      data: result
    });

  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed'
    });
  }
});

// API: Revoke specific token (emergency use)
router.post('/api/password-resets/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const db = require('../config/db');
    
    // Mark token as used to invalidate it
    const [result] = await db.execute(
      'UPDATE password_resets SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Token not found or already used'
      });
    }

    // Log the revocation
    console.log(`🚨 Password reset token revoked by admin: ID ${id}, Reason: ${reason || 'No reason provided'}`);

    res.json({
      success: true,
      message: 'Token revoked successfully'
    });

  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke token'
    });
  }
});


// ==================== Enhanced Validation API Routes ====================


// Check ID card availability (for both dentist and patient)
router.get('/api/check-id-card', checkAdminApiAuth, async (req, res) => {
  try {
    const { id_card, exclude_dentist_id, exclude_patient_id } = req.query;
    
    if (!id_card) {
      return res.status(400).json({
        success: false,
        error: 'ID Card parameter is required'
      });
    }

    // Validate ID card format (13 digits)
    if (!/^\d{13}$/.test(id_card)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'ID card must be exactly 13 digits'
      });
    }

    let dentistExists = false;
    let patientExists = false;

    // Check in dentist table (เปลี่ยนจาก id_card เป็น id_card ให้ตรงกับ database)
let dentistQuery = 'SELECT COUNT(*) as count FROM dentist WHERE id_card = ?';
    let dentistParams = [id_card];
    
    if (exclude_dentist_id) {
      dentistQuery += ' AND dentist_id != ?';
      dentistParams.push(exclude_dentist_id);
    }
    
    const [dentistResult] = await db.execute(dentistQuery, dentistParams);
    dentistExists = dentistResult[0].count > 0;

    // Check in patient table
    let patientQuery = 'SELECT COUNT(*) as count FROM patient WHERE id_card = ?';
    let patientParams = [id_card];
    
    if (exclude_patient_id) {
      patientQuery += ' AND patient_id != ?';
      patientParams.push(exclude_patient_id);
    }
    
    const [patientResult] = await db.execute(patientQuery, patientParams);
    patientExists = patientResult[0].count > 0;

    const exists = dentistExists || patientExists;
    let foundIn = '';
    
    if (dentistExists && patientExists) {
      foundIn = 'both dentist and patient records';
    } else if (dentistExists) {
      foundIn = 'dentist records';
    } else if (patientExists) {
      foundIn = 'patient records';
    }

    res.json({
      success: true,
      exists: exists,
      valid: true,
      foundIn: foundIn,
      message: exists ? `ID card already exists in ${foundIn}` : 'ID card is available'
    });

  } catch (error) {
    console.error('Error checking ID card:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check ID card availability'
    });
  }
});

// Enhanced email checking
router.get('/api/check-email-enhanced', checkAdminApiAuth, adminController.checkEmailAvailabilityEnhanced);

// Existing check-email route with enhanced functionality
router.get('/api/check-email', checkAdminApiAuth, async (req, res) => {
  try {
    const { email, exclude_user_id, exclude_dentist_id, exclude_patient_id } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'Invalid email format'
      });
    }

    let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
    let params = [email];

    // Exclude by user_id if provided
    if (exclude_user_id) {
      query += ' AND user_id != ?';
      params.push(exclude_user_id);
    }

    // Exclude by dentist_id if provided
    if (exclude_dentist_id) {
      query += ' AND user_id != (SELECT user_id FROM dentist WHERE dentist_id = ? LIMIT 1)';
      params.push(exclude_dentist_id);
    }

    // Exclude by patient_id if provided  
    if (exclude_patient_id) {
      query += ' AND user_id != (SELECT user_id FROM patient WHERE patient_id = ? LIMIT 1)';
      params.push(exclude_patient_id);
    }

    const [result] = await db.execute(query, params);
    const exists = result[0].count > 0;

    res.json({
      success: true,
      exists: exists,
      valid: true,
      message: exists ? 'Email address is already in use' : 'Email is available'
    });

  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email availability'
    });
  }
});

// Export these functions for use in main admin routes
module.exports.passwordResetRoutes = {
  getDashboard: async (req, res) => {
    // Implementation for admin dashboard password reset summary
  },
  getStats: async () => {
    const stats = await passwordResetController.getPasswordResetStats();
    return stats;
  }
};



// ตรวจสอบเลขใบประกอบวิชาชีพซ้ำ
router.get('/api/check-license', checkAdminApiAuth, adminController.checkLicenseAvailability);

// ========== Admin Booking with Available Slots ==========
router.get('/api/booking/calendar-data', checkAdminApiAuth, adminController.getCalendarDataForAdmin);
router.get('/api/booking/available-dentists', checkAdminApiAuth, adminController.getAvailableDentistsForAdmin);
router.get('/api/booking/available-slots', checkAdminApiAuth, adminController.getAvailableSlotsForAdmin);
router.post('/api/booking/create', checkAdminApiAuth, adminController.bookAppointmentForPatient);
module.exports = router;
