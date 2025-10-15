/**
 * Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับ admin
 * - Profile management
 * - Password management  
 * - Dashboard data
 * - Schedule management
 */

const db = require('../config/db');
const bcrypt = require('bcrypt');

class AdminModel {
  /**
   * ดึงข้อมูล profile ของ admin
   * @param {number} userId - ID ของ user
   * @returns {Object} ข้อมูล profile
   */
  static async getProfile(userId) {
    try {
      const [userRows] = await db.execute(`
        SELECT u.email, u.username, u.last_login, r.rname 
        FROM user u 
        JOIN role r ON u.role_id = r.role_id 
        WHERE u.user_id = ?
      `, [userId]);

      return userRows[0] || null;
    } catch (error) {
      console.error('Error getting admin profile:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบรหัสผ่านปัจจุบัน
   * @param {number} userId - ID ของ user
   * @returns {string} รหัสผ่านที่ hash แล้ว
   */
  static async getCurrentPassword(userId) {
    try {
      const [rows] = await db.execute('SELECT password FROM user WHERE user_id = ?', [userId]);
      return rows.length > 0 ? rows[0].password : null;
    } catch (error) {
      console.error('Error getting current password:', error);
      throw error;
    }
  }

  /**
   * อัปเดตรหัสผ่านใหม่
   * @param {number} userId - ID ของ user
   * @param {string} newPassword - รหัสผ่านใหม่ที่ hash แล้ว
   * @returns {boolean} ผลลัพธ์การอัปเดต
   */
  static async updatePassword(userId, newPassword) {
    try {
      await db.execute('UPDATE user SET password = ? WHERE user_id = ?', [newPassword, userId]);
      return true;
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูล dashboard ของ admin
   * @param {string} start - วันที่เริ่มต้น (optional)
   * @param {string} end - วันที่สิ้นสุด (optional)
   * @returns {Object} ข้อมูล dashboard
   */
  static async getDashboardData(start = null, end = null) {
    try {
      let whereClause = '';
      let params = [];

      if (start && end) {
        whereClause = 'WHERE ds.schedule_date BETWEEN ? AND ?';
        params = [start, end];
      } else {
        whereClause = `WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY 
                       AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY`;
      }

      const [scheduleData] = await db.execute(`
        SELECT 
          ds.schedule_date,
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          ds.note,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty,
          COUNT(q.queue_id) as appointment_count
        FROM dentist_schedule ds
        JOIN dentist d ON ds.dentist_id = d.dentist_id
        LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
          AND DATE(q.time) = ds.schedule_date 
          AND HOUR(q.time) = ds.hour
          AND q.queue_status IN ('pending', 'confirm')
        ${whereClause}
        GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.fname, d.lname, d.specialty
        ORDER BY ds.schedule_date, ds.hour
      `, params);

      return scheduleData;
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูล schedule สำหรับ API
   * @param {string} start - วันที่เริ่มต้น
   * @param {string} end - วันที่สิ้นสุด
   * @returns {Array} ข้อมูล schedule
   */
  static async getScheduleData(start, end) {
    try {
      let whereClause = '';
      let params = [];

      if (start && end) {
        whereClause = 'WHERE ds.schedule_date BETWEEN ? AND ?';
        params = [start, end];
      } else {
        whereClause = `WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY 
                       AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY`;
      }

      const [scheduleData] = await db.execute(`
        SELECT 
          ds.schedule_date,
          ds.hour,
          ds.start_time,
          ds.end_time,
          ds.status,
          ds.note,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty,
          COUNT(q.queue_id) as appointment_count
        FROM dentist_schedule ds
        JOIN dentist d ON ds.dentist_id = d.dentist_id
        LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
          AND DATE(q.time) = ds.schedule_date 
          AND HOUR(q.time) = ds.hour
          AND q.queue_status IN ('pending', 'confirm')
        ${whereClause}
        GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.fname, d.lname, d.specialty
        ORDER BY ds.schedule_date, ds.hour
      `, params);

      return scheduleData;
    } catch (error) {
      console.error('Error getting schedule data:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลนัดหมายตามวันที่
   * @param {string} date - วันที่
   * @returns {Array} ข้อมูลนัดหมาย
   */
  static async getAppointmentsByDate(date) {
    try {
      const [appointments] = await db.execute(`
        SELECT 
          qd.date AS time_start,
          CONCAT(p.fname, ' ', p.lname) AS name,
          t.name AS treatment,
          CONCAT(d.fname, ' ', d.lname) AS dentist,
          p.phone,
          q.queue_status AS status
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) = ?
        ORDER BY qd.date DESC
      `, [date]);

      return appointments;
    } catch (error) {
      console.error('Error getting appointments by date:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลนัดหมายทั้งหมด
   * @param {string} date - วันที่
   * @returns {Array} ข้อมูลนัดหมาย
   */
  static async getAllAppointments(date) {
    try {
      const [appointments] = await db.execute(`
        SELECT 
          qd.date AS time_start,
          CONCAT(p.fname, ' ', p.lname) AS name,
          t.name AS treatment,
          CONCAT(d.fname, ' ', d.lname) AS dentist,
          p.phone,
          q.queue_status AS status
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) = ?
        ORDER BY qd.date DESC
      `, [date]);

      return appointments;
    } catch (error) {
      console.error('Error getting all appointments:', error);
      throw error;
    }
  }
}

module.exports = AdminModel;

