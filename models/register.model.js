const db = require('../config/db');

class RegisterModel {
  // ตรวจสอบอีเมลซ้ำ
  static async checkEmailExists(email) {
    try {
      const [results] = await db.execute(
        'SELECT user_id FROM user WHERE LOWER(email) = LOWER(?)',
        [email]
      );
      return results.length > 0;
    } catch (error) {
      throw new Error('Failed to check email: ' + error.message);
    }
  }

  // ตรวจสอบบัตรประชาชนซ้ำ
  static async checkIdCardExists(idCard) {
    try {
      const [results] = await db.execute(
        'SELECT patient_id FROM patient WHERE id_card = ?',
        [idCard]
      );
      return results.length > 0;
    } catch (error) {
      throw new Error('Failed to check ID card: ' + error.message);
    }
  }

  // ตรวจสอบข้อมูลซ้ำทั้งหมด
  static async checkDuplicates(email, idCard) {
    try {
      const emailExists = await this.checkEmailExists(email);
      const idCardExists = await this.checkIdCardExists(idCard);

      return {
        emailExists,
        idCardExists
      };
    } catch (error) {
      throw new Error('Failed to check duplicates: ' + error.message);
    }
  }

  // สร้าง user ใหม่
  static async createUser(email, hashedPassword, roleId = 3) {
    try {
      const [result] = await db.execute(
        'INSERT INTO user (role_id, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [roleId, email, hashedPassword]
      );
      return result.insertId;
    } catch (error) {
      throw new Error('Failed to create user: ' + error.message);
    }
  }

  // สร้างข้อมูล patient
  static async createPatient(userId, patientData) {
    try {
      const { fname, lname, dob, id_card, address, phone } = patientData;
      
      await db.execute(`
        INSERT INTO patient (
          user_id, fname, lname, dob, id_card, address, phone,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        userId,
        fname,
        lname,
        dob,
        id_card,
        address,
        phone
      ]);
      
      return true;
    } catch (error) {
      throw new Error('Failed to create patient: ' + error.message);
    }
  }

  // สร้าง user และ patient ด้วย Transaction
  static async registerPatientWithTransaction(email, hashedPassword, patientData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง user
      const [userResult] = await connection.execute(
        'INSERT INTO user (role_id, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [3, email, hashedPassword]
      );
      
      const userId = userResult.insertId;

      // สร้าง patient
      const { fname, lname, dob, id_card, address, phone } = patientData;
      
      await connection.execute(`
        INSERT INTO patient (
          user_id, fname, lname, dob, id_card, address, phone,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        userId,
        fname,
        lname,
        dob,
        id_card,
        address,
        phone
      ]);

      await connection.commit();
      return userId;
      
    } catch (error) {
      await connection.rollback();
      throw new Error('Transaction failed: ' + error.message);
    } finally {
      connection.release();
    }
  }

  // ดึงข้อมูล patient ตาม user_id
  static async getPatientByUserId(userId) {
    try {
      const [results] = await db.execute(
        'SELECT * FROM patient WHERE user_id = ?',
        [userId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch patient: ' + error.message);
    }
  }

  // ดึงข้อมูล patient ตาม id_card
  static async getPatientByIdCard(idCard) {
    try {
      const [results] = await db.execute(
        'SELECT * FROM patient WHERE id_card = ?',
        [idCard]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch patient: ' + error.message);
    }
  }

  // นับจำนวน patient ทั้งหมด
  static async getTotalPatientsCount() {
    try {
      const [results] = await db.execute(
        'SELECT COUNT(*) as count FROM patient'
      );
      return results[0].count;
    } catch (error) {
      throw new Error('Failed to count patients: ' + error.message);
    }
  }

  // ดึงรายการ patient ที่สมัครล่าสุด
  static async getRecentPatients(limit = 10) {
    try {
      const [results] = await db.execute(
        `SELECT p.*, u.email, u.created_at as registration_date
         FROM patient p
         JOIN user u ON p.user_id = u.user_id
         ORDER BY u.created_at DESC
         LIMIT ?`,
        [limit]
      );
      return results;
    } catch (error) {
      throw new Error('Failed to fetch recent patients: ' + error.message);
    }
  }
}

module.exports = RegisterModel;