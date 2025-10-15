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
const { initializeNotificationJobs } = require('./jobs/notificationJobs');
const patientNotificationRoutes = require('./routes/patient-notifications');
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

  console.log('='.repeat(60));
  console.log('Creating and verifying directories...');
  console.log('='.repeat(60));

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory exists: ${dir}`);
    }
    
    // ตรวจสอบสิทธิ์การเขียนไฟล์
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      console.log(`  Writable: YES`);
    } catch (err) {
      console.error(`  Writable: NO - ${err.message}`);
    }
  });
  
  // แสดงข้อมูล uploads directory โดยละเอียด
  const uploadsDir = path.join(__dirname, 'public/uploads');
  console.log('\n' + '='.repeat(60));
  console.log('Uploads Directory Info:');
  console.log('='.repeat(60));
  console.log(`Path: ${uploadsDir}`);
  console.log(`Absolute: ${path.resolve(uploadsDir)}`);
  
  try {
    const stats = fs.statSync(uploadsDir);
    console.log(`Permissions: ${stats.mode.toString(8)}`);
    
    const files = fs.readdirSync(uploadsDir);
    console.log(`Files count: ${files.length}`);
    if (files.length > 0) {
      console.log(`Recent files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    } else {
      console.log('No files in uploads directory yet');
    }
  } catch (err) {
    console.error(`Error reading directory: ${err.message}`);
  }
  console.log('='.repeat(60) + '\n');
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
    if (req.path.startsWith('/.well-known/')) {
      return res.status(204).end();
    }
    
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
  maxAge: '1d',
  etag: true
}));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '7d',
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
  name: 'smile_clinic_session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
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
  
  // Log upload-related requests
  if (url.includes('/uploads/') || url.includes('photo') || method === 'POST' && url.includes('dentist')) {
    console.log(`[${timestamp}] ${method} ${url} - ${userAgent.substring(0, 50)}`);
  }
  
  // Don't log static files
  if (!req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/)) {
    console.log(`[${timestamp}] ${method} ${url}`);
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
      console.log(`File not found: ${req.path}, serving default image`);
      
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
    const db = require('./config/db');
    await db.execute('DELETE FROM password_resets WHERE expires_at < NOW() OR used_at IS NOT NULL');
    console.log('Cleaned up expired password reset tokens');
  } catch (error) {
    console.error('Token cleanup error:', error);
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

app.use(authRoute);
require('./jobs/appointmentReminder');

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
      console.log(`Unknown role: ${roleId}, redirecting to login`);
      res.redirect('/login');
  }
});

// ===============================
// Authentication Middleware
// ===============================
const requireAuth = (requiredRole = null) => {
  return (req, res, next) => {
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
// Patient routes use their own requirePatient middleware, so no need for global requireAuth
app.use('/patient/api/notifications', patientNotificationRoutes);
app.use('/patient', patientRoutes);

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

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer Error:', err.message);
    
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

app.use((err, req, res, next) => {
  console.error('Application Error:', err);
  
  const requestPath = req.path || req.url || req.originalUrl || 'unknown';
  const method = req.method || 'UNKNOWN';
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.error(`Error on ${method} ${requestPath}:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userAgent: userAgent.substring(0, 100)
  });

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
  
  const isApiRequest = requestPath.indexOf('/api/') === 0;
  const isAjaxRequest = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
  
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
  
  if (res.headersSent) {
    console.error('Headers already sent, delegating to default Express error handler');
    return next(err);
  }
  
  try {
    res.status(statusCode).render('error', {
      title: 'Server Error',
      message: isDevelopment ? err.message : 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
      error: isDevelopment ? err : { status: statusCode }
    });
  } catch (renderError) {
    console.error('Error rendering error page:', renderError.message);
    res.status(statusCode).type('text/plain').send(
      isDevelopment 
        ? `Error: ${err.message}\n\nRender Error: ${renderError.message}` 
        : 'Internal Server Error'
    );
  }
});

// ===============================
// 404 Handler
// ===============================
app.use((req, res) => {
  const requestPath = req.path || req.url || 'unknown';
  const method = req.method || 'GET';
  
  console.log(`404 - Route not found: ${method} ${requestPath}`);
  
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
    console.error('Error rendering 404 page:', renderError.message);
    res.status(404).type('text/plain').send('404 Not Found');
  }
});

// ===============================
// Graceful Shutdown
// ===============================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ===============================
// Initialize Cleanup Jobs
// ===============================
try {
  const { scheduleTokenCleanup } = require('./jobs/cleanup-tokens');
  scheduleTokenCleanup();
  console.log('Password reset token cleanup job initialized');
} catch (error) {
  console.log('Cleanup job not available, using cron schedule instead');
}

// ===============================
// Initialize Notification Jobs
// ===============================
try {
  initializeNotificationJobs();
  console.log('✅ Notification cron jobs initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize notification jobs:', error);
}

// ===============================
// Start Server
// ===============================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('SMILE CLINIC DENTAL MANAGEMENT SYSTEM');
  console.log('='.repeat(60));
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Static files: ${path.join(__dirname, 'public')}`);
  console.log(`Uploads: ${path.join(__dirname, 'public/uploads')}`);
  console.log('='.repeat(60));
  console.log('Available Routes:');
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
  console.log('='.repeat(60));
  console.log('System ready for requests!');
  console.log('='.repeat(60));
});