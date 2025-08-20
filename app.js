const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const multer = require('multer');
const flash = require('express-flash');

require('dotenv').config();

const authController = require('./controller/auth.controller');

const authRoute = require('./routes/auth.route');
const adminRoutes = require('./routes/admin.route');
const dentistRoutes = require('./routes/dentist.route'); 
const patientRoutes = require('./routes/patient.route');

const app = express();

// ตั้งค่า View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// เสิร์ฟไฟล์ static เช่น CSS, รูป
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// ✅ Body Parser สำหรับ POST form (ย้ายมาไว้ก่อน session)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ใช้งาน session
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(methodOverride('_method'));
app.use(flash());

// Current user middleware (ใส่ก่อน routes)
app.use((req, res, next) => {
  if (authController.getCurrentUser) {
    authController.getCurrentUser(req, res, next);
  } else {
    next();
  }
});

// เชื่อม routes
app.use(authRoute);      // /login, /register, /logout

// Root route redirect
app.get('/', (req, res) => {
  // ตรวจสอบการล็อกอิน
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login');
  }
  
  // Redirect ตาม role
  const roleId = req.session.user?.role_id || req.session.role;
  
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
      res.redirect('/login');
  }
});

// Protected routes with authentication middleware
app.use('/admin', (req, res, next) => {
  // ตรวจสอบ login
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
  }
  
  // ตรวจสอบ role admin
  const roleId = req.session.user?.role_id || req.session.role;
  if (roleId !== 1) {
    return res.status(403).render('error', {
      message: 'ไม่มีสิทธิ์เข้าถึงหน้านี้ - ต้องเป็น Admin',
      error: { status: 403 }
    });
  }
  next();
}, adminRoutes);

app.use('/dentist', (req, res, next) => {
  // ตรวจสอบ login
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
  }
  
  // ตรวจสอบ role dentist
  const roleId = req.session.user?.role_id || req.session.role;
  if (roleId !== 2) {
    return res.status(403).render('error', {
      message: 'ไม่มีสิทธิ์เข้าถึงหน้านี้ - ต้องเป็นหมอฟัน',
      error: { status: 403 }
    });
  }
  next();
}, dentistRoutes);

app.use('/patient', (req, res, next) => {
  // ตรวจสอบ login
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login?message=กรุณาเข้าสู่ระบบก่อน');
  }
  
  // ตรวจสอบ role patient
  const roleId = req.session.user?.role_id || req.session.role;
  if (roleId !== 3) {
    return res.status(403).render('error', {
      message: 'ไม่มีสิทธิ์เข้าถึงหน้านี้ - ต้องเป็นผู้ป่วย',
      error: { status: 403 }
    });
  }
  next();
}, patientRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // ถ้ามี error view
  try {
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในระบบ',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  } catch (renderError) {
    // ถ้า render error view ไม่ได้
    res.status(500).json({
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

// ถ้า route ไม่ตรงใด ๆ เลย แสดง 404
app.use((req, res) => {
  try {
    res.status(404).render('error', {
      message: 'หน้าที่คุณต้องการไม่พบ',
      error: { status: 404 }
    });
  } catch (renderError) {
    res.status(404).json({
      message: '404 Not Found',
      path: req.path
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📂 Available routes:`);
  console.log(`   - GET  / (redirect based on role)`);
  console.log(`   - GET  /login`);
  console.log(`   - POST /login`);
  console.log(`   - GET  /register`);
  console.log(`   - POST /register`);
  console.log(`   - GET  /logout`);
  console.log(`   - GET  /admin/dashboard (role: admin)`);
  console.log(`   - GET  /dentist/dashboard (role: dentist)`);
  console.log(`   - GET  /patient/dashboard (role: patient)`);
});