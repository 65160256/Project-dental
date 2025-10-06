const db = require('../config/db');

class LoginModel {
  // ดึงข้อมูล user พร้อม role name ตาม email
  static async getUserByEmail(email) {
    try {
      const [rows] = await db.execute(
        `SELECT u.*, r.rname as role_name 
         FROM user u 
         JOIN role r ON u.role_id = r.role_id 
         WHERE u.email = ?`,
        [email]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user by email: ' + error.message);
    }
  }

  // ดึงข้อมูล user พร้อม role name ตาม user_id
  static async getUserById(userId) {
    try {
      const [rows] = await db.execute(
        `SELECT u.*, r.rname as role_name 
         FROM user u 
         JOIN role r ON u.role_id = r.role_id 
         WHERE u.user_id = ?`,
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user by ID: ' + error.message);
    }
  }

  // อัพเดทเวลา last_login
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

  // ดึงข้อมูล dentist ตาม user_id
  static async getDentistByUserId(userId) {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM dentist WHERE user_id = ?',
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch dentist: ' + error.message);
    }
  }

  // ดึงข้อมูล patient ตาม user_id
  static async getPatientByUserId(userId) {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM patient WHERE user_id = ?',
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch patient: ' + error.message);
    }
  }

  // ดึงข้อมูล user สำหรับ API (ไม่รวม password)
  static async getUserDataForApi(userId) {
    try {
      const [rows] = await db.execute(
        `SELECT u.user_id, u.email, u.username, u.role_id, 
                r.rname as role_name, u.last_login
         FROM user u 
         JOIN role r ON u.role_id = r.role_id 
         WHERE u.user_id = ?`,
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user data: ' + error.message);
    }
  }

  // ดึงข้อมูล profile ตาม role (dentist หรือ patient)
  static async getProfileByRole(userId, roleId) {
    try {
      if (roleId === 2) {
        // Dentist
        return await this.getDentistByUserId(userId);
      } else if (roleId === 3) {
        // Patient
        return await this.getPatientByUserId(userId);
      }
      return null;
    } catch (error) {
      throw new Error('Failed to fetch profile: ' + error.message);
    }
  }

  // ดึงข้อมูลผู้ใช้แบบเต็ม (user + profile)
  static async getFullUserData(userId) {
    try {
      const user = await this.getUserById(userId);
      if (!user) return null;

      const profile = await this.getProfileByRole(userId, user.role_id);

      return {
        user,
        profile
      };
    } catch (error) {
      throw new Error('Failed to fetch full user data: ' + error.message);
    }
  }
}

module.exports = LoginModel;