const NotificationModel = require('../models/Notification.model');
const DentistModel = require('../models/Dentist.model');
const PatientModel = require('../models/Patient.model');

const notificationController = {
  // ========== ADMIN NOTIFICATIONS ==========

  // Get all notifications for admin
  getAdminNotifications: async (req, res) => {
  try {
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const unread_only = req.query.unread_only === 'true';
    const type = req.query.type;

    console.log('🔍 Notification Query Debug:', { limit, offset, unread_only, type });

    // ใช้ Model แทน SQL โดยตรง
    const notifications = await NotificationModel.getAdminNotifications({
      unread_only,
      type,
      limit,
      offset
    });

    // Get counts
    const counts = await NotificationModel.getNotificationCounts();

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        ...n,
        time_ago: getTimeAgo(n.created_at)
      })),
      total: counts.total,
      unread: counts.unread,
      limit,
      offset
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือนแอดมิน:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน',
      details: error.message
    });
  }
},

  // ========== DENTIST NOTIFICATIONS ==========
getDentistNotifications: async (req, res) => {
  try {
    // 0) หา userId ให้ครอบคลุมทุกเคส (session หรือ auth middleware)
    const userId =
      req.session?.user?.user_id ??
      req.session?.userId ??
      req.user?.user_id;

    if (!Number.isInteger(Number(userId))) {
      return res.status(401).json({ success: false, error: 'ไม่พบผู้ใช้ในระบบ' });
    }

    // 1) ดึง dentist_id จาก user_id โดยใช้ Model
    const dentist = await DentistModel.findByUserId(Number(userId));

    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }
    const dentistId = Number(dentist.dentist_id);

    // 2) รับและบังคับ limit/offset ให้เป็น int ในช่วงปลอดภัย
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const offset = Number.isInteger(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    // 3) เงื่อนไข unread
    const unread_only = req.query.unread_only === 'true';

    // 4) ใช้ Model แทน SQL โดยตรง
    const notifications = await NotificationModel.getDentistNotifications(dentistId, {
      unread_only,
      limit,
      offset
    });

    // 5) นับ unread เฉพาะของหมอฟันคนนี้
    const counts = await NotificationModel.getNotificationCounts({ dentist_id: dentistId });

    return res.json({
      success: true,
      notifications: notifications.map(n => ({ ...n, time_ago: getTimeAgo(n.created_at) })),
      total: counts.total,
      unread: counts.unread,
      limit,
      offset
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือนทันตแพทย์:', error);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน' });
  }
},




  // ========== PATIENT NOTIFICATIONS ==========

  // Get notifications for specific patient
getPatientNotifications: async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'กรุณาเข้าสู่ระบบ'
      });
    }

    // Get patient_id from user_id โดยใช้ Model
    const patient = await PatientModel.findByUserId(userId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    const patientId = patient.patient_id;

    // รับ parameters
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const unread_only = req.query.unread_only === 'true';

    // ใช้ Model แทน SQL โดยตรง
    const notifications = await NotificationModel.getPatientNotifications(patientId, {
      unread_only,
      limit,
      offset
    });

    // Get unread count for this patient
    const counts = await NotificationModel.getNotificationCounts({ patient_id: patientId });

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        ...n,
        time_ago: getTimeAgo(n.created_at)
      })),
      total: counts.total,
      unread: counts.unread,
      limit,
      offset
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือนผู้ป่วย:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน'
    });
  }
},

  // ========== COMMON FUNCTIONS ==========

  // Mark notification as read
  markAsRead: async (req, res) => {
    try {
      const { id } = req.params;

      // ใช้ Model แทน SQL โดยตรง
      const result = await NotificationModel.markAsReadById(id);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: 'ไม่พบการแจ้งเตือน'
        });
      }

      res.json({
        success: true,
        message: 'อ่านการแจ้งเตือนแล้ว'
      });

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการทำเครื่องหมายว่าอ่านแล้ว:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาด'
      });
    }
  },

  // Mark all as read - อัพเดทเพื่อรองรับ patient
markAllAsRead: async (req, res) => {
  try {
    const userId = req.session.userId || req.session.user?.user_id;
    const userType = req.query.userType || req.body.userType;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'กรุณาเข้าสู่ระบบ'
      });
    }

    let filters = {};

    if (userType === 'dentist') {
      const dentist = await DentistModel.findByUserId(userId);
      if (dentist) {
        filters.dentist_id = dentist.dentist_id;
      }
    } else if (userType === 'patient') {
      const patient = await PatientModel.findByUserId(userId);
      if (patient) {
        filters.patient_id = patient.patient_id;
      }
    }

    // ใช้ Model แทน SQL โดยตรง
    const result = await NotificationModel.markAllAsReadByFilter(filters);

    res.json({
      success: true,
      message: `อ่านการแจ้งเตือนทั้งหมดแล้ว (${result.affectedRows} รายการ)`
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการทำเครื่องหมายอ่านทั้งหมด:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
},

  // Delete notification
  deleteNotification: async (req, res) => {
    try {
      const { id } = req.params;

      // ใช้ Model แทน SQL โดยตรง
      const result = await NotificationModel.deleteById(id);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: 'ไม่พบการแจ้งเตือน'
        });
      }

      res.json({
        success: true,
        message: 'ลบการแจ้งเตือนแล้ว'
      });

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการลบการแจ้งเตือน:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาด'
      });
    }
  },

 // Get unread count - อัพเดทเพื่อรองรับ patient
getUnreadCount: async (req, res) => {
  try {
    const userId = req.session.userId || req.session.user?.user_id;
    const userType = req.query.userType;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'กรุณาเข้าสู่ระบบ'
      });
    }

    let filters = {};

    if (userType === 'dentist') {
      const dentist = await DentistModel.findByUserId(userId);
      if (dentist) {
        filters.dentist_id = dentist.dentist_id;
      }
    } else if (userType === 'patient') {
      const patient = await PatientModel.findByUserId(userId);
      if (patient) {
        filters.patient_id = patient.patient_id;
      }
    }
    // Admin - ไม่ต้องใส่ filters

    // ใช้ Model แทน SQL โดยตรง
    const count = await NotificationModel.getUnreadCount(filters);

    res.json({
      success: true,
      unread_count: count
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงจำนวนที่ยังไม่อ่าน:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
}
};

// Helper function: Calculate time ago
function getTimeAgo(date) {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  
  return past.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

module.exports = notificationController;