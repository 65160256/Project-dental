const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const registerController = require('../controller/register.controller'); 
const loginController = require('../controller/login.controller');
// เข้าหน้า login
router.get('/login', authController.getLogin);

// กดปุ่ม login
router.post('/login', authController.postLogin);

// สำหรับผู้ป่วยลงทะเบียน
router.get('/register', authController.getRegister);
router.post('/register', registerController.registerPatient);
// ออกจากระบบ
router.get('/logout', authController.logout);

// API routes
router.get('/api/auth/status', (req, res) => {
    if (req.session.user || req.session.userId) {
        res.json({
            authenticated: true,
            user: req.session.user || {
                user_id: req.session.userId,
                role_id: req.session.role
            }
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});
module.exports = router;
