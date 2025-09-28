// แทนที่ใน routes/auth.route.js หรือไฟล์ routes หลักของคุณ

const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const registerController = require('../controller/register.controller'); // ใช้ controller เดิม
const loginController = require('../controller/login.controller');
const passwordResetController = require('../controller/password-reset.controller');

// Middleware สำหรับตรวจสอบ session และ rate limiting
const rateLimit = require('express-rate-limit');

// Rate limiting สำหรับการ login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 5, // จำกัด 5 ครั้งต่อ IP
    message: {
        error: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting สำหรับการ register (เข้มงวดขึ้น)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ชั่วโมง
    max: 3, // จำกัด 3 ครั้งต่อ IP
    message: {
        error: 'Too many registration attempts, please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting สำหรับ API calls
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 นาที
    max: 20, // จำกัด 20 ครั้งต่อนาที
    message: {
        success: false,
        error: 'Too many requests, please slow down'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting สำหรับ forgot password
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 3, // จำกัด 3 ครั้งต่อ IP
    message: {
        error: 'Too many reset attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting สำหรับ reset password
const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ชั่วโมง
    max: 10, // จำกัด 10 ครั้งต่อ IP
    message: {
        error: 'Too many password reset attempts, please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware สำหรับตรวจสอบว่าล็อกอินแล้วหรือยัง
const requireGuest = (req, res, next) => {
    if (req.session.user || req.session.userId) {
        return authController.redirectBasedOnRole(req, res);
    }
    next();
};

// Middleware สำหรับตรวจสอบการล็อกอิน
const requireAuth = (req, res, next) => {
    if (!req.session.user && !req.session.userId) {
        return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
    }
    next();
};

// =========== Authentication Routes ===========

// เข้าหน้า login (ต้องยังไม่ล็อกอิน)
router.get('/login', requireGuest, authController.getLogin);

// กดปุ่ม login (มี rate limiting)
router.post('/login', loginLimiter, authController.postLogin);

// สำหรับผู้ป่วยลงทะเบียน (ต้องยังไม่ล็อกอิน)
router.get('/register', requireGuest, authController.getRegister);
router.post('/register', registerLimiter, registerController.registerPatient); // ใช้ controller เดิม

// ออกจากระบบ (ต้องล็อกอินแล้ว)
router.get('/logout', requireAuth, authController.logout);
router.post('/logout', requireAuth, authController.logout); // รองรับทั้ง GET และ POST

// =========== Password Reset Routes ===========

// หน้า Forgot Password
router.get('/forgot-password', requireGuest, passwordResetController.getForgotPassword);

// ส่ง Reset Password Email
router.post('/forgot-password', forgotPasswordLimiter, passwordResetController.sendResetEmail);

// หน้า Reset Password (with token)
router.get('/reset-password/:token', requireGuest, passwordResetController.getResetPassword);

// ประมวลผล Reset Password
router.post('/reset-password/:token', resetPasswordLimiter, passwordResetController.processResetPassword);

// =========== API Routes สำหรับการตรวจสอบข้อมูลซ้ำ ===========

// ตรวจสอบอีเมลซ้ำแบบ Real-time
router.get('/api/check-email', apiLimiter, async (req, res) => {
    try {
        const { email } = req.query;
        const validator = require('validator');
        const db = require('../config/db');
        
        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }
        
        const [existing] = await db.execute(
            'SELECT user_id FROM user WHERE LOWER(email) = LOWER(?)',
            [email]
        );
        
        return res.json({
            success: true,
            available: existing.length === 0
        });
        
    } catch (error) {
        console.error('Email check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// ตรวจสอบบัตรประชาชนซ้ำแบบ Real-time
router.get('/api/check-id-card', apiLimiter, async (req, res) => {
    try {
        const { id_card } = req.query;
        const db = require('../config/db');
        
        if (!id_card || !/^\d{13}$/.test(id_card)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid ID card format'
            });
        }
        
        const [existing] = await db.execute(
            'SELECT patient_id FROM patient WHERE id_card = ?',
            [id_card]
        );
        
        return res.json({
            success: true,
            available: existing.length === 0
        });
        
    } catch (error) {
        console.error('ID card check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// =========== Existing API Routes ===========

// ตรวจสอบสถานะการล็อกอิน
router.get('/api/auth/status', (req, res) => {
    try {
        if (req.session.user || req.session.userId) {
            const user = req.session.user || {
                user_id: req.session.userId,
                role_id: req.session.role
            };
            
            res.json({
                success: true,
                authenticated: true,
                user: {
                    user_id: user.user_id,
                    email: user.email,
                    username: user.username,
                    role_id: user.role_id,
                    role_name: user.role_name
                }
            });
        } else {
            res.json({
                success: true,
                authenticated: false,
                user: null
            });
        }
    } catch (error) {
        console.error('Auth status error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// API สำหรับล็อกอิน (สำหรับ AJAX requests)
router.post('/api/login', loginLimiter, async (req, res) => {
    try {
        // ใช้ loginController.login แต่ส่งผลลัพธ์เป็น JSON
        const originalRender = res.render;
        const originalRedirect = res.redirect;
        
        let result = {};
        
        res.render = (view, data) => {
            result = {
                success: false,
                error: data.error,
                message: data.message
            };
        };
        
        res.redirect = (url) => {
            if (url.includes('dashboard') || url.includes('admin') || url.includes('dentist') || url.includes('patient')) {
                result = {
                    success: true,
                    redirect: url,
                    user: req.session.user
                };
            } else {
                result = {
                    success: false,
                    error: 'Login failed'
                };
            }
        };
        
        await loginController.login(req, res);
        
        // คืนค่า methods เดิม
        res.render = originalRender;
        res.redirect = originalRedirect;
        
        res.json(result);
    } catch (error) {
        console.error('API login error:', error);
        res.status(500).json({
            success: false,
            error: 'เกิดข้อผิดพลาดในระบบ'
        });
    }
});

// API สำหรับล็อกเอาท์
router.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('API logout error:', err);
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
        
        res.clearCookie('connect.sid');
        res.json({
            success: true,
            message: 'ออกจากระบบเรียบร้อยแล้ว'
        });
    });
});

// API สำหรับ forgot password
router.post('/api/forgot-password', forgotPasswordLimiter, passwordResetController.apiForgotPassword);

// API สำหรับตรวจสอบ reset token
router.get('/api/reset-password/:token/validate', passwordResetController.apiValidateToken);

// API สำหรับ reset password
router.post('/api/reset-password/:token', resetPasswordLimiter, passwordResetController.apiResetPassword);

// API สำหรับตรวจสอบ session validity
router.get('/api/auth/validate', (req, res) => {
    if (!req.session.user && !req.session.userId) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            authenticated: false
        });
    }
    
    res.json({
        success: true,
        authenticated: true,
        valid: true
    });
});

// API สำหรับรีเฟรช session
router.post('/api/auth/refresh', async (req, res) => {
    try {
        if (!req.session.userId && !req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'No session to refresh'
            });
        }
        
        // ใช้ loginController.refreshSession
        await loginController.refreshSession(req, res, () => {
            res.json({
                success: true,
                user: req.session.user,
                message: 'Session refreshed'
            });
        });
    } catch (error) {
        console.error('Session refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh session'
        });
    }
});

// =========== Error Handling ===========

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('Auth router error:', error);
    
    if (req.path.startsWith('/api/')) {
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } else {
        res.redirect('/login?message=เกิดข้อผิดพลาดในระบบ');
    }
});

module.exports = router;