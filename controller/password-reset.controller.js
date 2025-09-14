const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const emailService = require('../services/email.service');

// ==================== WEB CONTROLLERS ====================

// แสดงหน้า Forgot Password
exports.getForgotPassword = (req, res) => {
  res.render('auth/forgot-password', { 
    error: null,
    message: null,
    success: false
  });
};

// ประมวลผล Forgot Password และส่ง Email
exports.sendResetEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validation
    if (!email) {
      return res.render('auth/forgot-password', { 
        error: 'กรุณากรอกอีเมลของคุณ',
        message: null,
        success: false
      });
    }

    // ตรวจสอบว่าอีเมลมีอยู่ในระบบหรือไม่
    const [users] = await db.execute(
      'SELECT user_id, email FROM user WHERE email = ?', 
      [email]
    );

    // แม้ไม่พบอีเมล ก็แสดงข้อความเดียวกัน (เพื่อความปลอดภัย)
    // แต่ไม่ส่งอีเมลจริง
    if (users.length === 0) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.render('auth/forgot-password', { 
        error: null,
        message: 'หากอีเมลนี้มีอยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้คุณ',
        success: true
      });
    }

    const user = users[0];

    // ลบ token เก่าที่หมดอายุหรือใช้แล้ว
    await db.execute(
      'DELETE FROM password_resets WHERE email = ? AND (expires_at < NOW() OR used_at IS NOT NULL)',
      [email]
    );

    // สร้าง token ใหม่
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // หมดอายุใน 1 ชั่วโมง

    // บันทึก token ลง database
    await db.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [email, token, expiresAt]
    );

    // ส่ง email
    const emailResult = await emailService.sendResetPasswordEmail(email, token);

    if (emailResult.success) {
      console.log(`Password reset email sent to: ${email}`);
      res.render('auth/forgot-password', { 
        error: null,
        message: 'เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องจดหมายและสแปม',
        success: true
      });
    } else {
      throw new Error('Failed to send email');
    }

  } catch (error) {
    console.error('Send reset email error:', error);
    res.render('auth/forgot-password', { 
      error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      message: null,
      success: false
    });
  }
};

// แสดงหน้า Reset Password พร้อมตรวจสอบ token
exports.getResetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.render('auth/error', {
        title: 'Invalid Request',
        message: 'Token ไม่ถูกต้อง',
        error: { status: 400 }
      });
    }

    // ตรวจสอบ token ในฐานข้อมูล
    const [tokens] = await db.execute(
      `SELECT pr.*, u.email as user_email 
       FROM password_resets pr 
       JOIN user u ON pr.email = u.email 
       WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
      [token]
    );

    if (tokens.length === 0) {
      return res.render('auth/reset-password-error', { 
        message: 'ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว',
        token: null
      });
    }

    // แสดงหน้า reset password
    res.render('auth/reset-password', {
      token: token,
      email: tokens[0].email,
      error: null,
      success: false
    });

  } catch (error) {
    console.error('Get reset password error:', error);
    res.render('auth/error', {
      title: 'System Error',
      message: 'เกิดข้อผิดพลาดในระบบ',
      error: { status: 500 }
    });
  }
};

// ประมวลผล Reset Password
exports.processResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // Validation
    if (!password || !confirmPassword) {
      return res.render('auth/reset-password', {
        token: token,
        email: null,
        error: 'กรุณากรอกรหัสผ่านใหม่ให้ครบถ้วน',
        success: false
      });
    }

    if (password !== confirmPassword) {
      return res.render('auth/reset-password', {
        token: token,
        email: null,
        error: 'รหัสผ่านไม่ตรงกัน',
        success: false
      });
    }

    if (password.length < 6) {
      return res.render('auth/reset-password', {
        token: token,
        email: null,
        error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
        success: false
      });
    }

    // ตรวจสอบ token
    const [tokens] = await db.execute(
      `SELECT pr.*, u.user_id, u.email as user_email 
       FROM password_resets pr 
       JOIN user u ON pr.email = u.email 
       WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
      [token]
    );

    if (tokens.length === 0) {
      return res.render('auth/reset-password-error', { 
        message: 'ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว',
        token: token
      });
    }

    const resetData = tokens[0];

    // เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(password, 10);

    // แก้ไข: ใช้ db.query() สำหรับ transaction control
    await db.query('START TRANSACTION');

    try {
      // อัปเดตรหัสผ่าน
      await db.execute(
        'UPDATE user SET password = ? WHERE user_id = ?',
        [hashedPassword, resetData.user_id]
      );

      // ทำเครื่องหมายว่า token ถูกใช้แล้ว
      await db.execute(
        'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
        [resetData.id]
      );

      // Commit transaction
      await db.query('COMMIT');

      console.log(`Password reset successful for user: ${resetData.user_email}`);

      // ส่ง email แจ้งเตือนการเปลี่ยนรหัสผ่าน
      await emailService.sendPasswordChangedEmail(resetData.user_email);

      // แสดงหน้าความสำเร็จ
      res.render('auth/reset-password-success', {
        message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้แล้ว'
      });

    } catch (dbError) {
      // Rollback transaction
      await db.query('ROLLBACK');
      throw dbError;
    }

  } catch (error) {
    console.error('Process reset password error:', error);
    res.render('auth/reset-password', {
      token: req.params.token,
      email: null,
      error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      success: false
    });
  }
};

// ==================== API CONTROLLERS ====================

// API: Forgot Password
exports.apiForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // ตรวจสอบว่าอีเมลมีอยู่ในระบบหรือไม่
    const [users] = await db.execute(
      'SELECT user_id, email FROM user WHERE email = ?', 
      [email]
    );

    // แม้ไม่พบอีเมล ก็ส่ง response เดียวกัน (เพื่อความปลอดภัย)
    if (users.length === 0) {
      return res.json({
        success: true,
        message: 'If this email exists in our system, we will send you a password reset link.'
      });
    }

    const user = users[0];

    // ลบ token เก่า
    await db.execute(
      'DELETE FROM password_resets WHERE email = ? AND (expires_at < NOW() OR used_at IS NOT NULL)',
      [email]
    );

    // สร้าง token ใหม่
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // บันทึก token
    await db.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [email, token, expiresAt]
    );

    // ส่ง email
    const emailResult = await emailService.sendResetPasswordEmail(email, token);

    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } else {
      throw new Error('Failed to send email');
    }

  } catch (error) {
    console.error('API forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// API: ตรวจสอบความถูกต้องของ token
exports.apiValidateToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const [tokens] = await db.execute(
      `SELECT pr.email, pr.expires_at 
       FROM password_resets pr 
       WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    res.json({
      success: true,
      valid: true,
      email: tokens[0].email,
      expires_at: tokens[0].expires_at
    });

  } catch (error) {
    console.error('API validate token error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// API: Reset Password
exports.apiResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // Validation
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Password and confirm password are required'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // ตรวจสอบ token
    const [tokens] = await db.execute(
      `SELECT pr.id, pr.email, u.user_id 
       FROM password_resets pr 
       JOIN user u ON pr.email = u.email 
       WHERE pr.token = ? AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
      [token]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    const resetData = tokens[0];

    // เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(password, 10);

    // แก้ไข: ใช้ db.query() สำหรับ transaction control
    await db.query('START TRANSACTION');

    try {
      // อัปเดตรหัสผ่าน
      await db.execute(
        'UPDATE user SET password = ? WHERE user_id = ?',
        [hashedPassword, resetData.user_id]
      );

      // ทำเครื่องหมายว่า token ถูกใช้แล้ว
      await db.execute(
        'UPDATE password_resets SET used_at = NOW() WHERE id = ?',
        [resetData.id]
      );

      // Commit transaction
      await db.query('COMMIT');

      // ส่ง email แจ้งเตือน
      await emailService.sendPasswordChangedEmail(resetData.email);

      res.json({
        success: true,
        message: 'Password has been reset successfully'
      });

    } catch (dbError) {
      await db.query('ROLLBACK');
      throw dbError;
    }

  } catch (error) {
    console.error('API reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// ==================== UTILITY FUNCTIONS ====================

// ฟังก์ชันสำหรับทำความสะอาด token ที่หมดอายุ (ใช้กับ cron job)
exports.cleanupExpiredTokens = async () => {
  try {
    const [result] = await db.execute(
      'DELETE FROM password_resets WHERE expires_at < NOW() OR used_at IS NOT NULL'
    );
    
    console.log(`Cleaned up ${result.affectedRows} expired/used password reset tokens`);
    return result.affectedRows;
  } catch (error) {
    console.error('Cleanup expired tokens error:', error);
    return 0;
  }
};

// ฟังก์ชันตรวจสอบจำนวน token ที่ยังใช้งานได้
exports.getActiveTokensCount = async () => {
  try {
    const [result] = await db.execute(
      'SELECT COUNT(*) as count FROM password_resets WHERE expires_at > NOW() AND used_at IS NULL'
    );
    
    return result[0].count;
  } catch (error) {
    console.error('Get active tokens count error:', error);
    return 0;
  }
};

// ฟังก์ชันสำหรับดูสถิติการใช้งาน password reset (สำหรับ admin)
exports.getPasswordResetStats = async () => {
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
    console.error('Get password reset stats error:', error);
    return [];
  }
};