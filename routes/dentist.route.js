const express = require('express');
const router = express.Router();
const dentistController = require('../controller/dentist.controller');

// Middleware เช็คว่า user เป็น dentist หรือไม่
function isDentist(req, res, next) {
  if (req.session.role_id === 2) {
    return next();
  } else {
    res.redirect('/login');
  }
}

// Route สำหรับ dashboard ของ dentist
router.get('/dashboard', isDentist, dentistController.getDashboard);

// Route สำหรับ schedule ของ dentist
router.get('/schedule', isDentist, dentistController.getSchedule);

module.exports = router;
