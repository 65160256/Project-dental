const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordResetModel = require('../models/password-reset.model');
const emailService = require('../services/email.service');

// Rate limiting storage (in production, use Redis)
const rateLimitStore = new Map();

// Rate limiting function
function checkRateLimit(identifier, maxRequests = 5, windowMs = 15 * 60 * 1000) { // 5 requests per 15 minutes
  const now = Date.now();
  const key = `rate_limit_${identifier}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }
  
  const requests = rateLimitStore.get(key);
  
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return {
      allowed: false,
      resetTime: validRequests[0] + windowMs,
      remaining: 0
    };
  }
  
  // Add current request
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);
  
  return {
    allowed: true,
    remaining: maxRequests - validRequests.length
  };
}

// Clean up old rate limit data periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  
  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

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
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!email) {
      return res.render('auth/forgot-password', { 
        error: 'กรุณากรอกอีเมลของคุณ',
        message: null,
        success: false
      });
    }

    // Rate limiting check (by IP and email)
    const ipRateLimit = checkRateLimit(`ip_${clientIP}`, 10, 15 * 60 * 1000); // 10 requests per 15 minutes per IP
    const emailRateLimit = checkRateLimit(`email_${email}`, 3, 15 * 60 * 1000); // 3 requests per 15 minutes per email
    
    if (!ipRateLimit.allowed) {
      console.log(`Rate limit exceeded for IP: ${clientIP} - ${ipRateLimit.remaining} requests remaining`);
      return res.render('auth/forgot-password', { 
        error: `คำขอมากเกินไป กรุณารอ ${Math.ceil((ipRateLimit.resetTime - Date.now()) / 60000)} นาที`,
        message: null,
        success: false
      });
    }
    
    if (!emailRateLimit.allowed) {
      console.log(`Rate limit exceeded for email: ${email} - ${emailRateLimit.remaining} requests remaining`);
      return res.render('auth/forgot-password', { 
        error: `คำขอสำหรับอีเมลนี้มากเกินไป กรุณารอ ${Math.ceil((emailRateLimit.resetTime - Date.now()) / 60000)} นาที`,
        message: null,
        success: false
      });
    }

    // ค้นหา user จาก email (ใช้ Model)
    const user = await PasswordResetModel.getUserByEmail(email);

    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email} from IP: ${clientIP}`);
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
      console.log(`Password reset email sent to: ${email} from IP: ${clientIP} - Remaining requests: ${emailRateLimit.remaining}`);
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
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Rate limiting check (by IP and email)
    const ipRateLimit = checkRateLimit(`api_ip_${clientIP}`, 10, 15 * 60 * 1000); // 10 requests per 15 minutes per IP
    const emailRateLimit = checkRateLimit(`api_email_${email}`, 3, 15 * 60 * 1000); // 3 requests per 15 minutes per email
    
    if (!ipRateLimit.allowed) {
      console.log(`API Rate limit exceeded for IP: ${clientIP}`);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((ipRateLimit.resetTime - Date.now()) / 1000)
      });
    }
    
    if (!emailRateLimit.allowed) {
      console.log(`API Rate limit exceeded for email: ${email}`);
      return res.status(429).json({
        success: false,
        error: 'Too many requests for this email. Please try again later.',
        retryAfter: Math.ceil((emailRateLimit.resetTime - Date.now()) / 1000)
      });
    }

    // ค้นหา user (ใช้ Model)
    const user = await PasswordResetModel.getUserByEmail(email);

    if (!user) {
      console.log(`API Password reset requested for non-existent email: ${email} from IP: ${clientIP}`);
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
      console.log(`API Password reset email sent to: ${email} from IP: ${clientIP} - Remaining requests: ${emailRateLimit.remaining}`);
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

// Get rate limiting stats
exports.getRateLimitStats = () => {
  const stats = {
    totalKeys: rateLimitStore.size,
    activeLimits: 0,
    ipLimits: 0,
    emailLimits: 0
  };
  
  for (const [key, requests] of rateLimitStore.entries()) {
    if (requests.length > 0) {
      stats.activeLimits++;
      if (key.startsWith('rate_limit_ip_')) {
        stats.ipLimits++;
      } else if (key.startsWith('rate_limit_email_')) {
        stats.emailLimits++;
      }
    }
  }
  
  return stats;
};

// Clear rate limiting data (admin function)
exports.clearRateLimitData = (identifier = null) => {
  if (identifier) {
    const key = `rate_limit_${identifier}`;
    if (rateLimitStore.has(key)) {
      rateLimitStore.delete(key);
      return { cleared: 1, key };
    }
    return { cleared: 0, key };
  } else {
    const size = rateLimitStore.size;
    rateLimitStore.clear();
    return { cleared: size };
  }
};