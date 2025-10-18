/**
 * Patient Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับผู้ป่วยสำหรับ admin
 * - CRUD operations สำหรับผู้ป่วย
 * - การตรวจสอบข้อมูลซ้ำ
 * - การจัดการประวัติการรักษา
 */

const db = require('../config/db');
const bcrypt = require('bcrypt');

class PatientAdminModel {
  /**
   * ดึงรายการผู้ป่วยทั้งหมด
   * @returns {Array} รายการผู้ป่วย
   */
  static async getAllPatients() {
    try {
      const [rows] = await db.execute(`
        SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
        FROM patient
      `);

      return rows;
    } catch (error) {
      console.error('Error getting all patients:', error);
      throw error;
    }
  }

  /**
   * ดึงรายการผู้ป่วยทั้งหมดพร้อมข้อมูลเพิ่มเติม
   * @returns {Array} รายการผู้ป่วยพร้อมข้อมูลเพิ่มเติม
   */
  static async getAllPatientsWithDetails() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          p.patient_id,
          p.fname,
          p.lname,
          p.phone,
          p.dob,
          p.address,
          p.id_card,
          p.gender,
          p.chronic_disease,
          p.allergy_history,
          u.email,
          u.last_login,
          MAX(q.time) as last_visit,
          COUNT(DISTINCT q.queue_id) as total_appointments
        FROM patient p
        LEFT JOIN user u ON p.user_id = u.user_id
        LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
        GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address, p.id_card, p.gender, p.chronic_disease, p.allergy_history, u.email, u.last_login
        ORDER BY p.patient_id DESC
      `);

      return rows;
    } catch (error) {
      console.error('Error getting all patients with details:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลผู้ป่วยตาม ID
   * @param {number} patientId - ID ของผู้ป่วย
   * @returns {Object} ข้อมูลผู้ป่วย
   */
  static async getPatientById(patientId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          p.*,
          u.email,
          u.last_login,
          COUNT(DISTINCT q.queue_id) as total_appointments,
          MAX(q.time) as last_visit
        FROM patient p
        LEFT JOIN user u ON p.user_id = u.user_id
        LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
        WHERE p.patient_id = ?
        GROUP BY p.patient_id
      `, [patientId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting patient by ID:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบอีเมลซ้ำ
   * @param {string} email - อีเมลที่ต้องการตรวจสอบ
   * @returns {boolean} true ถ้าอีเมลซ้ำ
   */
  static async checkEmailExists(email) {
    try {
      const [result] = await db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
      return result[0].count > 0;
    } catch (error) {
      console.error('Error checking email exists:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบเลขบัตรประชาชนซ้ำ
   * @param {string} idCard - เลขบัตรประชาชน
   * @param {number} excludePatientId - ID ของผู้ป่วยที่ไม่ต้องตรวจสอบ
   * @returns {boolean} true ถ้าเลขบัตรซ้ำ
   */
  static async checkIdCardExists(idCard, excludePatientId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM patient WHERE id_card = ?';
      let params = [idCard];

      if (excludePatientId) {
        query += ' AND patient_id != ?';
        params.push(excludePatientId);
      }

      const [result] = await db.execute(query, params);
      return result[0].count > 0;
    } catch (error) {
      console.error('Error checking ID card exists:', error);
      throw error;
    }
  }

  /**
   * สร้างผู้ป่วยใหม่
   * @param {Object} patientData - ข้อมูลผู้ป่วย
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createPatient(patientData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง user record (role_id = 3 for patients)
      const [userResult] = await connection.execute(
        `INSERT INTO user (email, password, role_id) VALUES (?, ?, 3)`,
        [patientData.email, patientData.hashedPassword]
      );

      const userId = userResult.insertId;

      // สร้าง patient record
      const [patientResult] = await connection.execute(`
        INSERT INTO patient (
          user_id, fname, lname, dob, id_card, phone, address,
          gender, chronic_disease, allergy_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        patientData.fname,
        patientData.lname,
        patientData.dob,
        patientData.id_card,
        patientData.phone,
        patientData.address,
        patientData.gender,
        patientData.chronic_disease,
        patientData.allergy_history
      ]);

      const patientId = patientResult.insertId;

      // สร้าง notification
      await connection.execute(`
        INSERT INTO notifications (type, title, message, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'welcome',
        'ยินดีต้อนรับ',
        `สวัสดี ${patientData.fname} ${patientData.lname} ยินดีต้อนรับสู่ระบบนัดหมายทันตกรรม`,
        patientId
      ]);

      await connection.commit();
      
      return {
        success: true,
        userId: userId,
        patientId: patientId,
        message: 'ผู้ป่วยถูกสร้างเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error creating patient:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * อัปเดตข้อมูลผู้ป่วย
   * @param {number} patientId - ID ของผู้ป่วย
   * @param {Object} updateData - ข้อมูลที่ต้องการอัปเดต
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updatePatient(patientId, updateData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ดึงข้อมูลปัจจุบัน
      const [patientRow] = await connection.execute(
        'SELECT user_id FROM patient WHERE patient_id = ?',
        [patientId]
      );

      if (patientRow.length === 0) {
        throw new Error('ไม่พบข้อมูลผู้ป่วย');
      }

      const userId = patientRow[0].user_id;

      // อัปเดต user table
      if (updateData.email) {
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

      // อัปเดต patient table - อัปเดตเฉพาะฟิลด์ที่มีค่าจริงๆ
      const updateFields = [];
      const updateValues = [];
      
      if (updateData.fname !== undefined) {
        updateFields.push('fname = ?');
        updateValues.push(updateData.fname);
      }
      if (updateData.lname !== undefined) {
        updateFields.push('lname = ?');
        updateValues.push(updateData.lname);
      }
      if (updateData.dob !== undefined) {
        updateFields.push('dob = ?');
        updateValues.push(updateData.dob || null);
      }
      if (updateData.id_card !== undefined) {
        updateFields.push('id_card = ?');
        updateValues.push(updateData.id_card || null);
      }
      if (updateData.phone !== undefined) {
        updateFields.push('phone = ?');
        updateValues.push(updateData.phone);
      }
      if (updateData.address !== undefined) {
        updateFields.push('address = ?');
        updateValues.push(updateData.address || null);
      }
      if (updateData.gender !== undefined) {
        updateFields.push('gender = ?');
        updateValues.push(updateData.gender || null);
      }
      if (updateData.chronic_disease !== undefined) {
        updateFields.push('chronic_disease = ?');
        updateValues.push(updateData.chronic_disease || null);
      }
      if (updateData.allergy_history !== undefined) {
        updateFields.push('allergy_history = ?');
        updateValues.push(updateData.allergy_history || null);
      }
      
      if (updateFields.length > 0) {
        updateValues.push(patientId);
        await connection.execute(`
          UPDATE patient SET ${updateFields.join(', ')}
          WHERE patient_id = ?
        `, updateValues);
      }

      await connection.commit();
      
      return {
        success: true,
        message: 'ข้อมูลผู้ป่วยถูกอัปเดตเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error updating patient:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ลบผู้ป่วย
   * @param {number} patientId - ID ของผู้ป่วย
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deletePatient(patientId) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ดึงข้อมูลผู้ป่วยก่อนลบ
      const [patientData] = await connection.execute(`
        SELECT p.*, u.email 
        FROM patient p 
        LEFT JOIN user u ON p.user_id = u.user_id 
        WHERE p.patient_id = ?
      `, [patientId]);

      if (patientData.length === 0) {
        throw new Error('ไม่พบข้อมูลผู้ป่วย');
      }

      const patient = patientData[0];

      // ตรวจสอบว่าผู้ป่วยมีนัดหมายที่ยังไม่เสร็จหรือไม่
      const [activeAppointments] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM queue 
        WHERE patient_id = ? AND queue_status IN ('pending', 'confirm')
      `, [patientId]);

      if (activeAppointments[0].count > 0) {
        throw new Error('ไม่สามารถลบผู้ป่วยได้ เนื่องจากมีนัดหมายที่ยังไม่เสร็จ กรุณายกเลิกนัดหมายทั้งหมดก่อน');
      }

      // ลบข้อมูลที่เกี่ยวข้องตามลำดับที่ถูกต้อง (child tables ก่อน parent tables)
      
      // 1. ลบ treatment history ที่เกี่ยวข้อง
      await connection.execute(`
        DELETE th FROM treatmentHistory th
        JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
        WHERE qd.patient_id = ?
      `, [patientId]);

      // 2. ลบ notifications ที่เกี่ยวข้องกับผู้ป่วย
      await connection.execute('DELETE FROM notifications WHERE patient_id = ?', [patientId]);

      // 3. ลบ queue records ที่เกี่ยวข้อง (child ของ queuedetail)
      await connection.execute('DELETE FROM queue WHERE patient_id = ?', [patientId]);

      // 4. ลบ queuedetail records (parent ของ queue)
      await connection.execute('DELETE FROM queuedetail WHERE patient_id = ?', [patientId]);

      // 5. ลบ patient record (parent ของ queuedetail)
      await connection.execute('DELETE FROM patient WHERE patient_id = ?', [patientId]);

      if (patient.user_id) {
        await connection.execute('DELETE FROM user WHERE user_id = ?', [patient.user_id]);
      }

      // สร้าง notification สำหรับการลบ
      await connection.execute(`
        INSERT INTO notifications (type, title, message, is_read, is_new)
        VALUES (?, ?, ?, 0, 1)
      `, [
        'system',
        'ผู้ป่วยถูกลบ',
        `ผู้ป่วย ${patient.fname} ${patient.lname} ถูกลบออกจากระบบแล้ว`
      ]);

      await connection.commit();
      
      return {
        success: true,
        message: 'ผู้ป่วยถูกลบเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error deleting patient:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วย
   * @param {number} patientId - ID ของผู้ป่วย
   * @returns {Array} ประวัติการรักษา
   */
  static async getPatientTreatmentHistory(patientId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          th.treatment_history_id,
          th.treatment_date,
          th.treatment_notes,
          t.treatment_name as treatment_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          qd.date as appointment_date
        FROM treatmentHistory th
        JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        WHERE qd.patient_id = ?
        ORDER BY th.treatment_date DESC
      `, [patientId]);

      return rows;
    } catch (error) {
      console.error('Error getting patient treatment history:', error);
      throw error;
    }
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วยแบบจัดกลุ่มตามปี (สำหรับ view)
   * @param {number} patientId - ID ของผู้ป่วย
   * @returns {Object} ประวัติการรักษาจัดกลุ่มตามปี
   */
  static async getPatientTreatmentHistoryGrouped(patientId) {
    try {
      const [rows] = await db.execute(`
        SELECT qd.date, t.treatment_name, q.queue_id
        FROM queuedetail qd
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE qd.patient_id = ?
        ORDER BY qd.date DESC
      `, [patientId]);

      const groupedHistory = {};

      rows.forEach(row => {
        const dateObj = new Date(row.date);
        const year = dateObj.getFullYear();
        const day = dateObj.getDate();
        const month = dateObj.toLocaleString('default', { month: 'short' });

        if (!groupedHistory[year]) groupedHistory[year] = [];
        groupedHistory[year].push({
          date: dateObj.toISOString().split('T')[0],
          day,
          month,
          treatment: row.treatment_name,
          queueId: row.queue_id
        });
      });

      return groupedHistory;
    } catch (error) {
      console.error('Error getting patient treatment history grouped:', error);
      throw error;
    }
  }

  /**
   * ดึงรายละเอียดการรักษา
   * @param {number} patientId - ID ของผู้ป่วย
   * @param {number} queueId - ID ของคิว
   * @returns {Object} รายละเอียดการรักษา
   */
  static async getTreatmentDetails(patientId, queueId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          th.*,
          t.treatment_name as treatment_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          qd.date as appointment_date
        FROM treatmentHistory th
        JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN patient p ON qd.patient_id = p.patient_id
        WHERE qd.patient_id = ? AND qd.queuedetail_id = ?
      `, [patientId, queueId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting treatment details:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบความพร้อมใช้งานของอีเมล
   * @param {string} email - อีเมลที่ต้องการตรวจสอบ
   * @returns {Object} ผลลัพธ์การตรวจสอบ
   */
  static async checkEmailAvailability(email) {
    try {
      const [result] = await db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
      const isAvailable = result[0].count === 0;

      return {
        available: isAvailable,
        message: isAvailable ? 'อีเมลนี้สามารถใช้ได้' : 'อีเมลนี้ถูกใช้งานแล้ว'
      };
    } catch (error) {
      console.error('Error checking email availability:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบความพร้อมใช้งานของเลขบัตรประชาชน
   * @param {string} idCard - เลขบัตรประชาชนที่ต้องการตรวจสอบ
   * @param {number} excludePatientId - ID ของผู้ป่วยที่ไม่ต้องตรวจสอบ
   * @returns {Object} ผลลัพธ์การตรวจสอบ
   */
  static async checkIdCardAvailability(idCard, excludePatientId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM patient WHERE id_card = ?';
      let params = [idCard];

      if (excludePatientId) {
        query += ' AND patient_id != ?';
        params.push(excludePatientId);
      }

      const [result] = await db.execute(query, params);
      const isAvailable = result[0].count === 0;

      return {
        available: isAvailable,
        message: isAvailable ? 'เลขบัตรประชาชนนี้สามารถใช้ได้' : 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว'
      };
    } catch (error) {
      console.error('Error checking ID card availability:', error);
      throw error;
    }
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วยสำหรับ API
   * @param {number} patientId - ID ของผู้ป่วย
   * @returns {Array} รายการประวัติการรักษา
   */
  static async getPatientTreatmentHistoryForAPI(patientId) {
    try {
      const [treatments] = await db.execute(`
        SELECT
          q.queue_id,
          q.time as date,
          q.queue_status,
          th.diagnosis,
          t.treatment_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          th.followUpdate as follow_update
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
        WHERE q.patient_id = ?
        ORDER BY q.time DESC
      `, [patientId]);

      return treatments;
    } catch (error) {
      console.error('Error getting patient treatment history for API:', error);
      throw error;
    }
  }
}

module.exports = PatientAdminModel;

