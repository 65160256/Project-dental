const db = require('../config/db');
const bcrypt = require('bcrypt');

class UserModel {
  /**
   * สร้าง user ใหม่
   * @param {Object} userData
   * @returns {Promise<Object>} { userId, success }
   */
  static async create(userData) {
    const { email, username, password, role } = userData;

    // Validate required fields
    if (!email || !password || !role) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    }

    // Validate password length
    if (password.length < 6) {
      throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    }

    // Validate role
    const validRoles = [1, 2, 3]; // 1: admin, 2: dentist, 3: patient
    if (!validRoles.includes(role)) {
      throw new Error('บทบาทไม่ถูกต้อง');
    }

    // Check for duplicate email
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new Error('อีเมลนี้มีในระบบแล้ว');
    }

    // Check for duplicate username if provided
    if (username) {
      const existingUsername = await this.findByUsername(username);
      if (existingUsername) {
        throw new Error('ชื่อผู้ใช้นี้มีในระบบแล้ว');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      `INSERT INTO user (email, username, password, role)
       VALUES (?, ?, ?, ?)`,
      [email, username || null, hashedPassword, role]
    );

    return {
      userId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหา user ด้วย ID
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findById(userId) {
    const [rows] = await db.execute(
      `SELECT user_id, email, username, role, created_at
       FROM user WHERE user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหา user ด้วยอีเมล
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  static async findByEmail(email) {
    const [rows] = await db.execute(
      `SELECT * FROM user WHERE email = ?`,
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหา user ด้วย username
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  static async findByUsername(username) {
    const [rows] = await db.execute(
      `SELECT * FROM user WHERE username = ?`,
      [username]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ตรวจสอบการ login
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} { success, user, message }
   */
  static async authenticate(email, password) {
    // Find user by email
    const user = await this.findByEmail(email);
    if (!user) {
      return {
        success: false,
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      };
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      };
    }

    // Remove password from result
    const { password: _, ...userWithoutPassword } = user;

    return {
      success: true,
      user: userWithoutPassword,
      message: 'เข้าสู่ระบบสำเร็จ'
    };
  }

  /**
   * เปลี่ยนรหัสผ่าน
   * @param {number} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<Object>} { success, message }
   */
  static async changePassword(userId, currentPassword, newPassword) {
    // Validate new password length
    if (newPassword.length < 6) {
      throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
    }

    // Get user with password
    const [rows] = await db.execute(
      `SELECT * FROM user WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }

    const user = rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const [result] = await db.execute(
      `UPDATE user SET password = ? WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    return {
      success: result.affectedRows > 0,
      message: 'เปลี่ยนรหัสผ่านสำเร็จ'
    };
  }

  /**
   * รีเซ็ตรหัสผ่าน (สำหรับ admin)
   * @param {number} userId
   * @param {string} newPassword
   * @returns {Promise<Object>} { success, message }
   */
  static async resetPassword(userId, newPassword) {
    // Validate new password length
    if (newPassword.length < 6) {
      throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
    }

    // Check if user exists
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const [result] = await db.execute(
      `UPDATE user SET password = ? WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    return {
      success: result.affectedRows > 0,
      message: 'รีเซ็ตรหัสผ่านสำเร็จ'
    };
  }

  /**
   * อัปเดตอีเมล (พร้อมตรวจสอบรหัสผ่านและ duplicate)
   * @param {number} userId
   * @param {string} newEmail
   * @param {string} password - รหัสผ่านปัจจุบันสำหรับยืนยัน
   * @returns {Promise<Object>} { success, message, email }
   */
  static async updateEmail(userId, newEmail, password) {
    // Validation
    if (!newEmail || !password) {
      throw new Error('กรุณากรอกข้อมูลให้ครบถ้วน');
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    }

    // Get user with password
    const [rows] = await db.execute(
      `SELECT * FROM user WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }

    const user = rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }

    // Check for duplicate email (exclude current user)
    const [existingUser] = await db.execute(
      `SELECT user_id FROM user WHERE email = ? AND user_id != ?`,
      [newEmail, userId]
    );

    if (existingUser.length > 0) {
      throw new Error('อีเมลนี้ถูกใช้งานแล้ว');
    }

    // Update email
    const [result] = await db.execute(
      `UPDATE user SET email = ? WHERE user_id = ?`,
      [newEmail, userId]
    );

    return {
      success: result.affectedRows > 0,
      message: 'อัพเดทอีเมลเรียบร้อยแล้ว',
      email: newEmail
    };
  }

  /**
   * อัปเดตข้อมูล user
   * @param {number} userId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(userId, updateData) {
    const { email, username } = updateData;

    // Check if user exists
    const existing = await this.findById(userId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลผู้ใช้');
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
      }

      // Check for duplicate email (exclude current user)
      if (email !== existing.email) {
        const duplicateEmail = await this.findByEmail(email);
        if (duplicateEmail && duplicateEmail.user_id !== userId) {
          throw new Error('อีเมลนี้มีในระบบแล้ว');
        }
      }
    }

    // Check for duplicate username (exclude current user)
    if (username && username !== existing.username) {
      const duplicateUsername = await this.findByUsername(username);
      if (duplicateUsername && duplicateUsername.user_id !== userId) {
        throw new Error('ชื่อผู้ใช้นี้มีในระบบแล้ว');
      }
    }

    const [result] = await db.execute(
      `UPDATE user SET email = ?, username = ? WHERE user_id = ?`,
      [email || existing.email, username || existing.username, userId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบ user
   * @param {number} userId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(userId) {
    // Check if user has associated data (patient, dentist profiles)
    const [patientCheck] = await db.execute(
      `SELECT COUNT(*) as count FROM patient WHERE user_id = ?`,
      [userId]
    );

    const [dentistCheck] = await db.execute(
      `SELECT COUNT(*) as count FROM dentist WHERE user_id = ?`,
      [userId]
    );

    if (patientCheck[0].count > 0 || dentistCheck[0].count > 0) {
      throw new Error('ไม่สามารถลบ user ที่มีข้อมูลโปรไฟล์ได้ กรุณาลบโปรไฟล์ก่อน');
    }

    const [result] = await db.execute(
      `DELETE FROM user WHERE user_id = ?`,
      [userId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงรายการ user ตาม role
   * @param {number} role
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByRole(role, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [rows] = await db.execute(
      `SELECT user_id, email, username, role, created_at
       FROM user
       WHERE role = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [role, limit, offset]
    );

    return rows;
  }

  /**
   * นับจำนวน user ทั้งหมด
   * @param {number} role - Optional: filter by role
   * @returns {Promise<number>}
   */
  static async count(role = null) {
    let query = `SELECT COUNT(*) as total FROM user`;
    const params = [];

    if (role !== null) {
      query += ` WHERE role = ?`;
      params.push(role);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * อัพเดทรหัสผ่าน (ไม่ต้องเช็ครหัสเก่า - สำหรับ admin)
   * @param {number} userId
   * @param {string} hashedPassword
   * @returns {Promise<Object>}
   */
  static async updatePassword(userId, hashedPassword) {
    const [result] = await db.execute(
      `UPDATE user SET password = ? WHERE user_id = ?`,
      [hashedPassword, userId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงข้อมูล user พร้อม role name
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithRole(userId) {
    const [rows] = await db.execute(
      `SELECT u.user_id, u.email, u.username, u.role, u.last_login, u.created_at,
              r.rname as role_name
       FROM user u
       LEFT JOIN role r ON u.role = r.role_id
       WHERE u.user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึง user ที่มี role และข้อมูลเพิ่มเติม
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  static async findByEmailWithDetails(email) {
    const [rows] = await db.execute(
      `SELECT u.*, r.rname as role_name
       FROM user u
       LEFT JOIN role r ON u.role = r.role_id
       WHERE u.email = ?`,
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * เช็คว่าอีเมลถูกใช้แล้วหรือไม่ (ไม่รวม user_id ที่ระบุ)
   * @param {string} email
   * @param {number} excludeUserId
   * @returns {Promise<boolean>}
   */
  static async isEmailTaken(email, excludeUserId = null) {
    let query = `SELECT COUNT(*) as count FROM user WHERE email = ?`;
    const params = [email];

    if (excludeUserId) {
      query += ` AND user_id != ?`;
      params.push(excludeUserId);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].count > 0;
  }

  /**
   * ค้นหา user ที่เป็น patient ด้วยอีเมล (สำหรับ forgot password)
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  static async findPatientByEmail(email) {
    const [rows] = await db.execute(
      'SELECT * FROM user u JOIN patient p ON u.user_id = p.user_id WHERE u.email = ? AND u.role_id = 3',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * อัปเดตรหัสผ่านสำหรับ patient (reset password)
   * @param {string} email
   * @param {string} hashedPassword
   * @returns {Promise<Object>}
   */
  static async resetPasswordByEmail(email, hashedPassword) {
    const [result] = await db.execute(
      'UPDATE user SET password = ? WHERE email = ? AND role_id = 3',
      [hashedPassword, email]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงรหัสผ่าน (hashed) จาก user_id
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  static async getPassword(userId) {
    const [rows] = await db.execute(
      'SELECT password FROM user WHERE user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0].password : null;
  }
}

module.exports = UserModel;
