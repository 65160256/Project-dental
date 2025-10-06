const db = require('../config/db');

class PasswordResetModel {
  // ค้นหา user จาก email
  static async getUserByEmail(email) {
    try {
      const [users] = await db.execute(
        'SELECT user_id, email FROM user WHERE email = ?',
        [email]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch user by email: ' + error.message);
    }
  }

  // ลบ token เดิมทั้งหมดของอีเมลนี้
  static async deleteTokensByEmail(email) {
    try {
      await db.execute(
        'DELETE FROM password_resets WHERE email = ?',
        [email]
      );
    } catch (error) {
      throw new Error('Failed to delete old tokens: ' + error.message);
    }
  }

  // สร้าง token ใหม่
  static async createPasswordResetToken(userId, email, token, expiresAt) {
    try {
      const [result] = await db.execute(
        'INSERT INTO password_resets (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
        [userId, email, token, expiresAt]
      );
      return result.insertId;
    } catch (error) {
      throw new Error('Failed to create reset token: ' + error.message);
    }
  }

  // ตรวจสอบ token ว่ายังใช้งานได้หรือไม่
  static async validateToken(token) {
    try {
      const [tokens] = await db.execute(
        `SELECT pr.*, u.email as user_email 
         FROM password_resets pr 
         JOIN user u ON pr.user_id = u.user_id 
         WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
        [token]
      );
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      throw new Error('Failed to validate token: ' + error.message);
    }
  }

  // ดึงข้อมูล token พร้อม user (สำหรับ reset password)
  static async getTokenWithUser(token) {
    try {
      const [tokens] = await db.execute(
        `SELECT pr.*, u.user_id, u.email as user_email 
         FROM password_resets pr 
         JOIN user u ON pr.user_id = u.user_id 
         WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
        [token]
      );
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch token with user: ' + error.message);
    }
  }

  // อัพเดทรหัสผ่านและทำเครื่องหมาย token ว่าใช้แล้ว (Transaction)
  static async resetPasswordWithToken(userId, hashedPassword, tokenId) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // อัพเดทรหัสผ่าน
      await connection.execute(
        'UPDATE user SET password = ? WHERE user_id = ?',
        [hashedPassword, userId]
      );

      // ทำเครื่องหมาย token ว่าใช้แล้ว
      await connection.execute(
        'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
        [tokenId]
      );

      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw new Error('Transaction failed: ' + error.message);
    } finally {
      connection.release();
    }
  }

  // ลบ token ที่หมดอายุหรือใช้แล้ว
  static async cleanupExpiredTokens() {
    try {
      const [result] = await db.execute(
        'DELETE FROM password_resets WHERE expires_at < NOW() OR used_at IS NOT NULL'
      );
      return result.affectedRows;
    } catch (error) {
      throw new Error('Failed to cleanup tokens: ' + error.message);
    }
  }

  // นับจำนวน token ที่ยังใช้งานได้
  static async getActiveTokensCount() {
    try {
      const [result] = await db.execute(
        'SELECT COUNT(*) as count FROM password_resets WHERE expires_at > NOW() AND used_at IS NULL'
      );
      return result[0].count;
    } catch (error) {
      throw new Error('Failed to count active tokens: ' + error.message);
    }
  }

  // ดึงสถิติการ reset password (30 วันล่าสุด)
  static async getPasswordResetStats() {
    try {
      const [results] = await db.execute(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_requests,
          SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as successful_resets,
          SUM(CASE WHEN expires_at < NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as expired_tokens
        FROM password_resets 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);
      return results;
    } catch (error) {
      throw new Error('Failed to fetch reset stats: ' + error.message);
    }
  }

  // ตรวจสอบ token สำหรับ API (ไม่รวม user_id)
  static async validateTokenForApi(token) {
    try {
      const [tokens] = await db.execute(
        `SELECT pr.email, pr.expires_at 
         FROM password_resets pr 
         WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
        [token]
      );
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      throw new Error('Failed to validate token: ' + error.message);
    }
  }

  // ดึงข้อมูล token สำหรับ API reset
  static async getTokenForApiReset(token) {
    try {
      const [tokens] = await db.execute(
        `SELECT pr.id, pr.email, u.user_id 
         FROM password_resets pr 
         JOIN user u ON pr.user_id = u.user_id 
         WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
        [token]
      );
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      throw new Error('Failed to fetch token: ' + error.message);
    }
  }
}

module.exports = PasswordResetModel;