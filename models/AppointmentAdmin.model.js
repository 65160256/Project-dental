/**
 * Appointment Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับนัดหมายสำหรับ admin
 * - CRUD operations สำหรับนัดหมาย
 * - การจัดการสถานะนัดหมาย
 * - การตรวจสอบความพร้อมใช้งาน
 */

const db = require('../config/db');

class AppointmentAdminModel {
  /**
   * ดึงรายการนัดหมายทั้งหมด
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} รายการนัดหมาย
   */
  static async getAllAppointments(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.date) {
        whereClause = 'WHERE DATE(qd.date) = ?';
        params.push(filters.date);
      }

      if (filters.status) {
        whereClause += whereClause ? ' AND q.queue_status = ?' : 'WHERE q.queue_status = ?';
        params.push(filters.status);
      }

      if (filters.dentist_id) {
        whereClause += whereClause ? ' AND qd.dentist_id = ?' : 'WHERE qd.dentist_id = ?';
        params.push(filters.dentist_id);
      }

      const [rows] = await db.execute(`
        SELECT 
          qd.queuedetail_id,
          qd.date as appointment_date,
          qd.time as appointment_time,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          p.phone as patient_phone,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.name as treatment_name,
          q.queue_status,
          q.queue_id
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        ORDER BY qd.date DESC, qd.time DESC
      `, params);

      return rows;
    } catch (error) {
      console.error('Error getting all appointments:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลนัดหมายตาม ID
   * @param {number} appointmentId - ID ของนัดหมาย
   * @returns {Object} ข้อมูลนัดหมาย
   */
  static async getAppointmentById(appointmentId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          qd.*,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          p.phone as patient_phone,
          p.id_card as patient_id_card,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty as dentist_specialty,
          t.name as treatment_name,
          t.duration as treatment_duration,
          q.queue_status,
          q.queue_id
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE qd.queuedetail_id = ?
      `, [appointmentId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting appointment by ID:', error);
      throw error;
    }
  }

  /**
   * สร้างนัดหมายใหม่
   * @param {Object} appointmentData - ข้อมูลนัดหมาย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createAppointment(appointmentData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง queuedetail record
      const [queueDetailResult] = await connection.execute(`
        INSERT INTO queuedetail (patient_id, dentist_id, treatment_id, date, time)
        VALUES (?, ?, ?, ?, ?)
      `, [
        appointmentData.patient_id,
        appointmentData.dentist_id,
        appointmentData.treatment_id,
        appointmentData.date,
        appointmentData.time
      ]);

      const queueDetailId = queueDetailResult.insertId;

      // สร้าง queue record
      await connection.execute(`
        INSERT INTO queue (queuedetail_id, patient_id, dentist_id, time, queue_status)
        VALUES (?, ?, ?, ?, ?)
      `, [
        queueDetailId,
        appointmentData.patient_id,
        appointmentData.dentist_id,
        appointmentData.time,
        appointmentData.status || 'pending'
      ]);

      await connection.commit();
      
      return {
        success: true,
        queueDetailId: queueDetailId,
        message: 'นัดหมายถูกสร้างเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error creating appointment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * อัปเดตข้อมูลนัดหมาย
   * @param {number} appointmentId - ID ของนัดหมาย
   * @param {Object} updateData - ข้อมูลที่ต้องการอัปเดต
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updateAppointment(appointmentId, updateData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // อัปเดต queuedetail table
      await connection.execute(`
        UPDATE queuedetail SET
          patient_id = ?, dentist_id = ?, treatment_id = ?, date = ?, time = ?
        WHERE queuedetail_id = ?
      `, [
        updateData.patient_id,
        updateData.dentist_id,
        updateData.treatment_id,
        updateData.date,
        updateData.time,
        appointmentId
      ]);

      // อัปเดต queue table
      await connection.execute(`
        UPDATE queue SET
          patient_id = ?, dentist_id = ?, time = ?, queue_status = ?
        WHERE queuedetail_id = ?
      `, [
        updateData.patient_id,
        updateData.dentist_id,
        updateData.time,
        updateData.status,
        appointmentId
      ]);

      await connection.commit();
      
      return {
        success: true,
        message: 'ข้อมูลนัดหมายถูกอัปเดตเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error updating appointment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * อัปเดตสถานะนัดหมาย
   * @param {number} appointmentId - ID ของนัดหมาย
   * @param {string} status - สถานะใหม่
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updateAppointmentStatus(appointmentId, status) {
    try {
      await db.execute(`
        UPDATE queue SET queue_status = ? WHERE queuedetail_id = ?
      `, [status, appointmentId]);

      return {
        success: true,
        message: 'สถานะนัดหมายถูกอัปเดตเรียบร้อยแล้ว'
      };
    } catch (error) {
      console.error('Error updating appointment status:', error);
      throw error;
    }
  }

  /**
   * ลบนัดหมาย
   * @param {number} appointmentId - ID ของนัดหมาย
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deleteAppointment(appointmentId) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ลบข้อมูลที่เกี่ยวข้อง
      await connection.execute(
        'DELETE FROM queue WHERE queuedetail_id = ?',
        [appointmentId]
      );

      await connection.execute(
        'DELETE FROM queuedetail WHERE queuedetail_id = ?',
        [appointmentId]
      );

      await connection.commit();
      
      return {
        success: true,
        message: 'นัดหมายถูกลบเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error deleting appointment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ตรวจสอบความพร้อมใช้งานของเวลานัดหมาย
   * @param {string} date - วันที่
   * @param {string} time - เวลา
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {number} excludeAppointmentId - ID ของนัดหมายที่ไม่ต้องตรวจสอบ
   * @returns {Object} ผลลัพธ์การตรวจสอบ
   */
  static async validateAppointmentTime(date, time, dentistId, excludeAppointmentId = null) {
    try {
      let query = `
        SELECT COUNT(*) as count 
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) = ? 
          AND HOUR(qd.time) = HOUR(?) 
          AND qd.dentist_id = ?
          AND q.queue_status IN ('pending', 'confirm')
      `;
      let params = [date, time, dentistId];

      if (excludeAppointmentId) {
        query += ' AND qd.queuedetail_id != ?';
        params.push(excludeAppointmentId);
      }

      const [result] = await db.execute(query, params);
      const isAvailable = result[0].count === 0;

      return {
        available: isAvailable,
        message: isAvailable ? 'เวลานี้สามารถจองได้' : 'เวลานี้ถูกจองแล้ว'
      };
    } catch (error) {
      console.error('Error validating appointment time:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการนัดหมาย
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Object} สถิติการนัดหมาย
   */
  static async getAppointmentStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN q.queue_status = 'confirm' THEN 1 ELSE 0 END) as confirmed_count,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN q.queue_status = 'cancel' THEN 1 ELSE 0 END) as cancelled_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
      `, params);

      return stats[0] || {};
    } catch (error) {
      console.error('Error getting appointment stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลนัดหมายที่รอดำเนินการ
   * @returns {number} จำนวนนัดหมายที่รอดำเนินการ
   */
  static async getPendingAppointmentsCount() {
    try {
      const [result] = await db.execute(`
        SELECT COUNT(*) as count 
        FROM queue 
        WHERE queue_status = 'pending'
      `);

      return result[0].count;
    } catch (error) {
      console.error('Error getting pending appointments count:', error);
      throw error;
    }
  }

  /**
   * อัปเดตสถานะนัดหมายหลายรายการ
   * @param {Array} appointmentIds - รายการ ID ของนัดหมาย
   * @param {string} status - สถานะใหม่
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async bulkUpdateAppointmentStatus(appointmentIds, status) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      const placeholders = appointmentIds.map(() => '?').join(',');
      await connection.execute(`
        UPDATE queue SET queue_status = ? WHERE queuedetail_id IN (${placeholders})
      `, [status, ...appointmentIds]);

      await connection.commit();
      
      return {
        success: true,
        updatedCount: appointmentIds.length,
        message: `อัปเดตสถานะนัดหมาย ${appointmentIds.length} รายการเรียบร้อยแล้ว`
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error bulk updating appointment status:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ดึงข้อมูลตารางเวลาของทันตแพทย์
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {string} date - วันที่
   * @returns {Array} ข้อมูลตารางเวลา
   */
  static async getDentistSchedule(dentistId, date) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          ds.schedule_id,
          ds.schedule_date,
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          ds.note
        FROM dentist_schedule ds
        WHERE ds.dentist_id = ? AND ds.schedule_date = ?
        ORDER BY ds.hour
      `, [dentistId, date]);

      return rows;
    } catch (error) {
      console.error('Error getting dentist schedule:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลตารางเวลาของทันตแพทย์สำหรับ API
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {string} startDate - วันที่เริ่มต้น
   * @param {string} endDate - วันที่สิ้นสุด
   * @returns {Array} ข้อมูลตารางเวลา
   */
  static async getDentistScheduleForAPI(dentistId, startDate, endDate) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          ds.schedule_id,
          ds.schedule_date,
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          ds.note
        FROM dentist_schedule ds
        WHERE ds.dentist_id = ? 
          AND ds.schedule_date BETWEEN ? AND ?
        ORDER BY ds.schedule_date, ds.hour
      `, [dentistId, startDate, endDate]);

      return rows;
    } catch (error) {
      console.error('Error getting dentist schedule for API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลนัดหมายสำหรับปฏิทิน
   * @param {string} startDate - วันที่เริ่มต้น
   * @param {string} endDate - วันที่สิ้นสุด
   * @returns {Array} ข้อมูลนัดหมาย
   */
  static async getCalendarData(startDate, endDate) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          qd.queuedetail_id,
          qd.date as start_date,
          qd.time as start_time,
          DATE_ADD(qd.time, INTERVAL t.duration MINUTE) as end_time,
          CONCAT(p.fname, ' ', p.lname) as title,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.name as treatment_name,
          q.queue_status as status
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) BETWEEN ? AND ?
        ORDER BY qd.date, qd.time
      `, [startDate, endDate]);

      return rows;
    } catch (error) {
      console.error('Error getting calendar data:', error);
      throw error;
    }
  }
}

module.exports = AppointmentAdminModel;

