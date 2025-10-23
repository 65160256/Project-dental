// routes/patient-notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification.controller');
const { requirePatient } = require('../middlewares/patient.middleware');

// Apply patient authentication middleware to all routes
router.use(requirePatient);

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