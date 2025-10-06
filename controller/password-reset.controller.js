const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordResetModel = require('../models/password-reset.model');
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
    
    if (!email) {
      return res.render('auth/forgot-password', { 
        error: 'กรุณากรอกอีเมลของคุณ',
        message: null,
        success: false
      });
    }

    // ค้นหา user จาก email (ใช้ Model)
    const user = await PasswordResetModel.getUserByEmail(email);

    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.render('auth/forgot-password', { 
        error: null,
        message: 'หากอีเมลนี้มีอยู่ในระบบ เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปให้คุณ',
        success: true
      });
    }

    // ลบ token เดิมทั้งหมดของอีเมลนี้ (ใช้ Model)
    await PasswordResetModel.deleteTokensByEmail(email);

    // สร้าง token ใหม่
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ชั่วโมง

    // บันทึก token พร้อม user_id (ใช้ Model)
    await PasswordResetModel.createPasswordResetToken(
      user.user_id, 
      email, 
      token, 
      expiresAt
    );

    // ส่งอีเมล
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

    // ตรวจสอบ token (ใช้ Model)
    const tokenData = await PasswordResetModel.validateToken(token);

    if (!tokenData) {
      return res.render('auth/reset-password-error', { 
        message: 'ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว',
        token: null
      });
    }

    res.render('auth/reset-password', {
      token: token,
      email: tokenData.user_email,
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

    // ดึงข้อมูล token พร้อม user (ใช้ Model)
    const resetData = await PasswordResetModel.getTokenWithUser(token);

    if (!resetData) {
      return res.render('auth/reset-password-error', { 
        message: 'ลิงก์รีเซ็ตรหัสผ่านนี้ไม่ถูกต้องหรือหมดอายุแล้ว',
        token: token
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // อัพเดทรหัสผ่านด้วย Transaction (ใช้ Model)
    await PasswordResetModel.resetPasswordWithToken(
      resetData.user_id,
      hashedPassword,
      resetData.id
    );

    console.log(`Password reset successful for user: ${resetData.user_email}`);
    
    // ส่งอีเมลแจ้งเตือน
    await emailService.sendPasswordChangedEmail(resetData.user_email);

    res.render('auth/reset-password-success', {
      message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว สามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้แล้ว'
    });

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

exports.apiForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // ค้นหา user (ใช้ Model)
    const user = await PasswordResetModel.getUserByEmail(email);

    if (!user) {
      return res.json({
        success: true,
        message: 'If this email exists in our system, we will send you a password reset link.'
      });
    }

    // ลบ token เดิม (ใช้ Model)
    await PasswordResetModel.deleteTokensByEmail(email);

    // สร้าง token ใหม่
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // บันทึก token (ใช้ Model)
    await PasswordResetModel.createPasswordResetToken(
      user.user_id,
      email,
      token,
      expiresAt
    );

    // ส่งอีเมล
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

exports.apiValidateToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    // ตรวจสอบ token (ใช้ Model)
    const tokenData = await PasswordResetModel.validateTokenForApi(token);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    res.json({
      success: true,
      valid: true,
      email: tokenData.email,
      expires_at: tokenData.expires_at
    });

  } catch (error) {
    console.error('API validate token error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

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

    // ดึงข้อมูล token (ใช้ Model)
    const resetData = await PasswordResetModel.getTokenForApiReset(token);

    if (!resetData) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Reset password ด้วย Transaction (ใช้ Model)
    await PasswordResetModel.resetPasswordWithToken(
      resetData.user_id,
      hashedPassword,
      resetData.id
    );

    // ส่งอีเมลแจ้งเตือน
    await emailService.sendPasswordChangedEmail(resetData.email);

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('API reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// ==================== UTILITY FUNCTIONS ====================

exports.cleanupExpiredTokens = async () => {
  try {
    const affectedRows = await PasswordResetModel.cleanupExpiredTokens();
    console.log(`Cleaned up ${affectedRows} expired/used password reset tokens`);
    return affectedRows;
  } catch (error) {
    console.error('Cleanup expired tokens error:', error);
    return 0;
  }
};

exports.getActiveTokensCount = async () => {
  try {
    return await PasswordResetModel.getActiveTokensCount();
  } catch (error) {
    console.error('Get active tokens count error:', error);
    return 0;
  }
};

exports.getPasswordResetStats = async () => {
  try {
    return await PasswordResetModel.getPasswordResetStats();
  } catch (error) {
    console.error('Get password reset stats error:', error);
    return [];
  }
};