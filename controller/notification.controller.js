const db = require('../config/db');

const notificationController = {
  // ========== ADMIN NOTIFICATIONS ==========
  
  // Get all notifications for admin
  getAdminNotifications: async (req, res) => {
  try {
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const unread_only = req.query.unread_only === 'true';
    const type = req.query.type;
    
    let whereClause = '1=1';
    let params = [];
    
    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }
    
    if (type && type !== 'all') {
      whereClause += ' AND n.type = ?';
      params.push(type);
    }
    
    // เพิ่ม limit และ offset
    params.push(limit);
    params.push(offset);
    
    console.log('🔍 Notification Query Debug:', { limit, offset, params });
    
    // เปลี่ยนจาก db.execute เป็น db.query
    const [notifications] = await db.query(`
      SELECT 
        n.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty as dentist_specialty,
        q.time as appointment_time,
        t.treatment_name
      FROM notifications n
      LEFT JOIN patient p ON n.patient_id = p.patient_id
      LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
      LEFT JOIN queue q ON n.appointment_id = q.queue_id
      LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, params);

    // Get unread count
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM notifications
    `);

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        ...n,
        time_ago: getTimeAgo(n.created_at)
      })),
      total: countResult[0].total,
      unread: countResult[0].unread || 0,
      limit,
      offset
    });

  } catch (error) {
    console.error('❌ Error in getAdminNotifications:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน',
      details: error.message
    });
  }
},

  // ========== DENTIST NOTIFICATIONS ==========
  
  // Get notifications for specific dentist
  getDentistNotifications: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const unread_only = req.query.unread_only === 'true';
    
    // Get dentist_id from user_id
    const [dentistResult] = await db.execute(
      'SELECT dentist_id FROM dentist WHERE user_id = ?',
      [userId]
    );
    
    if (dentistResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลทันตแพทย์'
      });
    }
    
    const dentistId = dentistResult[0].dentist_id;
    
    let whereClause = 'n.dentist_id = ?';
    let params = [dentistId];
    
    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }
    
    // แก้ไข: ตรวจสอบค่า limit และ offset
    const finalLimit = isNaN(limit) ? 20 : limit;
    const finalOffset = isNaN(offset) ? 0 : offset;
    
    const [notifications] = await db.execute(`
      SELECT 
        n.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        q.time as appointment_time,
        t.treatment_name
      FROM notifications n
      LEFT JOIN patient p ON n.patient_id = p.patient_id
      LEFT JOIN queue q ON n.appointment_id = q.queue_id
      LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, finalLimit, finalOffset]);

    // Get unread count for this dentist
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM notifications
      WHERE dentist_id = ?
    `, [dentistId]);

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        ...n,
        time_ago: getTimeAgo(n.created_at)
      })),
      total: countResult[0].total,
      unread: countResult[0].unread
    });

  } catch (error) {
    console.error('Error in getDentistNotifications:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการแจ้งเตือน'
    });
  }
},



  // ========== PATIENT NOTIFICATIONS ==========
  
  // Get notifications for specific patient
 getPatientNotifications: async (req, res) => {
  try {
    const userId = req.session.userId;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const unread_only = req.query.unread_only === 'true';
    
    // Get patient_id from user_id
    const [patientResult] = await db.execute(
      'SELECT patient_id FROM patient WHERE user_id = ?',
      [userId]
    );
    
    if (patientResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }
    
    const patientId = patientResult[0].patient_id;
    
    let whereClause = 'n.patient_id = ?';
    let params = [patientId];
    
    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }
    
    // แก้ไข: ตรวจสอบค่า limit และ offset
    const finalLimit = isNaN(limit) ? 20 : limit;
    const finalOffset = isNaN(offset) ? 0 : offset;
    
    const [notifications] = await db.execute(`
      SELECT 
        n.*,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        q.time as appointment_time,
        q.queue_status,
        t.treatment_name
      FROM notifications n
      LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
      LEFT JOIN queue q ON n.appointment_id = q.queue_id
      LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, finalLimit, finalOffset]);

    // Get unread count for this patient
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM notifications
      WHERE patient_id = ?
    `, [patientId]);

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        ...n,
        time_ago: getTimeAgo(n.created_at)
      })),
      total: countResult[0].total,
      unread: countResult[0].unread
    });

  } catch (error) {
    console.error('Error in getPatientNotifications:', error);
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
      
      const [result] = await db.execute(`
        UPDATE notifications 
        SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [id]);

      if (result.affectedRows === 0) {
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
      console.error('Error in markAsRead:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาด'
      });
    }
  },

  // Mark all as read
  markAllAsRead: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const userType = req.query.userType; // 'admin', 'dentist', or 'patient'
      
      let whereClause = '';
      let params = [];
      
      if (userType === 'dentist') {
        const [dentistResult] = await db.execute(
          'SELECT dentist_id FROM dentist WHERE user_id = ?',
          [userId]
        );
        if (dentistResult.length > 0) {
          whereClause = 'WHERE dentist_id = ?';
          params = [dentistResult[0].dentist_id];
        }
      } else if (userType === 'patient') {
        const [patientResult] = await db.execute(
          'SELECT patient_id FROM patient WHERE user_id = ?',
          [userId]
        );
        if (patientResult.length > 0) {
          whereClause = 'WHERE patient_id = ?';
          params = [patientResult[0].patient_id];
        }
      }
      
      const [result] = await db.execute(`
        UPDATE notifications 
        SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP
        ${whereClause}
      `, params);

      res.json({
        success: true,
        message: `อ่านการแจ้งเตือนทั้งหมดแล้ว (${result.affectedRows} รายการ)`
      });

    } catch (error) {
      console.error('Error in markAllAsRead:', error);
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
      
      const [result] = await db.execute(
        'DELETE FROM notifications WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
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
      console.error('Error in deleteNotification:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาด'
      });
    }
  },

  // Get unread count
  getUnreadCount: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const userType = req.query.userType;
      
      let whereClause = '';
      let params = [];
      
      if (userType === 'dentist') {
        const [dentistResult] = await db.execute(
          'SELECT dentist_id FROM dentist WHERE user_id = ?',
          [userId]
        );
        if (dentistResult.length > 0) {
          whereClause = 'WHERE dentist_id = ? AND is_read = 0';
          params = [dentistResult[0].dentist_id];
        }
      } else if (userType === 'patient') {
        const [patientResult] = await db.execute(
          'SELECT patient_id FROM patient WHERE user_id = ?',
          [userId]
        );
        if (patientResult.length > 0) {
          whereClause = 'WHERE patient_id = ? AND is_read = 0';
          params = [patientResult[0].patient_id];
        }
      } else {
        whereClause = 'WHERE is_read = 0';
      }
      
      const [result] = await db.execute(`
        SELECT COUNT(*) as count FROM notifications ${whereClause}
      `, params);

      res.json({
        success: true,
        unread_count: result[0].count
      });

    } catch (error) {
      console.error('Error in getUnreadCount:', error);
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