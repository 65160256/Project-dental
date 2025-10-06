const db = require('../config/db');

class AuthModel {
  // ตรวจสอบอีเมลซ้ำ
  static async checkEmailExists(email) {
    try {
      const [users] = await db.execute(
        'SELECT user_id FROM user WHERE LOWER(email) = LOWER(?)',
        [email]
      );
      return users.length > 0;
    } catch (error) {
      throw new Error('Database error: ' + error.message);
    }
  }

  // ตรวจสอบบัตรประชาชนซ้ำ (สำหรับ patient)
  static async checkIdCardExists(idCard) {
    try {
      const [patients] = await db.execute(
        'SELECT patient_id FROM patient WHERE id_card = ?',
        [idCard]
      );
      return patients.length > 0;
    } catch (error) {
      throw new Error('Database error: ' + error.message);
    }
  }

  // ตรวจสอบบัตรประชาชนซ้ำ (สำหรับ dentist)
  static async checkDentistIdCardExists(idCard) {
    try {
      const [dentists] = await db.execute(
        'SELECT dentist_id FROM dentist WHERE id_card = ?',
        [idCard]
      );
      return dentists.length > 0;
    } catch (error) {
      throw new Error('Database error: ' + error.message);
    }
  }

  // สร้าง user ใหม่
  static async createUser(roleId, email, hashedPassword) {
    try {
      const [result] = await db.execute(
        'INSERT INTO user (role_id, email, password) VALUES (?, ?, ?)',
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
      const { fname, lname, phone, dob, address, id_card } = patientData;
      const [result] = await db.execute(
        'INSERT INTO patient (user_id, fname, lname, phone, dob, address, id_card) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, fname, lname, phone, dob, address, id_card]
      );
      return result.insertId;
    } catch (error) {
      throw new Error('Failed to create patient: ' + error.message);
    }
  }

  // สร้างข้อมูล dentist
  static async createDentist(userId, dentistData) {
    try {
      const { fname, lname, phone, dob, address, id_card } = dentistData;
      const [result] = await db.execute(
        'INSERT INTO dentist (user_id, fname, lname, phone, dob, address, id_card) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, fname, lname, phone, dob, address, id_card]
      );
      return result.insertId;
    } catch (error) {
      throw new Error('Failed to create dentist: ' + error.message);
    }
  }

  // ดึงข้อมูล user ตาม email
  static async getUserByEmail(email) {
    try {
      const [users] = await db.execute(
        `SELECT u.*, r.rname as role_name 
         FROM user u 
         JOIN role r ON u.role_id = r.role_id 
         WHERE LOWER(u.email) = LOWER(?)`,
        [email]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user: ' + error.message);
    }
  }

  // ดึงข้อมูล user ตาม user_id
  static async getUserById(userId) {
    try {
      const [users] = await db.execute(
        `SELECT u.*, r.rname as role_name 
         FROM user u 
         JOIN role r ON u.role_id = r.role_id 
         WHERE u.user_id = ?`,
        [userId]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user: ' + error.message);
    }
  }

  // อัพเดท last_login
  static async updateLastLogin(userId) {
    try {
      await db.execute(
        'UPDATE user SET last_login = NOW() WHERE user_id = ?',
        [userId]
      );
    } catch (error) {
      throw new Error('Failed to update last login: ' + error.message);
    }
  }

  // ดึงข้อมูล patient ตาม user_id
  static async getPatientByUserId(userId) {
    try {
      const [patients] = await db.execute(
        'SELECT * FROM patient WHERE user_id = ?',
        [userId]
      );
      return patients.length > 0 ? patients[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch patient: ' + error.message);
    }
  }

  // ดึงข้อมูล dentist ตาม user_id
  static async getDentistByUserId(userId) {
    try {
      const [dentists] = await db.execute(
        'SELECT * FROM dentist WHERE user_id = ?',
        [userId]
      );
      return dentists.length > 0 ? dentists[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch dentist: ' + error.message);
    }
  }

  // ลบ user และข้อมูลที่เกี่ยวข้อง (cascade delete จะจัดการให้)
  static async deleteUser(userId) {
    try {
      await db.execute('DELETE FROM user WHERE user_id = ?', [userId]);
    } catch (error) {
      throw new Error('Failed to delete user: ' + error.message);
    }
  }

  // Transaction: สร้าง user + patient/dentist
  static async createUserWithProfile(roleId, email, hashedPassword, profileData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง user
      const [userResult] = await connection.execute(
        'INSERT INTO user (role_id, email, password) VALUES (?, ?, ?)',
        [roleId, email, hashedPassword]
      );
      const userId = userResult.insertId;

      // สร้าง profile ตาม role
      if (roleId === 2) {
        // Dentist
        const { fname, lname, phone, dob, address, id_card } = profileData;
        await connection.execute(
          'INSERT INTO dentist (user_id, fname, lname, phone, dob, address, id_card) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, fname, lname, phone, dob, address, id_card]
        );
      } else if (roleId === 3) {
        // Patient
        const { fname, lname, phone, dob, address, id_card } = profileData;
        await connection.execute(
          'INSERT INTO patient (user_id, fname, lname, phone, dob, address, id_card) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, fname, lname, phone, dob, address, id_card]
        );
      }

      await connection.commit();
      return userId;
      
    } catch (error) {
      await connection.rollback();
      throw new Error('Transaction failed: ' + error.message);
    } finally {
      connection.release();
    }
  }
}

module.exports = AuthModel;