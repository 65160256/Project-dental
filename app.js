const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const multer = require('multer');
const flash = require('express-flash');

require('dotenv').config();

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

// รับข้อมูลจาก form
app.use(bodyParser.urlencoded({ extended: true }));

// ใช้งาน session
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false
}));
app.use(methodOverride('_method'));
app.use(flash());

// เชื่อม routes
app.use(authRoute);      // /login, /register, /logout


app.use('/admin', adminRoutes);
app.use('/dentist', dentistRoutes);
app.use('/patient', patientRoutes);


// ถ้า route ไม่ตรงใด ๆ เลย แสดง 404
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

// ✅ Body Parser สำหรับ POST form
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Static folder
app.use('/uploads', express.static('uploads'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
