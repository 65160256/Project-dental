const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const multer = require('multer');
const flash = require('express-flash');
const fs = require('fs');
const cron = require('node-cron');

require('dotenv').config();

const authController = require('./controller/auth.controller');

const authRoute = require('./routes/auth.route');
const adminRoutes = require('./routes/admin.route');
const dentistRoutes = require('./routes/dentist.route'); 
const patientRoutes = require('./routes/patient.route');

const app = express();

// ===============================
// สร้าง directories ที่จำเป็น
// ===============================
const createDirectories = () => {
  const directories = [
    path.join(__dirname, 'public'),
    path.join(__dirname, 'public/uploads'),
    path.join(__dirname, 'public/img'),
    path.join(__dirname, 'public/css'),
    path.join(__dirname, 'public/js'),
    path.join(__dirname, 'views'),
    path.join(__dirname, 'views/partials')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
};

createDirectories();

// ===============================
// View Engine Configuration
// ===============================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===============================
// Browser-specific requests handler
// ===============================
app.use((req, res, next) => {
  // Ignore browser-specific requests and common files
  const ignorePaths = [
    '/.well-known/',
    '/favicon.ico',
    '/apple-touch-icon',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json'
  ];
  
  const ignoreExtensions = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/i;
  
  if (ignorePaths.some(path => req.path.startsWith(path)) || ignoreExtensions.test(req.path)) {
    // For .well-known requests, return 204 No Content
    if (req.path.startsWith('/.well-known/')) {
      return res.status(204).end();
    }
    
    // For other ignored paths, check if file exists
    const filePath = path.join(__dirname, 'public', req.path);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else {
      return res.status(404).end();
    }
  }
  
  next();
});

// ===============================
// Static Files Configuration
// ===============================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true
}));

// เสิร์ฟไฟล์ uploads แยกต่างหาก
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '7d', // Cache uploads for 7 days
  etag: true
}));

// ===============================
// Body Parser Configuration
// ===============================
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// ===============================
// Session Configuration
// ===============================
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  name: 'smile_clinic_session', // Custom session name
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true // Prevent XSS
  }
}));

// ===============================
// Other Middleware
// ===============================
app.use(methodOverride('_method'));
app.use(flash());

// ===============================
// Security Headers
// ===============================
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Remove powered by header
  res.removeHeader('X-Powered-By');
  
  next();
});

// ===============================
// Request Logging Middleware
// ===============================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // ไม่ log static files requests เพื่อลด noise
  if (!req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/)) {
    console.log(`📝 ${timestamp} ${method} ${url} - ${userAgent.substring(0, 50)}`);
  }
  
  next();
});

// ===============================
// File Upload Error Handler
// ===============================
app.use('/uploads', (req, res, next) => {
  const filePath = path.join(__dirname, 'public/uploads', req.path);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log(`🔍 File not found: ${req.path}, serving default image`);
      
      // ส่งรูป default ตาม type ของไฟล์
      let defaultImage = 'default-avatar.png';
      
      if (req.path.includes('doctor') || req.path.includes('dentist')) {
        defaultImage = 'default-doctor.png';
      } else if (req.path.includes('patient')) {
        defaultImage = 'default-patient.png';
      }
      
      const defaultPath = path.join(__dirname, 'public/img', defaultImage);
      
      if (fs.existsSync(defaultPath)) {
        return res.sendFile(defaultPath);
      } else {
        // ถ้าไม่มีรูป default ให้ส่ง 404
        return res.status(404).json({
          error: 'Image not found',
          requested: req.path
        });
      }
    }
    next();
  });
});

// ===============================
// Password Reset Token Cleanup Job
// ===============================
cron.schedule('0 * * * *', async () => {
  try {
    const db = require('./config/db'); // ✅ แก้ไข path ให้ถูกต้อง
    await db.execute('DELETE FROM password_resets WHERE expires_at < NOW() OR used_at IS NOT NULL');
    console.log('🧹 Cleaned up expired password reset tokens');
  } catch (error) {
    console.error('❌ Token cleanup error:', error);
  }
});

// ===============================
// Current User Middleware
// ===============================
app.use((req, res, next) => {
  if (authController.getCurrentUser) {
    authController.getCurrentUser(req, res, next);
  } else {
    next();
  }
});

// ===============================
// Global Variables for Views
// ===============================
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.role = req.session.role || null;
  res.locals.isLoggedIn = !!(req.session.user || req.session.userId);
  res.locals.messages = req.flash();
  next();
});

// ===============================
// Routes Configuration
// ===============================

// Auth routes (public)
app.use(authRoute);

// Root route redirect
app.get('/', (req, res) => {
  if (!req.session.user && !req.session.userId) {
    return res.redirect('/login');
  }
  
  const roleId = req.session.user?.role_id || req.session.role;
  
  switch(roleId) {
    case 1:
      res.redirect('/admin/dashboard');
      break;
    case 2:
      res.redirect('/dentist/dashboard');
      break;
    case 3:
      res.redirect('/patient/dashboard');
      break;
    default:
      console.log(`⚠️ Unknown role: ${roleId}, redirecting to login`);
      res.redirect('/login');
  }
});

// ===============================
// Authentication Middleware
// ===============================
const requireAuth = (requiredRole = null) => {
  return (req, res, next) => {
    // ตรวจสอบ login
    if (!req.session.user && !req.session.userId) {
      const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
      
      if (isAjax) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      return res.redirect('/login?message=' + encodeURIComponent('กรุณาเข้าสู่ระบบก่อน'));
    }
    
    // ตรวจสอบ role ถ้าระบุมา
    if (requiredRole) {
      const userRole = req.session.user?.role_id || req.session.role;
      if (userRole !== requiredRole) {
        const roleNames = { 1: 'Admin', 2: 'Dentist', 3: 'Patient' };
        const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
        
        if (isAjax) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Required role: ${roleNames[requiredRole]}`
          });
        }
        
        return res.status(403).render('error', {
          message: `ไม่มีสิทธิ์เข้าถึงหน้านี้ - ต้องเป็น ${roleNames[requiredRole]}`,
          error: { status: 403 }
        });
      }
    }
    
    next();
  };
};

// ===============================
// Protected Routes
// ===============================
app.use('/admin', requireAuth(1), adminRoutes);
app.use('/dentist', requireAuth(2), dentistRoutes);
app.use('/patient', requireAuth(3), patientRoutes);

// ===============================
// API Health Check
// ===============================
app.get('/api/health', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: packageJson.version || '1.0.0',
      node_version: process.version
    });
  } catch (error) {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      node_version: process.version
    });
  }
});

// ===============================
// Test Endpoints (Development only)
// ===============================
if (process.env.NODE_ENV !== 'production') {
  app.get('/test-uploads', (req, res) => {
    const uploadsPath = path.join(__dirname, 'public/uploads');
    
    try {
      const files = fs.readdirSync(uploadsPath);
      res.json({
        success: true,
        uploads_directory: uploadsPath,
        files: files,
        total_files: files.length,
        file_details: files.map(file => {
          const filePath = path.join(uploadsPath, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message,
        uploads_directory: uploadsPath,
        directory_exists: fs.existsSync(uploadsPath)
      });
    }
  });

  app.get('/test-session', (req, res) => {
    res.json({
      session_id: req.sessionID,
      session_data: req.session,
      cookies: req.cookies,
      is_authenticated: !!(req.session.user || req.session.userId)
    });
  });
}

// ===============================
// Error Handling Middleware
// ===============================

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('📤 Multer Error:', err.message);
    
    let message = 'File upload error';
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size too large. Maximum size is 5MB.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field.';
        break;
      default:
        message = err.message;
    }
    
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    
    if (isAjax) {
      return res.status(400).json({
        success: false,
        error: message
      });
    }
    
    req.flash('error', message);
    return res.redirect('back');
  }
  next(err);
});

// ✅ Fixed General Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Application Error:', err);
  
  // ป้องกัน undefined properties
  const requestPath = req.path || req.url || req.originalUrl || 'unknown';
  const method = req.method || 'UNKNOWN';
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.error(`Error on ${method} ${requestPath}:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userAgent: userAgent.substring(0, 100)
  });

  // Database errors
  if (err.code === 'ER_DUP_ENTRY') {
    const message = 'Duplicate entry found. This record already exists.';
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    
    if (isAjax) {
      return res.status(400).json({
        success: false,
        error: message
      });
    }
    
    req.flash('error', message);
    return res.redirect('back');
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    const message = 'Validation failed: ' + Object.values(err.errors).map(e => e.message).join(', ');
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    
    if (isAjax) {
      return res.status(400).json({
        success: false,
        error: message
      });
    }
    
    req.flash('error', message);
    return res.redirect('back');
  }
  
  // ตรวจสอบว่าเป็น API request หรือไม่
  const isApiRequest = requestPath.indexOf('/api/') === 0;
  const isAjaxRequest = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
  
  // Default error response
  const isDevelopment = process.env.NODE_ENV === 'development';
  const statusCode = err.status || err.statusCode || 500;
  
  if (isApiRequest || isAjaxRequest) {
    return res.status(statusCode).json({
      success: false,
      message: 'Internal Server Error',
      error: isDevelopment ? err.message : 'Something went wrong',
      ...(isDevelopment && { stack: err.stack })
    });
  }
  
  // ถ้า response ถูกส่งไปแล้ว
  if (res.headersSent) {
    console.error('❌ Headers already sent, delegating to default Express error handler');
    return next(err);
  }
  
  try {
    res.status(statusCode).render('error', {
      title: 'Server Error',
      message: isDevelopment ? err.message : 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      error: isDevelopment ? err : { status: statusCode }
    });
  } catch (renderError) {
    console.error('❌ Error rendering error page:', renderError.message);
    res.status(statusCode).type('text/plain').send(
      isDevelopment 
        ? `Error: ${err.message}\n\nRender Error: ${renderError.message}` 
        : 'Internal Server Error'
    );
  }
});

// ===============================
// 404 Handler (ต้องอยู่หลัง error handler)
// ===============================
app.use((req, res) => {
  const requestPath = req.path || req.url || 'unknown';
  const method = req.method || 'GET';
  
  console.log(`❓ 404 - Route not found: ${method} ${requestPath}`);
  
  // Ignore common browser requests that already handled above
  const ignoreExtensions = /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/i;
  if (ignoreExtensions.test(requestPath)) {
    return res.status(404).end();
  }
  
  const isApiRequest = requestPath.indexOf('/api/') === 0;
  const isAjaxRequest = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
  
  if (isApiRequest || isAjaxRequest) {
    return res.status(404).json({
      success: false,
      message: '404 Not Found',
      path: requestPath
    });
  }
  
  try {
    res.status(404).render('error', {
      title: 'Page Not Found',
      message: 'หน้าที่คุณต้องการไม่พบ',
      error: { status: 404 }
    });
  } catch (renderError) {
    console.error('❌ Error rendering 404 page:', renderError.message);
    res.status(404).type('text/plain').send('404 Not Found');
  }
});

// ===============================
// Graceful Shutdown
// ===============================
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ===============================
// Initialize Cleanup Jobs (Optional)
// ===============================
try {
  // ลองโหลด cleanup jobs ถ้ามี
  const { scheduleTokenCleanup } = require('./jobs/cleanup-tokens');
  scheduleTokenCleanup();
  console.log('✅ Password reset token cleanup job initialized');
} catch (error) {
  console.log('ℹ️ Cleanup job not available, using cron schedule instead');
}

// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🦷 SMILE CLINIC DENTAL MANAGEMENT SYSTEM');
  console.log('='.repeat(60));
  console.log(`✅ Server running at http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Static files: ${path.join(__dirname, 'public')}`);
  console.log(`🖼️ Uploads: ${path.join(__dirname, 'public/uploads')}`);
  console.log('='.repeat(60));
  console.log('📋 Available Routes:');
  console.log('   AUTH ROUTES:');
  console.log(`   - GET  /login`);
  console.log(`   - POST /login`);
  console.log(`   - GET  /register`);
  console.log(`   - POST /register`);
  console.log(`   - GET  /logout`);
  console.log('   ');
  console.log('   ADMIN ROUTES (Role: 1):');
  console.log(`   - GET  /admin/dashboard`);
  console.log(`   - GET  /admin/profile`);
  console.log(`   - GET  /admin/dentists`);
  console.log(`   - GET  /admin/patients`);
  console.log(`   - GET  /admin/appointments`);
  console.log(`   - GET  /admin/treatments`);
  console.log('   ');
  console.log('   DENTIST ROUTES (Role: 2):');
  console.log(`   - GET  /dentist/dashboard`);
  console.log(`   - GET  /dentist/profile`);
  console.log(`   - GET  /dentist/schedule`);
  console.log('   ');
  console.log('   PATIENT ROUTES (Role: 3):');
  console.log(`   - GET  /patient/dashboard`);
  console.log(`   - GET  /patient/profile`);
  console.log(`   - GET  /patient/appointments`);
  console.log('   ');
  console.log('   API ROUTES:');
  console.log(`   - GET  /api/health`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`   - GET  /test-uploads`);
    console.log(`   - GET  /test-session`);
  }
  console.log('='.repeat(60));
  console.log('🚀 System ready for requests!');
  console.log('='.repeat(60));
});