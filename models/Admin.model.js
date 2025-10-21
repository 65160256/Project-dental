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
        SELECT 
          u.user_id,
          u.email, 
          u.username, 
          u.last_login, 
          u.created_at,
          u.role_id,
          r.rname as role_name
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
        LEFT JOIN queue q ON DATE(q.time) = ds.schedule_date 
          AND HOUR(q.time) = ds.hour
          AND q.queue_status IN ('pending', 'confirm')
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id AND qd.dentist_id = ds.dentist_id
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

      // ดึงข้อมูลตารางเวรที่แพทย์เข้าเวรจริงๆ
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
          d.dentist_id,
          d.fname,
          d.lname,
          COUNT(q.queue_id) as appointment_count,
          ds.created_at,
          ds.updated_at
        FROM dentist_schedule ds
        JOIN dentist d ON ds.dentist_id = d.dentist_id
        LEFT JOIN queue q ON DATE(q.time) = ds.schedule_date 
          AND HOUR(q.time) = ds.hour
          AND q.queue_status IN ('pending', 'confirm')
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id AND qd.dentist_id = ds.dentist_id
        ${whereClause}
        AND ds.status = 'working'
        GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.fname, d.lname, d.specialty, d.dentist_id, ds.created_at, ds.updated_at
        ORDER BY ds.schedule_date, ds.hour
      `, params);

      return scheduleData;
    } catch (error) {
      console.error('Error getting schedule data:', error);
      throw error;
    }
  }

  /**
   * สร้างข้อมูลตารางเวลาเริ่มต้นตามเวลาทำการของคลินิก
   * @param {string} start - วันที่เริ่มต้น
   * @param {string} end - วันที่สิ้นสุด
   * @returns {Array} ข้อมูล schedule เริ่มต้น
   */
  static async generateDefaultScheduleData(start, end) {
    try {
      // ดึงรายการทันตแพทย์ทั้งหมด
      const [dentists] = await db.execute(`
        SELECT dentist_id, fname, lname, specialty 
        FROM dentist 
        WHERE status = 'active'
        ORDER BY fname, lname
      `);

      if (dentists.length === 0) {
        return [];
      }

      const scheduleData = [];
      const startDate = new Date(start || new Date().toISOString().split('T')[0]);
      const endDate = new Date(end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      // วนลูปผ่านแต่ละวันในช่วงเวลาที่กำหนด
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay(); // 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์
        const dateStr = date.toISOString().split('T')[0];

        // ตรวจสอบว่าวันนี้เปิดทำการหรือไม่
        // อาทิตย์ (0) = ปิด, ข้ามไปเลยไม่สร้างข้อมูล
        if (dayOfWeek === 0) {
          // วันอาทิตย์ - ข้ามไปเลย ไม่สร้างข้อมูลในปฏิทิน
          continue;
        } else {
          // วันจันทร์-เสาร์ - เปิดทำการ 10:00-20:00
          dentists.forEach(dentist => {
            // สร้างช่วงเวลาทำงาน 10 ชั่วโมง (10:00-20:00)
            for (let hour = 10; hour < 20; hour++) {
              scheduleData.push({
                schedule_date: new Date(date),
                hour: hour,
                start_time: `${hour.toString().padStart(2, '0')}:00:00`,
                end_time: `${(hour + 1).toString().padStart(2, '0')}:00:00`,
                status: 'working',
                note: '',
                dentist_name: `${dentist.fname} ${dentist.lname}`,
                specialty: dentist.specialty,
                dentist_id: dentist.dentist_id,
                fname: dentist.fname,
                lname: dentist.lname,
                appointment_count: 0
              });
            }
          });
        }
      }

      return scheduleData;
    } catch (error) {
      console.error('Error generating default schedule data:', error);
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
          t.treatment_name AS treatment,
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
          t.treatment_name AS treatment,
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

  /**
   * ตรวจสอบความพร้อมใช้งานของเลขบัตรประชาชน
   * @param {Object} params - พารามิเตอร์การตรวจสอบ
   * @returns {Object} ผลลัพธ์การตรวจสอบ
   */
  static async checkIdCardAvailability(params) {
    try {
      const { id_card, exclude_dentist_id, exclude_patient_id } = params;

      let dentistExists = false;
      let patientExists = false;

      // Check in dentist table
      let dentistQuery = 'SELECT COUNT(*) as count FROM dentist WHERE id_card = ?';
      let dentistParams = [id_card];
      
      if (exclude_dentist_id) {
        dentistQuery += ' AND dentist_id != ?';
        dentistParams.push(exclude_dentist_id);
      }
      
      const [dentistResult] = await db.execute(dentistQuery, dentistParams);
      dentistExists = dentistResult[0].count > 0;

      // Check in patient table  
      let patientQuery = 'SELECT COUNT(*) as count FROM patient WHERE id_card = ?';
      let patientParams = [id_card];
      
      if (exclude_patient_id) {
        patientQuery += ' AND patient_id != ?';
        patientParams.push(exclude_patient_id);
      }
      
      const [patientResult] = await db.execute(patientQuery, patientParams);
      patientExists = patientResult[0].count > 0;

      const exists = dentistExists || patientExists;
      let foundIn = '';
      
      if (dentistExists && patientExists) {
        foundIn = 'both dentist and patient records';
      } else if (dentistExists) {
        foundIn = 'dentist records';
      } else if (patientExists) {
        foundIn = 'patient records';
      }

      return { exists, foundIn };
    } catch (error) {
      console.error('Error checking ID card availability:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบความพร้อมใช้งานของอีเมล
   * @param {Object} params - พารามิเตอร์การตรวจสอบ
   * @returns {Object} ผลลัพธ์การตรวจสอบ
   */
  static async checkEmailAvailabilityEnhanced(params) {
    try {
      const { email, exclude_user_id, exclude_dentist_id, exclude_patient_id } = params;

      let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
      let queryParams = [email];

      // Exclude by user_id if provided
      if (exclude_user_id) {
        query += ' AND user_id != ?';
        queryParams.push(exclude_user_id);
      }

      // Exclude by dentist_id if provided
      if (exclude_dentist_id) {
        query += ' AND user_id != (SELECT user_id FROM dentist WHERE dentist_id = ?)';
        queryParams.push(exclude_dentist_id);
      }

      // Exclude by patient_id if provided  
      if (exclude_patient_id) {
        query += ' AND user_id != (SELECT user_id FROM patient WHERE patient_id = ?)';
        queryParams.push(exclude_patient_id);
      }

      const [result] = await db.execute(query, queryParams);
      const exists = result[0].count > 0;

      return { exists };
    } catch (error) {
      console.error('Error checking email availability:', error);
      throw error;
    }
  }
}

module.exports = AdminModel;

