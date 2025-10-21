const db = require('../config/db');

/**
 * Notification Model
 * จัดการการแจ้งเตือนในระบบ
 */
class NotificationModel {
  /**
   * สร้างการแจ้งเตือนใหม่
   * @param {Object} notificationData - { userId, title, message, type, relatedId }
   * @returns {Promise<Object>} { notificationId, success }
   */
  static async create(notificationData) {
    const {
      userId,
      title,
      message,
      type = 'info',
      relatedId = null,
      queueId = null
    } = notificationData;

    // Validate required fields
    if (!title || !message) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (title, message)');
    }

    const [result] = await db.execute(
      `INSERT INTO notifications (title, message, type, queue_id, is_read, is_new, created_at)
       VALUES (?, ?, ?, ?, 0, 1, NOW())`,
      [title, message, type, queueId]
    );

    return {
      notificationId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาการแจ้งเตือนด้วย ID
   * @param {number} notificationId
   * @returns {Promise<Object|null>}
   */
  static async findById(notificationId) {
    const [rows] = await db.execute(
      `SELECT * FROM notifications WHERE id = ?`,
      [notificationId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงการแจ้งเตือนทั้งหมดของผู้ใช้
   * @param {number} userId
   * @param {Object} options - { unreadOnly, limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByUserId(userId, options = {}) {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    let query = `
      SELECT n.*
      FROM notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.patient_id = ?
    `;

    const params = [userId];

    if (unreadOnly) {
      query += ` AND n.is_read = 0`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ทำเครื่องหมายว่าอ่านแล้ว
   * @param {number} notificationId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAsRead(notificationId) {
    const [result] = await db.execute(
      `UPDATE notifications SET is_read = 1, is_new = 0, updated_at = NOW() WHERE id = ?`,
      [notificationId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ทำเครื่องหมายว่าอ่านแล้วทั้งหมดของผู้ใช้
   * @param {number} userId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAllAsRead(userId) {
    const [result] = await db.execute(
      `UPDATE notifications n
       LEFT JOIN queue q ON n.queue_id = q.queue_id
       LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       SET n.is_read = 1, n.is_new = 0, n.updated_at = NOW()
       WHERE qd.patient_id = ? AND n.is_read = 0`,
      [userId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบการแจ้งเตือนที่เก่ากว่า X วัน
   * @param {number} days - จำนวนวันย้อนหลัง (default = 30)
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteOld(days = 30) {
    const [result] = await db.execute(
      `DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบการแจ้งเตือนทั้งหมดของผู้ใช้
   * @param {number} userId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteAllByUserId(userId) {
    const [result] = await db.execute(
      `DELETE n FROM notifications n
       LEFT JOIN queue q ON n.queue_id = q.queue_id
       LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.patient_id = ?`,
      [userId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบการแจ้งเตือนเดี่ยว
   * @param {number} notificationId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(notificationId) {
    const [result] = await db.execute(
      `DELETE FROM notifications WHERE id = ?`,
      [notificationId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * นับจำนวนการแจ้งเตือน
   * @param {number} userId
   * @param {boolean} unreadOnly - นับเฉพาะที่ยังไม่อ่าน (default = false)
   * @returns {Promise<number>}
   */
  static async count(userId, unreadOnly = false) {
    let query = `SELECT COUNT(*) as total 
                 FROM notifications n
                 LEFT JOIN queue q ON n.queue_id = q.queue_id
                 LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
                 WHERE qd.patient_id = ?`;
    const params = [userId];

    if (unreadOnly) {
      query += ` AND n.is_read = 0`;
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * ดึงการแจ้งเตือนที่ยังไม่อ่านของผู้ใช้
   * @param {number} userId
   * @param {number} limit - จำนวนสูงสุด (default = 10)
   * @returns {Promise<Array>}
   */
  static async findUnreadByUserId(userId, limit = 10) {
    const [rows] = await db.execute(
      `SELECT n.*
       FROM notifications n
       LEFT JOIN queue q ON n.queue_id = q.queue_id
       LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.patient_id = ? AND n.is_read = 0
       ORDER BY n.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    return rows;
  }

  /**
   * ดึงการแจ้งเตือนล่าสุดของผู้ใช้
   * @param {number} userId
   * @param {number} limit - จำนวนสูงสุด (default = 5)
   * @returns {Promise<Array>}
   */
  static async findLatestByUserId(userId, limit = 5) {
    const [rows] = await db.execute(
      `SELECT n.*
       FROM notifications n
       LEFT JOIN queue q ON n.queue_id = q.queue_id
       LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.patient_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );

    return rows;
  }

  /**
   * ดึงการแจ้งเตือนตาม type
   * @param {number} userId
   * @param {string} type - 'info', 'warning', 'error', 'success'
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByType(userId, type, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [rows] = await db.execute(
      `SELECT n.*
       FROM notifications n
       LEFT JOIN queue q ON n.queue_id = q.queue_id
       LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.patient_id = ? AND n.type = ?
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, type, limit, offset]
    );

    return rows;
  }

  /**
   * ค้นหาการแจ้งเตือนที่เกี่ยวข้องกับ related_id
   * @param {number} relatedId
   * @param {string} type - optional
   * @returns {Promise<Array>}
   */
  static async findByRelatedId(relatedId, type = null) {
    let query = `SELECT * FROM notifications WHERE queue_id = ?`;
    const params = [relatedId];

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * สร้างการแจ้งเตือนหลายรายการพร้อมกัน (bulk insert)
   * @param {Array} notifications - [{ userId, title, message, type, relatedId }, ...]
   * @returns {Promise<Object>} { success, insertedCount }
   */
  static async createBulk(notifications) {
    if (!notifications || notifications.length === 0) {
      throw new Error('กรุณาระบุข้อมูลการแจ้งเตือน');
    }

    const values = notifications.map(n => [
      n.title,
      n.message,
      n.type || 'info',
      n.queueId || null
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    const [result] = await db.execute(
      `INSERT INTO notifications (title, message, type, queue_id, is_read, is_new)
       VALUES ${placeholders}`,
      flatValues.map(v => [v[0], v[1], v[2], v[3], 0, 1]).flat()
    );

    return {
      success: true,
      insertedCount: result.affectedRows
    };
  }

  /**
   * อัปเดตการแจ้งเตือน
   * @param {number} notificationId
   * @param {Object} updateData - { title, message, type }
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(notificationId, updateData) {
    const { title, message, type } = updateData;

    // Check if notification exists
    const existing = await this.findById(notificationId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลการแจ้งเตือน');
    }

    const [result] = await db.execute(
      `UPDATE notifications
       SET title = ?, message = ?, type = ?
       WHERE id = ?`,
      [title, message, type, notificationId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  // ========== METHODS FOR CONTROLLER REFACTORING ==========

  /**
   * ดึงการแจ้งเตือนสำหรับ Admin พร้อม JOIN ข้อมูล
   * @param {Object} filters - { unread_only, type, limit, offset }
   * @returns {Promise<Array>}
   */
  static async getAdminNotifications(filters = {}) {
    const { unread_only = false, type = null, limit = 20, offset = 0 } = filters;

    let whereClause = '1=1';
    let params = [];

    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }

    if (type && type !== 'all') {
      whereClause += ' AND n.type = ?';
      params.push(type);
    }

    params.push(limit, offset);

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
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN patient p ON qd.patient_id = p.patient_id
      LEFT JOIN dentist d ON qd.dentist_id = d.dentist_id
      LEFT JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return notifications;
  }

  /**
   * ดึงการแจ้งเตือนสำหรับ Dentist พร้อม JOIN ข้อมูล
   * @param {number} dentistId
   * @param {Object} filters - { unread_only, limit, offset }
   * @returns {Promise<Array>}
   */
  static async getDentistNotifications(dentistId, filters = {}) {
    const { unread_only = false, limit = 20, offset = 0 } = filters;

    let whereClause = 'qd.dentist_id = ?';
    const params = [dentistId];

    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }

    const sql = `
      SELECT
        n.*,
        p.fname AS patient_fname,
        p.lname AS patient_lname,
        p.phone AS patient_phone,
        q.time AS appointment_time,
        t.treatment_name
      FROM notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN patient p ON qd.patient_id = p.patient_id
      LEFT JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [notifications] = await db.execute(sql, params);
    return notifications;
  }

  /**
   * ดึงการแจ้งเตือนสำหรับ Patient พร้อม JOIN ข้อมูล
   * @param {number} patientId
   * @param {Object} filters - { unread_only, limit, offset }
   * @returns {Promise<Array>}
   */
  static async getPatientNotifications(patientId, filters = {}) {
    const { unread_only = false, limit = 20, offset = 0 } = filters;

    let whereClause = 'qd.patient_id = ?';
    let params = [patientId];

    if (unread_only) {
      whereClause += ' AND n.is_read = 0';
    }

    const sql = `
      SELECT
        n.*,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        q.time as appointment_time,
        q.queue_status,
        t.treatment_name
      FROM notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN dentist d ON qd.dentist_id = d.dentist_id
      LEFT JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [notifications] = await db.execute(sql, params);
    return notifications;
  }

  /**
   * นับจำนวนการแจ้งเตือนทั้งหมดและที่ยังไม่อ่าน
   * @param {Object} filters - { dentist_id, patient_id } - ไม่ระบุ = Admin (ทั้งหมด)
   * @returns {Promise<Object>} { total, unread }
   */
  static async getNotificationCounts(filters = {}) {
    const { dentist_id = null, patient_id = null } = filters;

    let whereClause = '';
    let params = [];

    if (dentist_id) {
      whereClause = 'WHERE qd.dentist_id = ?';
      params.push(dentist_id);
    } else if (patient_id) {
      whereClause = 'WHERE qd.patient_id = ?';
      params.push(patient_id);
    }

    const [countResult] = await db.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN n.is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      ${whereClause}
    `, params);

    return {
      total: countResult[0].total || 0,
      unread: countResult[0].unread || 0
    };
  }

  /**
   * ทำเครื่องหมายว่าอ่านแล้ว (update is_read และ is_new)
   * @param {number} notificationId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAsReadById(notificationId) {
    const [result] = await db.execute(`
      UPDATE notifications
      SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [notificationId]);

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ทำเครื่องหมายว่าอ่านแล้วทั้งหมดตาม dentist_id หรือ patient_id
   * @param {Object} filters - { dentist_id, patient_id }
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAllAsReadByFilter(filters = {}) {
    const { dentist_id = null, patient_id = null } = filters;

    let whereClause = '';
    let params = [];

    if (dentist_id) {
      whereClause = 'WHERE qd.dentist_id = ?';
      params.push(dentist_id);
    } else if (patient_id) {
      whereClause = 'WHERE qd.patient_id = ?';
      params.push(patient_id);
    }

    const [result] = await db.execute(`
      UPDATE notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      SET n.is_read = 1, n.is_new = 0, n.updated_at = CURRENT_TIMESTAMP
      ${whereClause}
    `, params);

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบการแจ้งเตือน
   * @param {number} notificationId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteById(notificationId) {
    const [result] = await db.execute(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * นับจำนวนที่ยังไม่อ่าน
   * @param {Object} filters - { dentist_id, patient_id } - ไม่ระบุ = Admin
   * @returns {Promise<number>}
   */
  static async getUnreadCount(filters = {}) {
    const { dentist_id = null, patient_id = null } = filters;

    let whereClause = 'WHERE n.is_read = 0';
    let params = [];

    if (dentist_id) {
      whereClause = 'WHERE qd.dentist_id = ? AND n.is_read = 0';
      params.push(dentist_id);
    } else if (patient_id) {
      whereClause = 'WHERE qd.patient_id = ? AND n.is_read = 0';
      params.push(patient_id);
    }

    const [result] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM notifications n
      LEFT JOIN queue q ON n.queue_id = q.queue_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      ${whereClause}
    `, params);

    return result[0].count;
  }
}

module.exports = NotificationModel;
