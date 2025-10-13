// routes/patient-notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification.controller');

// Middleware to check if user is logged in as patient
const isPatientLoggedIn = (req, res, next) => {
  const userId = req.session?.userId || req.session?.user?.user_id;
  const roleId = req.session?.role_id || req.session?.role || req.session?.user?.role_id;

  console.log('🔐 Patient Notification Auth Check:', {
    userId,
    roleId,
    sessionKeys: Object.keys(req.session || {})
  });

  if (userId && roleId === 3) {
    next();
  } else {
    console.log('❌ Unauthorized access to patient notifications');
    res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบ' });
  }
};

// Apply middleware to all routes
router.use(isPatientLoggedIn);

// ========== API Routes ==========

// GET /patient/api/notifications - ดึงการแจ้งเตือนทั้งหมด
router.get('/', notificationController.getPatientNotifications);

// GET /patient/api/notifications/unread-count - ดึงจำนวนที่ยังไม่ได้อ่าน
router.get('/unread-count', notificationController.getUnreadCount);

// PUT /patient/api/notifications/:id/read - ทำเครื่องหมายว่าอ่านแล้ว
router.put('/:id/read', notificationController.markAsRead);

// PUT /patient/api/notifications/mark-all-read - ทำเครื่องหมายอ่านทั้งหมด
router.put('/mark-all-read', notificationController.markAllAsRead);

// DELETE /patient/api/notifications/:id - ลบการแจ้งเตือน
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;