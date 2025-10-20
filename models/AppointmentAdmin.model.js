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

      // Handle date filtering - prioritize date range over single date
      if (filters.date_from || filters.date_to) {
        if (filters.date_from && filters.date_to) {
          whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
          params.push(filters.date_from, filters.date_to);
        } else if (filters.date_from) {
          whereClause = 'WHERE DATE(qd.date) >= ?';
          params.push(filters.date_from);
        } else if (filters.date_to) {
          whereClause = 'WHERE DATE(qd.date) <= ?';
          params.push(filters.date_to);
        }
      } else if (filters.date) {
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

      if (filters.treatment_id) {
        whereClause += whereClause ? ' AND qd.treatment_id = ?' : 'WHERE qd.treatment_id = ?';
        params.push(filters.treatment_id);
      }

      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        whereClause += whereClause ? 
          ' AND (CONCAT(p.fname, " ", p.lname) LIKE ? OR t.treatment_name LIKE ? OR CONCAT(d.fname, " ", d.lname) LIKE ? OR p.phone LIKE ?)' :
          'WHERE (CONCAT(p.fname, " ", p.lname) LIKE ? OR t.treatment_name LIKE ? OR CONCAT(d.fname, " ", d.lname) LIKE ? OR p.phone LIKE ?)';
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      const [rows] = await db.execute(`
        SELECT 
          qd.queuedetail_id,
          qd.date as appointment_date,
          q.time as appointment_time,
          qd.note,
          q.time as time,
          DATE_ADD(q.time, INTERVAL t.duration MINUTE) as time_end,
          qd.dentist_id,
          qd.treatment_id,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          p.phone as phone,
          p.phone as patient_phone,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name as treatment_name,
          q.queue_status,
          q.queue_id
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        ORDER BY qd.date DESC, q.time DESC
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
          q.time,
          DATE_ADD(q.time, INTERVAL t.duration MINUTE) as time_end,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          p.phone as phone,
          p.phone as patient_phone,
          p.id_card as patient_id_card,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty as dentist_specialty,
          t.treatment_name as treatment_name,
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
      const { patient_id, treatment_id, dentist_id, appointment_time } = appointmentData;
      
      // Parse appointment time
      const appointmentDate = new Date(appointment_time);
      const dateStr = appointmentDate.toISOString().split('T')[0];
      const hour = appointmentDate.getHours();

      // Check if dentist is available at the requested time
      const [scheduleCheck] = await connection.execute(`
        SELECT COUNT(*) as schedule_exists
        FROM dentist_schedule 
        WHERE dentist_id = ? AND schedule_date = ? AND hour = ? AND status = 'working'
      `, [dentist_id, dateStr, hour]);

      if (scheduleCheck[0].schedule_exists === 0) {
        return {
          success: false,
          error: 'Dentist is not available at the requested time'
        };
      }

      // Check for existing appointments at the same time
      const [existingAppointment] = await connection.execute(`
        SELECT COUNT(*) as appointment_exists
        FROM queue 
        WHERE dentist_id = ? AND time = ? AND queue_status IN ('pending', 'confirm')
      `, [dentist_id, appointment_time]);

      if (existingAppointment[0].appointment_exists > 0) {
        return {
          success: false,
          error: 'Time slot is already booked'
        };
      }

      await connection.beginTransaction();

      // สร้าง queuedetail record
      const [queueDetailResult] = await connection.execute(`
        INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [patient_id, treatment_id, dentist_id, dateStr]);

      const queueDetailId = queueDetailResult.insertId;

      // สร้าง queue record
      const [queueResult] = await connection.execute(`
        INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, [queueDetailId, patient_id, treatment_id, dentist_id, appointment_time]);

      const queueId = queueResult.insertId;

      await connection.commit();

      // Get appointment details for response
      const [appointmentDetails] = await connection.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.queue_id = ?
      `, [queueId]);
      
      return {
        success: true,
        appointment: {
          id: queueId,
          time: appointment_time,
          patient_name: appointmentDetails[0].patient_name,
          dentist_name: appointmentDetails[0].dentist_name,
          treatment_name: appointmentDetails[0].treatment_name,
          status: 'pending'
        },
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

      // อัปเดต queuedetail table - แปลง undefined เป็น null
      await connection.execute(`
        UPDATE queuedetail SET
          patient_id = ?, dentist_id = ?, treatment_id = ?, date = ?, note = ?
        WHERE queuedetail_id = ?
      `, [
        updateData.patient_id || null,
        updateData.dentist_id || null,
        updateData.treatment_id || null,
        updateData.date || null,
        updateData.note || null,
        appointmentId
      ]);

      // อัปเดต queue table - แปลง undefined เป็น null
      await connection.execute(`
        UPDATE queue SET
          patient_id = ?, dentist_id = ?, time = ?, queue_status = ?
        WHERE queuedetail_id = ?
      `, [
        updateData.patient_id || null,
        updateData.dentist_id || null,
        updateData.time || null,
        updateData.status || null,
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
          AND HOUR(q.time) = HOUR(?) 
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
          q.time as start_time,
          DATE_ADD(q.time, INTERVAL t.duration MINUTE) as end_time,
          CONCAT(p.fname, ' ', p.lname) as title,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name as treatment_name,
          q.queue_status as status
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) BETWEEN ? AND ?
        ORDER BY qd.date, q.time
      `, [startDate, endDate]);

      return rows;
    } catch (error) {
      console.error('Error getting calendar data:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบความขัดแย้งของเวลานัดหมาย
   * @param {Object} params - พารามิเตอร์การตรวจสอบ
   * @returns {Array} รายการความขัดแย้ง
   */
  static async validateAppointmentTime(params) {
    try {
      const { dentist_id, appointment_datetime, exclude_queue_id } = params;
      
      let query = `
        SELECT 
          q.queue_id,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          q.time
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        WHERE q.dentist_id = ? 
          AND q.time = ? 
          AND q.queue_status IN ('pending', 'confirm')
      `;
      
      let queryParams = [dentist_id, appointment_datetime];
      
      if (exclude_queue_id) {
        query += ' AND q.queue_id != ?';
        queryParams.push(exclude_queue_id);
      }
      
      const [conflicts] = await db.execute(query, queryParams);
      return conflicts;
    } catch (error) {
      console.error('Error validating appointment time:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลตารางงานของทันตแพทย์
   * @param {Object} params - พารามิเตอร์การค้นหา
   * @returns {Array} รายการตารางงาน
   */
  static async getDentistScheduleData(params) {
    try {
      const { dentistId, start_date, end_date } = params;

      // หมายเหตุ: DAYOFWEEK() ใน MySQL => อาทิตย์=1, จันทร์=2, ... เสาร์=7
      // เราคัดวันอาทิตย์ทิ้ง (<> 1) เพื่อให้ "อาทิตย์ปิด" เสมอ
      const [rows] = await db.execute(
        `
        SELECT 
          ds.schedule_date,
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          ds.note,
          d.dentist_id,
          d.fname,
          d.lname,
          d.specialty,
          COUNT(q.queue_id) as appointment_count
        FROM dentist_schedule ds
        JOIN dentist d ON ds.dentist_id = d.dentist_id
        LEFT JOIN queue q 
          ON q.dentist_id = ds.dentist_id
         AND DATE(q.time) = ds.schedule_date
         AND HOUR(q.time) = ds.hour
         AND q.queue_status IN ('pending','confirm')
        WHERE ds.dentist_id = ?
          AND ds.schedule_date BETWEEN ? AND ?
          AND DAYOFWEEK(ds.schedule_date) <> 1    -- << อาทิตย์ปิด
        GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.dentist_id, d.fname, d.lname, d.specialty
        ORDER BY ds.schedule_date, ds.hour
        `,
        [dentistId, start_date, end_date]
      );

      // แปลงให้ง่ายต่อการแสดงผลในปฏิทิน (รวมช่วงเวลาทำงานต่อเนื่อง)
      const schedules = rows.map(r => ({
        schedule_date: r.schedule_date.toISOString().split('T')[0],
        hour: r.hour,
        start_time: r.start_time.substring(0,5), // HH:MM
        end_time: r.end_time.substring(0,5),
        status: r.status, // 'working' หรือ 'dayoff'
        note: r.note || null,
        appointment_count: r.appointment_count || 0
      }));

      return schedules;
    } catch (error) {
      console.error('Error getting dentist schedule data:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลตารางงานของทันตแพทย์สำหรับ API
   * @param {Object} params - พารามิเตอร์การค้นหา
   * @returns {Array} รายการตารางงาน
   */
  static async getDentistScheduleForAPI(params) {
    try {
      const { dentistId, date } = params;

      const [scheduleData] = await db.execute(`
        SELECT 
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          COUNT(q.queue_id) as booked_count
        FROM dentist_schedule ds
        LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
          AND DATE(q.time) = ds.schedule_date 
          AND HOUR(q.time) = ds.hour
          AND q.queue_status IN ('pending', 'confirm')
        WHERE ds.dentist_id = ? 
          AND ds.schedule_date = ?
          AND ds.status = 'working'
        GROUP BY ds.hour, ds.start_time, ds.end_time, ds.status
        ORDER BY ds.hour
      `, [dentistId, date]);

      return scheduleData;
    } catch (error) {
      console.error('Error getting dentist schedule for API:', error);
      throw error;
    }
  }
}

module.exports = AppointmentAdminModel;

