const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const registerController = require('../controller/register.controller'); 
// เข้าหน้า login
router.get('/login', authController.getLogin);

// กดปุ่ม login
router.post('/login', authController.postLogin);

// สำหรับผู้ป่วยลงทะเบียน
router.get('/register', authController.getRegister);
router.post('/register', registerController.registerPatient);
// ออกจากระบบ
router.get('/logout', authController.logout);

module.exports = router;
