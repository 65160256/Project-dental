const db = require('../config/db');

// Enhanced patient authentication middleware
const requirePatient = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      return res.redirect('/login');
    }

    // Verify user is actually a patient (role_id = 3)
    const [userRows] = await db.execute(`
      SELECT u.user_id, u.role_id, p.patient_id, p.fname, p.lname
      FROM user u
      LEFT JOIN patient p ON u.user_id = p.user_id
      WHERE u.user_id = ? AND u.role_id = 3
    `, [req.session.userId]);

    if (userRows.length === 0) {
      req.session.destroy();
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, error: 'Patient access required' });
      }
      return res.redirect('/login');
    }

    req.patient = userRows[0];
    next();
  } catch (error) {
    console.error('Patient middleware error:', error);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ success: false, error: 'Authentication error' });
    }
    return res.redirect('/login');
  }
};

// Middleware to check 24-hour booking restriction
const check24HourRule = (req, res, next) => {
  const { date } = req.body || req.query;
  if (date) {
    const appointmentDate = new Date(date);
    const now = new Date();
    const hoursDiff = (appointmentDate.getTime() - now.getTime()) / (1000 * 3600);
    if (hoursDiff < 24) {
      if (req.path.startsWith('/api/')) {
        return res.status(400).json({
          success: false,
          error: 'Appointments must be booked at least 24 hours in advance',
          hours_remaining: Math.ceil(24 - hoursDiff)
        });
      }
      req.flash('error', 'Appointments must be booked at least 24 hours in advance');
      return res.redirect('/patient/appointment/schedule');
    }
  }
  next();
};

// Middleware to check clinic operating hours (closed on Sunday)
const checkClinicHours = (req, res, next) => {
  const { date } = req.body || req.query;
  if (date) {
    const appointmentDate = new Date(date);
    if (appointmentDate.getDay() === 0) {
      if (req.path.startsWith('/api/')) {
        return res.status(400).json({ success: false, error: 'Clinic is closed on Sundays' });
      }
      req.flash('error', 'Clinic is closed on Sundays');
      return res.redirect('/patient/appointment/schedule');
    }
  }
  next();
};

// Simple rate limiter for booking attempts
const bookingRateLimit = {};
const rateLimitBooking = (req, res, next) => {
  const userId = req.session.userId;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxAttempts = 3;

  if (!bookingRateLimit[userId]) {
    bookingRateLimit[userId] = { attempts: 0, resetTime: now + windowMs };
  }
  const userLimit = bookingRateLimit[userId];

  if (now > userLimit.resetTime) {
    userLimit.attempts = 0;
    userLimit.resetTime = now + windowMs;
  }

  if (userLimit.attempts >= maxAttempts) {
    if (req.path.startsWith('/api/')) {
      return res.status(429).json({
        success: false,
        error: 'Too many booking attempts. Please try again in 5 minutes.',
        retry_after: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }
    req.flash('error', 'Too many booking attempts. Please try again in 5 minutes.');
    return res.redirect('/patient/appointment/schedule');
  }

  userLimit.attempts++;
  next();
};

module.exports = {
  requirePatient,
  check24HourRule,
  checkClinicHours,
  rateLimitBooking
};
