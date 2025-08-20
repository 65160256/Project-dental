const db = require('../models/db');
const bcrypt = require('bcryptjs');
const loginController = require('./login.controller');

exports.getLogin = (req, res) => {
  // ตรวจสอบว่าล็อกอินอยู่แล้วหรือไม่
  if (req.session.user || req.session.userId) {
    return exports.redirectBasedOnRole(req, res);
  }
  
  res.render('login', { 
    error: null,
    message: req.query.message || null 
  });
};

exports.postLogin = loginController.login;

exports.getRegister = (req, res) => {
  // ตรวจสอบว่าล็อกอินอยู่แล้วหรือไม่
  if (req.session.user || req.session.userId) {
    return exports.redirectBasedOnRole(req, res);
  }
  
  res.render('register', { 
    error: null,
    message: null 
  });
};

exports.postRegister = async (req, res) => {
  try {
    const { fname, lname, dob, idcard, email, password, address, phone, role } = req.body;

    // Validation
    if (!fname || !lname || !email || !password) {
      return res.render('register', { 
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน',
        message: null 
      });
    }

    if (password.length < 6) {
      return res.render('register', { 
        error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
        message: null 
      });
    }

    // ตรวจสอบว่าอีเมลมีอยู่แล้วหรือไม่
    const [existingUsers] = await db.execute(
      'SELECT user_id FROM user WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.render('register', { 
        error: 'อีเมลนี้มีอยู่ในระบบแล้ว',
        message: null 
      });
    }

    // สร้าง hash password
    const hash = await bcrypt.hash(password, 10);
    
    // กำหนด role_id (ถ้าไม่ระบุจะเป็น patient)
    const roleId = role === 'dentist' ? 2 : 3;

    // สร้าง user ใหม่
    const [userResult] = await db.execute(
      'INSERT INTO user (role_id, email, password) VALUES (?, ?, ?)', 
      [roleId, email, hash]
    );

    const user_id = userResult.insertId;

    // สร้างข้อมูลตาม role
    if (roleId === 2) {
      // สร้างข้อมูล dentist
      await db.execute(
        'INSERT INTO dentist (user_id, fname, lname, phone, dob, address, idcard) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, fname, lname, phone, dob, address, idcard]
      );
    } else {
      // สร้างข้อมูล patient (เดิม)
      await db.execute(
        'INSERT INTO patient (user_id, fname, lname, phone, dob, address, idcard) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, fname, lname, phone, dob, address, idcard]
      );
    }

    res.redirect('/login?message=สมัครสมาชิกเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ');

  } catch (error) {
    console.error('Register error:', error);
    res.render('register', { 
      error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      message: null 
    });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    res.clearCookie('connect.sid'); // ลบ session cookie
    res.redirect('/login?message=ออกจากระบบเรียบร้อยแล้ว');
  });
};

// ฟังก์ชันที่ app.js ต้องการ

// Redirect ตาม role ของผู้ใช้
exports.redirectBasedOnRole = (req, res) => {
  const roleId = req.session.user?.role_id || req.session.role;
  
  if (!roleId) {
    return res.redirect('/login');
  }

  switch(roleId) {
    case 1: // Admin
      res.redirect('/admin/dashboard');
      break;
    case 2: // Dentist
      res.redirect('/dentist/dashboard');
      break;
    case 3: // Patient
      res.redirect('/patient/dashboard');
      break;
    default:
      res.redirect('/login?message=สิทธิ์การเข้าใช้งานไม่ถูกต้อง');
  }
};

// Middleware สำหรับตรวจสอบการล็อกอิน
exports.requireAuth = (req, res, next) => {
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
  }
  next();
};

// Middleware สำหรับ current user (ถ้าต้องการ)
exports.getCurrentUser = async (req, res, next) => {
  if (req.session.user || req.session.userId) {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      
      // ดึงข้อมูลผู้ใช้ล่าสุดจากฐานข้อมูล
      const [users] = await db.execute(`
        SELECT u.*, r.rname as role_name 
        FROM user u 
        JOIN role r ON u.role_id = r.role_id 
        WHERE u.user_id = ?
      `, [userId]);

      if (users.length > 0) {
        req.currentUser = users[0];
        res.locals.currentUser = users[0]; // สำหรับใช้ใน views
        
        // อัพเดท session ถ้าไม่มี user object
        if (!req.session.user) {
          req.session.user = {
            user_id: users[0].user_id,
            email: users[0].email,
            username: users[0].username,
            role_id: users[0].role_id,
            role_name: users[0].role_name
          };
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  }
  next();
};