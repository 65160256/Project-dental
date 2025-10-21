/**
 * Notification Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับการแจ้งเตือนสำหรับ admin
 * - CRUD operations สำหรับการแจ้งเตือน
 * - การจัดการสถานะการอ่าน
 * - การสร้างการแจ้งเตือนอัตโนมัติ
 */

const db = require('../config/db');

class NotificationAdminModel {
  /**
   * ดึงรายการการแจ้งเตือนทั้งหมด
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} รายการการแจ้งเตือน
   */
  static async getAllNotifications(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.type) {
        whereClause = 'WHERE n.type = ?';
        params.push(filters.type);
      }

      if (filters.is_read !== undefined) {
        whereClause += whereClause ? ' AND n.is_read = ?' : 'WHERE n.is_read = ?';
        params.push(filters.is_read);
      }

      if (filters.patient_id) {
        whereClause += whereClause ? ' AND qd.patient_id = ?' : 'WHERE qd.patient_id = ?';
        params.push(filters.patient_id);
      }

      const [rows] = await db.execute(`
        SELECT 
          n.*,
          CONCAT(p.fname, ' ', p.lname) as patient_name
        FROM notifications n
        LEFT JOIN queue q ON n.queue_id = q.queue_id
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        LEFT JOIN patient p ON qd.patient_id = p.patient_id
        ${whereClause}
        ORDER BY n.created_at DESC
      `, params);

      return rows;
    } catch (error) {
      console.error('Error getting all notifications:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการแจ้งเตือนตาม ID
   * @param {number} notificationId - ID ของการแจ้งเตือน
   * @returns {Object} ข้อมูลการแจ้งเตือน
   */
  static async getNotificationById(notificationId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          n.*,
          CONCAT(p.fname, ' ', p.lname) as patient_name
        FROM notifications n
        LEFT JOIN queue q ON n.queue_id = q.queue_id
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        LEFT JOIN patient p ON qd.patient_id = p.patient_id
        WHERE n.id = ?
      `, [notificationId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting notification by ID:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนใหม่
   * @param {Object} notificationData - ข้อมูลการแจ้งเตือน
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createNotification(notificationData) {
    try {
      const [result] = await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.queue_id || null,
        notificationData.is_read || 0,
        notificationData.is_new || 1
      ]);

      return {
        success: true,
        notificationId: result.insertId,
        message: 'การแจ้งเตือนถูกสร้างเรียบร้อยแล้ว'
      };
    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือน:', error);
      throw error;
    }
  }

  /**
   * อัปเดตข้อมูลการแจ้งเตือน
   * @param {number} notificationId - ID ของการแจ้งเตือน
   * @param {Object} updateData - ข้อมูลที่ต้องการอัปเดต
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updateNotification(notificationId, updateData) {
    try {
      const updateFields = [];
      const values = [];

      if (updateData.type !== undefined) {
        updateFields.push('type = ?');
        values.push(updateData.type);
      }

      if (updateData.title !== undefined) {
        updateFields.push('title = ?');
        values.push(updateData.title);
      }

      if (updateData.message !== undefined) {
        updateFields.push('message = ?');
        values.push(updateData.message);
      }

      if (updateData.is_read !== undefined) {
        updateFields.push('is_read = ?');
        values.push(updateData.is_read);
      }

      if (updateData.is_new !== undefined) {
        updateFields.push('is_new = ?');
        values.push(updateData.is_new);
      }

      if (updateFields.length === 0) {
        return { success: false, message: 'ไม่มีข้อมูลที่ต้องอัปเดต' };
      }

      values.push(notificationId);

      await db.execute(`
        UPDATE notifications SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      return {
        success: true,
        message: 'ข้อมูลการแจ้งเตือนถูกอัปเดตเรียบร้อยแล้ว'
      };
    } catch (error) {
      console.error('Error updating notification:', error);
      throw error;
    }
  }

  /**
   * กำหนดสถานะการอ่าน
   * @param {number} notificationId - ID ของการแจ้งเตือน
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async markAsRead(notificationId) {
    try {
      await db.execute(`
        UPDATE notifications SET is_read = 1, is_new = 0 WHERE id = ?
      `, [notificationId]);

      return {
        success: true,
        message: 'การแจ้งเตือนถูกทำเครื่องหมายว่าอ่านแล้ว'
      };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * กำหนดสถานะการอ่านทั้งหมด
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async markAllAsRead() {
    try {
      const [result] = await db.execute(`
        UPDATE notifications SET is_read = 1, is_new = 0 WHERE is_read = 0
      `);

      return {
        success: true,
        updatedCount: result.affectedRows,
        message: `อัปเดตสถานะการอ่าน ${result.affectedRows} รายการเรียบร้อยแล้ว`
      };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * ลบการแจ้งเตือน
   * @param {number} notificationId - ID ของการแจ้งเตือน
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deleteNotification(notificationId) {
    try {
      await db.execute(
        'DELETE FROM notifications WHERE id = ?',
        [notificationId]
      );

      return {
        success: true,
        message: 'การแจ้งเตือนถูกลบเรียบร้อยแล้ว'
      };
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * ดึงจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
   * @returns {number} จำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
   */
  static async getUnreadCount() {
    try {
      const [result] = await db.execute(`
        SELECT COUNT(*) as count FROM notifications WHERE is_read = 0
      `);

      return result[0].count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * ดึงจำนวนการแจ้งเตือนใหม่
   * @returns {number} จำนวนการแจ้งเตือนใหม่
   */
  static async getNewCount() {
    try {
      const [result] = await db.execute(`
        SELECT COUNT(*) as count FROM notifications WHERE is_new = 1
      `);

      return result[0].count;
    } catch (error) {
      console.error('Error getting new count:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนสำหรับนัดหมาย
   * @param {Object} appointmentData - ข้อมูลนัดหมาย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createAppointmentNotification(appointmentData) {
    try {
      const notificationData = {
        type: 'appointment',
        title: 'นัดหมายใหม่',
        message: `คุณมีนัดหมายใหม่ในวันที่ ${appointmentData.date} เวลา ${appointmentData.time}`,
        patient_id: appointmentData.patient_id,
        is_read: 0,
        is_new: 1
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating appointment notification:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนสำหรับการยกเลิกนัดหมาย
   * @param {Object} appointmentData - ข้อมูลนัดหมาย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createCancellationNotification(appointmentData) {
    try {
      const notificationData = {
        type: 'cancellation',
        title: 'นัดหมายถูกยกเลิก',
        message: `นัดหมายของคุณในวันที่ ${appointmentData.date} เวลา ${appointmentData.time} ถูกยกเลิก`,
        patient_id: appointmentData.patient_id,
        is_read: 0,
        is_new: 1
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating cancellation notification:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนสำหรับการยืนยันนัดหมาย
   * @param {Object} appointmentData - ข้อมูลนัดหมาย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createConfirmationNotification(appointmentData) {
    try {
      const notificationData = {
        type: 'confirmation',
        title: 'นัดหมายได้รับการยืนยัน',
        message: `นัดหมายของคุณในวันที่ ${appointmentData.date} เวลา ${appointmentData.time} ได้รับการยืนยันแล้ว`,
        patient_id: appointmentData.patient_id,
        is_read: 0,
        is_new: 1
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating confirmation notification:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนสำหรับการแจ้งเตือนล่วงหน้า
   * @param {Object} appointmentData - ข้อมูลนัดหมาย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createReminderNotification(appointmentData) {
    try {
      const notificationData = {
        type: 'reminder',
        title: 'แจ้งเตือนนัดหมาย',
        message: `คุณมีนัดหมายในวันพรุ่งนี้ เวลา ${appointmentData.time} กรุณามาตรงเวลา`,
        patient_id: appointmentData.patient_id,
        is_read: 0,
        is_new: 1
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating reminder notification:', error);
      throw error;
    }
  }

  /**
   * สร้างการแจ้งเตือนสำหรับการสร้างบัญชีผู้ใช้
   * @param {Object} userData - ข้อมูลผู้ใช้
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createWelcomeNotification(userData) {
    try {
      const notificationData = {
        type: 'welcome',
        title: 'ยินดีต้อนรับ',
        message: `สวัสดี ${userData.name} ยินดีต้อนรับสู่ระบบนัดหมายทันตกรรม`,
        patient_id: userData.patient_id,
        is_read: 0,
        is_new: 1
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      console.error('Error creating welcome notification:', error);
      throw error;
    }
  }

  /**
   * ดึงการแจ้งเตือนสำหรับผู้ป่วย
   * @param {number} patientId - ID ของผู้ป่วย
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} รายการการแจ้งเตือน
   */
  static async getPatientNotifications(patientId, filters = {}) {
    try {
      let whereClause = 'WHERE patient_id = ?';
      let params = [patientId];

      if (filters.type) {
        whereClause += ' AND type = ?';
        params.push(filters.type);
      }

      if (filters.is_read !== undefined) {
        whereClause += ' AND is_read = ?';
        params.push(filters.is_read);
      }

      const [rows] = await db.execute(`
        SELECT * FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `, [...params, filters.limit || 50]);

      return rows;
    } catch (error) {
      console.error('Error getting patient notifications:', error);
      throw error;
    }
  }

  /**
   * ลบการแจ้งเตือนเก่า
   * @param {number} daysOld - จำนวนวันที่เก่า
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deleteOldNotifications(daysOld = 30) {
    try {
      const [result] = await db.execute(`
        DELETE FROM notifications 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      `, [daysOld]);

      return {
        success: true,
        deletedCount: result.affectedRows,
        message: `ลบการแจ้งเตือนเก่า ${result.affectedRows} รายการเรียบร้อยแล้ว`
      };
    } catch (error) {
      console.error('Error deleting old notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationAdminModel;

