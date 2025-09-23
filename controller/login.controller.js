const bcrypt = require('bcrypt');
const db = require('../config/db');


exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validation
    if (!email || !password) {
      return res.render('login', { 
        error: 'กรุณากรอกอีเมลและรหัสผ่าน',
        message: null 
      });
    }

    // ดึงข้อมูล user พร้อมกับ role name
    const [rows] = await db.execute(
      `SELECT u.*, r.rname as role_name 
       FROM user u 
       JOIN role r ON u.role_id = r.role_id 
       WHERE u.email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.render('login', { 
        error: 'ไม่พบผู้ใช้งานนี้ในระบบ',
        message: null 
      });
    }

    const user = rows[0];
    
    // ตรวจสอบรหัสผ่าน
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render('login', { 
        error: 'รหัสผ่านไม่ถูกต้อง',
        message: null 
      });
    }

    // ✅ login success: สร้าง session แบบสมบูรณ์
    req.session.user = {
      user_id: user.user_id,
      email: user.email,
      username: user.username,
      role_id: user.role_id,
      role_name: user.role_name
    };

    // เก็บข้อมูลเดิมไว้เพื่อ backward compatibility
    req.session.userId = user.user_id;
    req.session.role = user.role_id;

    // ✅ อัปเดตเวลา last_login
    await db.execute('UPDATE user SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

    // ✅ redirect ตาม role พร้อมดึงข้อมูลเพิ่มเติม
    switch(user.role_id) {
      case 1: // Admin
        return res.redirect('/admin/dashboard');
        
      case 2: // Dentist
        // ดึงข้อมูลหมอฟันเพิ่มเติม
        const [dentistData] = await db.execute(
          'SELECT * FROM dentist WHERE user_id = ?',
          [user.user_id]
        );
        
        if (dentistData.length > 0) {
          req.session.dentist = dentistData[0];
        }
        
        return res.redirect('/dentist/dashboard'); // เปลี่ยนจาก /schedule เป็น /dashboard
        
      case 3: // Patient
        // ดึงข้อมูลผู้ป่วยเพิ่มเติม
        const [patientData] = await db.execute(
          'SELECT * FROM patient WHERE user_id = ?',
          [user.user_id]
        );
        
        if (patientData.length > 0) {
          req.session.patient = patientData[0];
        }
        
        return res.redirect('/patient/dashboard');
        
      default:
        // ถ้าไม่มี role ที่ตรง
        return res.render('login', { 
          error: 'สิทธิ์การเข้าใช้งานไม่ถูกต้อง',
          message: null 
        });
    }

  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', { 
      error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      message: null 
    });
  }
};

// ฟังก์ชันเสริมสำหรับตรวจสอบ session
exports.checkSession = (req, res, next) => {
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
  }
  
  // ถ้ามี session เก่า (userId) แต่ไม่มี session ใหม่ (user) ให้สร้างใหม่
  if (req.session.userId && !req.session.user) {
    exports.refreshSession(req, res, next);
  } else {
    next();
  }
};

// ฟังก์ชันสำหรับ refresh session data
exports.refreshSession = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const [rows] = await db.execute(
      `SELECT u.*, r.rname as role_name 
       FROM user u 
       JOIN role r ON u.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [req.session.userId]
    );

    if (rows.length === 0) {
      req.session.destroy();
      return res.redirect('/login?message=ไม่พบข้อมูลผู้ใช้');
    }

    const user = rows[0];

    // อัพเดท session
    req.session.user = {
      user_id: user.user_id,
      email: user.email,
      username: user.username,
      role_id: user.role_id,
      role_name: user.role_name
    };

    // ดึงข้อมูลเพิ่มเติมตาม role
    if (user.role_id === 2) {
      const [dentistData] = await db.execute(
        'SELECT * FROM dentist WHERE user_id = ?',
        [user.user_id]
      );
      if (dentistData.length > 0) {
        req.session.dentist = dentistData[0];
      }
    } else if (user.role_id === 3) {
      const [patientData] = await db.execute(
        'SELECT * FROM patient WHERE user_id = ?',
        [user.user_id]
      );
      if (patientData.length > 0) {
        req.session.patient = patientData[0];
      }
    }

    next();

  } catch (error) {
    console.error('Refresh session error:', error);
    req.session.destroy();
    res.redirect('/login?message=เกิดข้อผิดพลาด กรุณาเข้าสู่ระบบใหม่');
  }
};

// ฟังก์ชันสำหรับ logout ที่สมบูรณ์
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed');
    }
    
    res.clearCookie('connect.sid');
    res.redirect('/login?message=ออกจากระบบเรียบร้อยแล้ว');
  });
};

// ฟังก์ชันตรวจสอบสิทธิ์สำหรับ API
exports.apiAuth = (req, res, next) => {
  if (!req.session.user && !req.session.userId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'กรุณาเข้าสู่ระบบก่อน' 
    });
  }
  next();
};

// ฟังก์ชันตรวจสอบ role สำหรับ API
exports.apiRequireRole = (roleId) => {
  return (req, res, next) => {
    const userRole = req.session.user?.role_id || req.session.role;
    
    if (userRole !== roleId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'ไม่มีสิทธิ์เข้าถึง' 
      });
    }
    next();
  };
};

// ฟังก์ชันสำหรับดึงข้อมูล user ปัจจุบัน (สำหรับ API)
exports.getCurrentUserData = async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [rows] = await db.execute(
      `SELECT u.user_id, u.email, u.username, u.role_id, r.rname as role_name, u.last_login
       FROM user u 
       JOIN role r ON u.role_id = r.role_id 
       WHERE u.user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];

    // ดึงข้อมูลเพิ่มเติมตาม role
    let additionalData = null;
    
    if (user.role_id === 2) {
      const [dentistData] = await db.execute(
        'SELECT * FROM dentist WHERE user_id = ?',
        [userId]
      );
      additionalData = dentistData[0] || null;
    } else if (user.role_id === 3) {
      const [patientData] = await db.execute(
        'SELECT * FROM patient WHERE user_id = ?',
        [userId]
      );
      additionalData = patientData[0] || null;
    }

    res.json({
      user: user,
      profile: additionalData
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};