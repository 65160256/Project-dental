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
router.get('/dashboard', checkAdminAuth, adminController.getReportsDashboard);

router.get('/schedule', checkAdminAuth, adminController.getDashboard);

router.get('/api/schedule', checkAdminApiAuth, adminController.getScheduleAPI);

// ==================== Dashboard API Routes ====================
// Get appointment statistics for dashboard
router.get('/api/dashboard/appointments', checkAdminApiAuth, adminController.getAppointmentStatsAPI);
// Get treatment statistics for dashboard  
router.get('/api/dashboard/treatments', checkAdminApiAuth, adminController.getTreatmentStatsAPI);

// Get dashboard summary data
router.get('/api/dashboard/summary', checkAdminApiAuth, async (req, res) => {
  try {
    const db = require('../models/db');
    
    // Get counts for dashboard cards
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
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard summary'
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
router.delete('/treatments/:id/delete', checkAdminAuth, adminController.deleteTreatment);
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

// Update appointment status (confirm/cancel)
router.put('/api/appointments/:id/status', adminController.updateAppointmentStatus);
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

// Update appointment (this is the one causing the 500 error)
router.put('/api/appointments/:id', checkAdminApiAuth, adminController.updateAppointment);


// Create new appointment
router.post('/api/appointments', adminController.createAppointment);

// Delete appointment
router.delete('/api/appointments/:id', checkAdminApiAuth, adminController.deleteAppointment);
// Validate appointment time conflicts
router.get('/api/appointments/validate-time', adminController.validateAppointmentTime);


// Show add appointment form
router.get('/appointments/add', checkAdminAuth, adminController.showAddAppointmentForm);

// Create new appointment (API endpoint)
router.post('/api/appointments', checkAdminApiAuth, adminController.createAppointmentAPI);

// Get available time slots for dentist on specific date
router.get('/api/dentists/:id/schedule', checkAdminApiAuth, adminController.getDentistScheduleAPI);

// ==================== Notification Routes ====================

// Get all notifications
router.get('/api/notifications', adminController.getNotifications);

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

// Get dentists list
router.get('/api/dentists', checkAdminApiAuth, adminController.getDentistsAPI);

// Get treatments list  
router.get('/api/treatments', checkAdminApiAuth, adminController.getTreatmentsAPI);



// Edit appointment page
router.get('/appointments/edit', (req, res) => {
  res.render('edit-appointment'); // or serve the HTML file
});

router.get('/appointments/edit', checkAdminAuth, (req, res) => {
  const appointmentId = req.query.id;
  if (!appointmentId) {
    return res.redirect('/admin/appointments');
  }
  res.render('edit-appointment', { appointmentId: appointmentId });
});

router.get('/appointments/edit/:id', checkAdminAuth, (req, res) => {
  res.render('edit-appointment', { 
    appointmentId: req.params.id,
    title: 'Edit Appointment - Smile Clinic'
  });
});
// Show edit appointment form
router.get('/appointments/edit/:id', checkAdminAuth, adminController.showEditAppointmentForm);

// Alternative route using query parameter
router.get('/appointments/edit', checkAdminAuth, adminController.showEditAppointmentForm);
router.get('/appointments/edit', checkAdminAuth, (req, res) => {
  const appointmentId = req.query.id;
  if (!appointmentId) {
    return res.redirect('/admin/appointments');
  }
  res.render('edit-appointment', { 
    appointmentId: appointmentId,
    title: 'Edit Appointment - Smile Clinic'
  });
});

const passwordResetController = require('../controller/password-reset.controller');
const { runDetailedCleanup } = require('../jobs/cleanup-tokens');

// ==================== PASSWORD RESET MONITORING ====================

// หน้า Password Reset Dashboard
router.get('/password-resets', async (req, res) => {
  try {
    const db = require('../models/db');
    
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
    const db = require('../models/db');
    
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
    
    const db = require('../models/db');
    
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

module.exports = router;