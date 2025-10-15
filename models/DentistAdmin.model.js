/**
 * Dentist Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับทันตแพทย์สำหรับ admin
 * - CRUD operations สำหรับทันตแพทย์
 * - การตรวจสอบข้อมูลซ้ำ
 * - การจัดการไฟล์รูปภาพ
 */

const db = require('../config/db');
const bcrypt = require('bcrypt');

class DentistAdminModel {
  /**
   * ดึงรายการทันตแพทย์ทั้งหมด
   * @returns {Array} รายการทันตแพทย์
   */
  static async getAllDentists() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          d.fname,
          d.lname,
          d.specialty,
          d.phone,
          d.photo,
          u.email,
          u.last_login,
          COUNT(DISTINCT q.queue_id) as total_appointments,
          MAX(q.time) as last_appointment
        FROM dentist d
        LEFT JOIN user u ON d.user_id = u.user_id
        LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('confirm', 'pending')
        GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.photo, u.email, u.last_login
        ORDER BY d.fname, d.lname
      `);

      return rows;
    } catch (error) {
      console.error('Error getting all dentists:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลทันตแพทย์ตาม ID
   * @param {number} dentistId - ID ของทันตแพทย์
   * @returns {Object} ข้อมูลทันตแพทย์
   */
  static async getDentistById(dentistId) {
    try {
      const [rows] = await db.execute(`
        SELECT d.*, u.email FROM dentist d
        JOIN user u ON d.user_id = u.user_id WHERE d.dentist_id = ?
      `, [dentistId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting dentist by ID:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบอีเมลซ้ำ
   * @param {string} email - อีเมลที่ต้องการตรวจสอบ
   * @param {number} excludeUserId - ID ของ user ที่ไม่ต้องตรวจสอบ (สำหรับการแก้ไข)
   * @returns {boolean} true ถ้าอีเมลซ้ำ
   */
  static async checkEmailExists(email, excludeUserId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
      let params = [email];

      if (excludeUserId) {
        query += ' AND user_id != ?';
        params.push(excludeUserId);
      }

      const [result] = await db.execute(query, params);
      return result[0].count > 0;
    } catch (error) {
      console.error('Error checking email exists:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบเลขบัตรประชาชนซ้ำ
   * @param {string} idCard - เลขบัตรประชาชน
   * @param {number} excludeDentistId - ID ของทันตแพทย์ที่ไม่ต้องตรวจสอบ
   * @returns {boolean} true ถ้าเลขบัตรซ้ำ
   */
  static async checkIdCardExists(idCard, excludeDentistId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM dentist WHERE id_card = ?';
      let params = [idCard];

      if (excludeDentistId) {
        query += ' AND dentist_id != ?';
        params.push(excludeDentistId);
      }

      const [result] = await db.execute(query, params);
      return result[0].count > 0;
    } catch (error) {
      console.error('Error checking ID card exists:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบเลขใบอนุญาตซ้ำ
   * @param {string} licenseNo - เลขใบอนุญาต
   * @param {number} excludeDentistId - ID ของทันตแพทย์ที่ไม่ต้องตรวจสอบ
   * @returns {boolean} true ถ้าเลขใบอนุญาตซ้ำ
   */
  static async checkLicenseExists(licenseNo, excludeDentistId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM dentist WHERE license_no = ?';
      let params = [licenseNo];

      if (excludeDentistId) {
        query += ' AND dentist_id != ?';
        params.push(excludeDentistId);
      }

      const [result] = await db.execute(query, params);
      return result[0].count > 0;
    } catch (error) {
      console.error('Error checking license exists:', error);
      throw error;
    }
  }

  /**
   * สร้างทันตแพทย์ใหม่
   * @param {Object} dentistData - ข้อมูลทันตแพทย์
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createDentist(dentistData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง user record
      const [userResult] = await connection.execute(
        `INSERT INTO user (email, password, role_id) VALUES (?, ?, 2)`,
        [dentistData.email, dentistData.hashedPassword]
      );

      const userId = userResult.insertId;

      // สร้าง dentist record
      await connection.execute(
        `INSERT INTO dentist (user_id, fname, lname, dob, id_card, specialty, education, address, phone, photo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          dentistData.fname, 
          dentistData.lname, 
          dentistData.dob, 
          dentistData.id_card, 
          dentistData.specialty, 
          dentistData.education, 
          dentistData.address, 
          dentistData.phone, 
          dentistData.photo
        ]
      );

      await connection.commit();
      
      return {
        success: true,
        userId: userId,
        message: 'ทันตแพทย์ถูกสร้างเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error creating dentist:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * อัปเดตข้อมูลทันตแพทย์
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {Object} updateData - ข้อมูลที่ต้องการอัปเดต
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updateDentist(dentistId, updateData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ดึงข้อมูลปัจจุบัน
      const [dentistRow] = await connection.execute(`
        SELECT d.*, u.email as current_email 
        FROM dentist d 
        JOIN user u ON d.user_id = u.user_id 
        WHERE d.dentist_id = ?
      `, [dentistId]);

      if (dentistRow.length === 0) {
        throw new Error('ไม่พบข้อมูลทันตแพทย์');
      }

      const currentDentist = dentistRow[0];
      const userId = currentDentist.user_id;

      // อัปเดต user table
      if (updateData.email && updateData.email !== currentDentist.current_email) {
        await connection.execute(
          'UPDATE user SET email = ? WHERE user_id = ?',
          [updateData.email, userId]
        );
      }

      if (updateData.password) {
        await connection.execute(
          'UPDATE user SET password = ? WHERE user_id = ?',
          [updateData.password, userId]
        );
      }

      // อัปเดต dentist table
      await connection.execute(`
        UPDATE dentist SET
          fname = ?, lname = ?, dob = ?, id_card = ?, license_no = ?,
          specialty = ?, education = ?, address = ?, phone = ?, photo = ?
        WHERE dentist_id = ?
      `, [
        updateData.fname, 
        updateData.lname, 
        updateData.dob, 
        updateData.id_card, 
        updateData.license_no, 
        updateData.specialty, 
        updateData.education, 
        updateData.address, 
        updateData.phone, 
        updateData.photo, 
        dentistId
      ]);

      await connection.commit();
      
      return {
        success: true,
        message: 'ข้อมูลทันตแพทย์ถูกอัปเดตเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error updating dentist:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ลบทันตแพทย์
   * @param {number} dentistId - ID ของทันตแพทย์
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deleteDentist(dentistId) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ดึงข้อมูลทันตแพทย์ก่อนลบ
      const [dentistData] = await connection.execute(
        'SELECT user_id FROM dentist WHERE dentist_id = ?',
        [dentistId]
      );

      if (dentistData.length === 0) {
        throw new Error('ไม่พบข้อมูลทันตแพทย์');
      }

      const userId = dentistData[0].user_id;

      // ลบข้อมูลที่เกี่ยวข้อง
      await connection.execute('DELETE FROM dentist WHERE dentist_id = ?', [dentistId]);
      await connection.execute('DELETE FROM user WHERE user_id = ?', [userId]);

      await connection.commit();
      
      return {
        success: true,
        message: 'ทันตแพทย์ถูกลบเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error deleting dentist:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ดึงข้อมูลทันตแพทย์สำหรับ API
   * @returns {Array} รายการทันตแพทย์
   */
  static async getDentistsForAPI() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          d.fname,
          d.lname,
          d.specialty,
          d.phone,
          d.photo,
          u.email,
          u.last_login,
          COUNT(DISTINCT q.queue_id) as total_appointments,
          MAX(q.time) as last_appointment
        FROM dentist d
        LEFT JOIN user u ON d.user_id = u.user_id
        LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('confirm', 'pending')
        GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.photo, u.email, u.last_login
        ORDER BY d.fname, d.lname
      `);

      return rows;
    } catch (error) {
      console.error('Error getting dentists for API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลทันตแพทย์ตาม ID สำหรับ API
   * @param {number} dentistId - ID ของทันตแพทย์
   * @returns {Object} ข้อมูลทันตแพทย์
   */
  static async getDentistByIdForAPI(dentistId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          d.fname,
          d.lname,
          d.dob,
          d.id_card,
          d.license_no,
          d.specialty,
          d.education,
          d.address,
          d.phone,
          d.photo,
          u.email,
          u.last_login,
          COUNT(DISTINCT q.queue_id) as total_appointments,
          MAX(q.time) as last_appointment
        FROM dentist d
        LEFT JOIN user u ON d.user_id = u.user_id
        LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('confirm', 'pending')
        WHERE d.dentist_id = ?
        GROUP BY d.dentist_id, d.fname, d.lname, d.dob, d.id_card, d.license_no, d.specialty, d.education, d.address, d.phone, d.photo, u.email, u.last_login
      `, [dentistId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting dentist by ID for API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสาขาวิชาเฉพาะของทันตแพทย์
   * @returns {Array} รายการสาขาวิชาเฉพาะ
   */
  static async getDentistSpecialties() {
    try {
      const [rows] = await db.execute(`
        SELECT DISTINCT specialty 
        FROM dentist 
        WHERE specialty IS NOT NULL AND specialty != ''
        ORDER BY specialty
      `);

      return rows.map(row => row.specialty);
    } catch (error) {
      console.error('Error getting dentist specialties:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลทันตแพทย์ที่ว่างสำหรับการจองนัดหมาย
   * @param {string} date - วันที่
   * @param {string} time - เวลา
   * @returns {Array} รายการทันตแพทย์ที่ว่าง
   */
  static async getAvailableDentists(date, time) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          d.fname,
          d.lname,
          d.specialty,
          ds.start_time,
          ds.end_time
        FROM dentist d
        JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
        WHERE ds.schedule_date = ?
          AND ds.hour = HOUR(?)
          AND ds.status = 'available'
          AND d.dentist_id NOT IN (
            SELECT DISTINCT q.dentist_id 
            FROM queue q 
            WHERE DATE(q.time) = ? 
              AND HOUR(q.time) = HOUR(?)
              AND q.queue_status IN ('pending', 'confirm')
          )
        ORDER BY d.fname, d.lname
      `, [date, time, date, time]);

      return rows;
    } catch (error) {
      console.error('Error getting available dentists:', error);
      throw error;
    }
  }
}

module.exports = DentistAdminModel;

