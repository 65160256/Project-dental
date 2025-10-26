const db = require('../config/db');
const { formatThaiDateTime, formatDateForInput } = require('../utils/timezoneHelper');

const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

// [REFACTORED] Import model classes
const Patient = require('../models/Patient.model');
const User = require('../models/User.model');
const Treatment = require('../models/Treatment.model');
const Dentist = require('../models/Dentist.model');
const Queue = require('../models/Queue.model');
const AvailableSlots = require('../models/AvailableSlots.model');
const TreatmentHistory = require('../models/TreatmentHistory.model');
const DentistSchedule = require('../models/DentistSchedule.model');

// Show forgot password form
exports.showForgotPasswordForm = (req, res) => {
  res.render('patient/forgot-password');
};

// Handle forgot password request
exports.handleForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // [REFACTORED] ใช้ User.findPatientByEmail แทน raw SQL
    const user = await User.findPatientByEmail(email);

    if (!user) return res.send('Email not found or not a patient account.');

    const resetToken = Math.random().toString(36).substring(2);
    const resetLink = `http://localhost:3000/patient/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: 'yourclinicemail@gmail.com',
        pass: 'yourapppassword'
      }
    });

    const mailOptions = {
      from: '"Smile Clinic" <yourclinicemail@gmail.com>',
      to: email,
      subject: 'Password Reset Link',
      html: `<p>Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`
    };

    await transporter.sendMail(mailOptions);

    res.send('Reset link has been sent to your email.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// Show reset password form
exports.showResetPasswordForm = (req, res) => {
  const { email, token } = req.query;
  res.render('patient/reset-password', { email, token });
};

// Save new password
exports.resetPassword = async (req, res) => {
  const { email, password } = req.body;
  const hashed = bcrypt.hashSync(password, 10);

  try {
    // [REFACTORED] ใช้ User.resetPasswordByEmail แทน raw SQL
    await User.resetPasswordByEmail(email, hashed);
    res.send('Password has been reset. You can now login.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error resetting password');
  }
};

// Get patient dashboard with real data
exports.getDashboard = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  try {
    // [REFACTORED] ใช้ Patient.getDashboardData แทน raw SQL
    const dashboardData = await Patient.getDashboardData(userId);

    if (!dashboardData || !dashboardData.patient) {
      return res.redirect('/login');
    }

    res.render('patient/patient-dashboard', {
      patient: dashboardData.patient,
      nextAppointment: dashboardData.nextAppointment,
      appointments: dashboardData.recentAppointments,
      treatmentHistory: dashboardData.latestTreatmentHistory,
      dentists: dashboardData.todayDentists,
      currentDate: new Date().toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard data');
  }
};

// Redirect appointment routes
exports.getAppointmentsPage = async (req, res) => {
  res.redirect('/patient/appointment/schedule');
};

exports.getAppointments = async (req, res) => {
  res.redirect('/patient/appointment/schedule');
};

// New booking page using schedule system
exports.showNewBookingForm = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findByUserIdWithEmail แทน raw SQL
    const patient = await Patient.findByUserIdWithEmail(userId);

    if (!patient) return res.redirect('/login');

    // [REFACTORED] ใช้ Treatment.findAllActive แทน raw SQL
    const treatments = await Treatment.findAllActive();

    res.render('patient/appointment/book', {
      title: 'จองนัดหมาย',
      user: req.session,
      patient: patient,
      treatments
    });
  } catch (error) {
    console.error('New booking form error:', error);
    res.status(500).send('Internal Server Error');
  }
};


// API to get available dentists for booking

// ========== API: ดึงข้อมูลทันตแพทย์ที่มีช่วงเวลาว่าง ==========
exports.getAvailableDentistsForBooking = async (req, res) => {
  try {
    const { date, treatment_id } = req.query;
    console.log('🚀 [PATIENT API] getAvailableDentistsForBooking called with:', { date, treatment_id });

    if (!date) {
      console.log('❌ [PATIENT API] No date provided');
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาเลือกวันที่' 
      });
    }

    console.log('🔍 [PATIENT API] Searching dentists for date:', date, 'treatment:', treatment_id);

    // หมายเหตุ: ไม่บังคับกฎ 24 ชั่วโมง/วันอาทิตย์ที่ endpoint รายชื่อทันตแพทย์
    // เพื่อให้ผู้ใช้เห็นรายชื่อหมอที่ว่างเหมือนฝั่งแอดมิน
    // จะตรวจสอบข้อจำกัดเหล่านี้ในขั้นตอนเลือกช่วงเวลา/ยืนยันการจองแทน

    // [REFACTORED] ใช้ AvailableSlots.getAvailableDentistsForBooking แทน raw SQL
    const availableDentists = await AvailableSlots.getAvailableDentistsForBooking(date, treatment_id);

    console.log('✅ [PATIENT API] Found', availableDentists.length, 'dentists with available slots');

    res.json({
      success: true,
      dentists: availableDentists,
      date: date,
      total_available: availableDentists.length
    });

  } catch (error) {
    console.error('❌ Error in getAvailableDentistsForBooking:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error.message
    });
  }
};


// ========== API: ดึงข้อมูลช่วงเวลาว่าง ==========
exports.getAvailableTimeSlots = async (req, res) => {
  try {
    const { date, dentistId, treatmentId } = req.query;

    if (!date || !dentistId || !treatmentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    console.log('⏰ Getting time slots for:', { date, dentistId, treatmentId });

    // [REFACTORED] ใช้ Treatment.findById แทน raw SQL
    const treatment = await Treatment.findById(treatmentId);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลการรักษา'
      });
    }

    const duration = treatment.duration;

    // [REFACTORED] ใช้ AvailableSlots.getAvailableTimeSlotsForBooking แทน raw SQL
    const result = await AvailableSlots.getAvailableTimeSlotsForBooking(date, dentistId, treatmentId);
    const validSlots = result.slots || [];

    // ใช้ formatted_start_time ที่ model ได้จัดรูปแบบไว้แล้ว (HH:MM)
    const formattedSlots = validSlots.map(slot => ({
      ...slot,
      start_time: slot.formatted_start_time || slot.start_time,
      end_time: slot.end_time || '' // เพิ่ม end_time เพื่อให้ frontend แสดงช่วงเวลาชัดเจน
    }));

    console.log('✅ Valid slots:', formattedSlots.length);

    res.json({
      success: true,
      slots: formattedSlots,
      date: date,
      dentistId: dentistId,
      treatmentId: treatmentId,
      treatment_duration: duration,
      total_slots: formattedSlots.length
    });

  } catch (error) {
    console.error('❌ Error in getAvailableTimeSlots:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเวลาว่าง'
    });
  }
};



// Helper function to format time
function TIME_FORMAT(date, format) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}


// ========== API: จองนัดหมาย ==========
exports.bookAppointmentWithSchedule = async (req, res) => {
  let connection;
  const NotificationHelper = require('../utils/notificationHelper');
  try {
    const patientUserId = req.session.userId;
    const { dentist_id, treatment_id, date, start_time, note } = req.body;

    console.log('📝 Booking request:', { dentist_id, treatment_id, date, start_time, note });

    // Validate ข้อมูลพื้นฐาน
    if (!dentist_id || !treatment_id || !date || !start_time) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ครบถ้วน กรุณาระบุ dentist_id, treatment_id, date และ start_time'
      });
    }

    // [REFACTORED] ใช้ Patient.findByUserId แทน raw SQL
    const patient = await Patient.findByUserId(patientUserId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    const patientId = patient.patient_id;

    // [REFACTORED] ใช้ Treatment.findById แทน raw SQL
    const treatment = await Treatment.findById(treatment_id);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลการรักษา'
      });
    }

    const duration = treatment.duration;
    const requiredSlots = Math.ceil(duration / 30);

    console.log('📊 Treatment info:', { duration, requiredSlots });

    // ตรวจสอบว่า duration และ requiredSlots เป็นตัวเลขที่ถูกต้อง
    if (!duration || isNaN(duration) || duration <= 0) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลระยะเวลาการรักษาไม่ถูกต้อง'
      });
    }

    // ตรวจสอบกฎ 24 ชั่วโมง
    const appointmentDateTime = new Date(`${date} ${start_time}:00`);
    const now = new Date();
    const timeDiff = appointmentDateTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    if (hoursDiff < 24) {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถจองได้ ต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมง'
      });
    }

    // ตรวจสอบวันอาทิตย์
    if (appointmentDateTime.getDay() === 0) {
      return res.status(400).json({
        success: false,
        error: 'คลินิกปิดทำการวันอาทิตย์'
      });
    }

    // เริ่ม transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // เตรียม parameters และตรวจสอบความถูกต้อง
      const dentistIdInt = parseInt(dentist_id);
      const requiredSlotsInt = Math.max(1, parseInt(requiredSlots));

      // ตรวจสอบว่าค่าทั้งหมดถูกต้อง
      if (isNaN(dentistIdInt) || dentistIdInt <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'รหัสทันตแพทย์ไม่ถูกต้อง'
        });
      }

      if (!date || !start_time) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'วันที่หรือเวลาไม่ถูกต้อง'
        });
      }

      console.log('🔍 Checking slots:', { dentistIdInt, date, start_time, requiredSlotsInt });

      // [REFACTORED] ใช้ AvailableSlots.getConsecutiveSlots แทน raw SQL
      const slotsCheck = await AvailableSlots.getConsecutiveSlots(dentistIdInt, date, start_time, requiredSlotsInt);

      console.log('✅ Available slots after filtering:', slotsCheck.length, '/ Required:', requiredSlotsInt);

      if (slotsCheck.length < requiredSlotsInt) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: `ช่วงเวลานี้ไม่เพียงพอสำหรับการรักษา (ต้องการ ${requiredSlotsInt} ช่วง, มีว่าง ${slotsCheck.length} ช่วง)`
        });
      }

      // [REFACTORED] ใช้ Queue.checkExistingAppointmentOnDate แทน raw SQL
      const existingCount = await Queue.checkExistingAppointmentOnDate(connection, patientId, date);

      if (existingCount > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'คุณมีนัดหมายในวันนี้แล้ว กรุณาเลือกวันอื่น'
        });
      }

      // [REFACTORED] ใช้ Queue.createBookingWithSlots แทน raw SQL
      const bookingResult = await Queue.createBookingWithSlots(
        connection,
        {
          patientId,
          treatmentId: treatment_id,
          dentistId: dentistIdInt,
          date,
          startTime: start_time,
          note
        },
        slotsCheck
      );

      const { queueId, bookingDetails } = bookingResult;

      await connection.commit();
      await NotificationHelper.createNewAppointmentNotification(queueId, patientId, dentistIdInt);

      console.log('✅ Booking successful:', queueId);

      res.json({
        success: true,
        message: 'จองนัดหมายเรียบร้อยแล้ว',
        booking: {
          queue_id: queueId,
          appointment_time: appointmentDateTime,
          patient_name: bookingDetails?.patient_name,
          dentist_name: bookingDetails?.dentist_name,
          treatment_name: bookingDetails?.treatment_name,
          duration: bookingDetails?.duration,
          status: 'pending'
        }
      });

    } catch (error) {
      if (connection) await connection.rollback();
      console.error('❌ Transaction error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState
      });
      throw error;
    }

  } catch (error) {
    console.error('❌ Error in bookAppointmentWithSchedule:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการจองนัดหมาย: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
};
exports.getCalendarData = async (req, res) => {
  try {
    const { year, month, treatment_id } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุปีและเดือน'
      });
    }

    console.log('📅 Getting calendar data for:', { year, month, treatment_id });

    // ใช้ DentistSchedule เพื่อดึงตาราง แล้วสรุปต่อวันให้ตรงกับรูปแบบที่ frontend ต้องการ
    const raw = await DentistSchedule.getAvailableAppointmentsByMonth(parseInt(year), parseInt(month));

    const byDate = {};
    for (const row of raw) {
      // หลีกเลี่ยง timezone shift: ใช้สตริงวันที่จากฐานข้อมูลโดยตรง (YYYY-MM-DD)
      const dateStr = (row.date || '').toString().slice(0, 10);
      if (!byDate[dateStr]) {
        byDate[dateStr] = {
          date: dateStr,
          available_dentists: 0,
          available_slots: 0,
          total_slots: 0,
          dentists: [],
          _dentistSet: new Set()
        };
      }
      const d = byDate[dateStr];
      d.total_slots += 1;
      if (row.status === 'working') d.available_slots += 1;
      if (row.dentist_id && !d._dentistSet.has(row.dentist_id)) {
        d._dentistSet.add(row.dentist_id);
        // สร้าง name จาก fname และ lname เพื่อให้สอดคล้องกับ AvailableSlots model
        const dentistName = row.dentist_name || `${row.fname || ''} ${row.lname || ''}`.trim();
        d.dentists.push({ 
          dentist_id: row.dentist_id, 
          fname: row.fname || '',
          lname: row.lname || '',
          name: dentistName,
          specialty: row.specialty, 
          available_slots: row.available_slots || 0 
        });
      }
    }

    const calendarDays = Object.values(byDate)
      .map(day => ({
        date: day.date,
        available_dentists: day.dentists.length,
        available_slots: day.available_slots,
        total_slots: day.total_slots,
        dentists: day.dentists
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log('✅ Calendar data processed:', calendarDays.length, 'days with available dentists');
    
    // Debug: แสดงข้อมูลสำหรับวันที่มี dentists
    const daysWithDentists = calendarDays.filter(day => day.dentists.length > 0);
    console.log('🔍 Days with dentists:', daysWithDentists.map(day => ({
      date: day.date,
      available_dentists: day.available_dentists,
      dentists: day.dentists.map(d => ({ id: d.dentist_id, name: d.name }))
    })));
    
    // Debug: แสดงข้อมูลทั้งหมดที่จะส่งไปยัง frontend
    console.log('📤 Sending to frontend:', {
      total_days: calendarDays.length,
      days_with_dentists: daysWithDentists.length,
      sample_days: calendarDays.slice(0, 3).map(day => ({
        date: day.date,
        available_dentists: day.available_dentists,
        dentists_count: day.dentists.length
      }))
    });

    res.json({
      success: true,
      calendar_data: calendarDays,
      year: parseInt(year),
      month: parseInt(month)
    });

  } catch (error) {
    console.error('❌ Error in getCalendarData:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน',
      details: error.message
    });
  }
};

// Get patient's upcoming appointments with cancellation capability
exports.getMyUpcomingAppointments = async (req, res) => {
  try {
    const patientUserId = req.session.userId;

    // [REFACTORED] ใช้ Patient.findByUserId แทน raw SQL
    const patient = await Patient.findByUserId(patientUserId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    const patientId = patient.patient_id;

    // [REFACTORED] ใช้ Patient.getUpcomingAppointments แทน raw SQL
    const appointments = await Patient.getUpcomingAppointments(patientId);

    res.json({
      success: true,
      appointments: appointments,
      total_count: appointments.length
    });

  } catch (error) {
    console.error('Error in getMyUpcomingAppointments:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย'
    });
  }
};

// Enhanced cancelMyAppointment with 24-hour restriction
exports.cancelMyAppointment = async (req, res) => {
  const NotificationHelper = require('../utils/notificationHelper');
  try {
    const patientUserId = req.session.userId;
    const { queue_id, reason } = req.body;

    if (!queue_id) {
      return res.status(400).json({
        success: false,
        error: 'ไม่พบรหัสนัดหมาย'
      });
    }

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patientId = await Patient.findIdByUserId(patientUserId);

    if (!patientId) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    // [REFACTORED] ใช้ Queue.findByIdWithPatientAuth แทน raw SQL
    const appointment = await Queue.findByIdWithPatientAuth(queue_id, patientId);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบนัดหมาย หรือไม่มีสิทธิ์ยกเลิก'
      });
    }

    const appointmentTime = new Date(appointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    if (hoursDiff < 24) {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถยกเลิกได้ เนื่องจากใกล้เวลานัดหมายแล้ว (ต้องยกเลิกก่อน 24 ชั่วโมง)'
      });
    }

    if (appointment.queue_status !== 'pending' && appointment.queue_status !== 'confirm') {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถยกเลิกนัดหมายนี้ได้'
      });
    }

    // [REFACTORED] ใช้ Queue.updatePatientAppointmentStatus แทน raw SQL
    await Queue.updatePatientAppointmentStatus(queue_id, patientId, 'cancel');

    // แจ้งเตือน dentist และ admin เมื่อ patient ยกเลิกนัด
    await NotificationHelper.createCancellationNotification(
      queue_id,
      patientId,
      appointment.dentist_id,
      'patient',
      reason || null
    );

    console.log(`✅ Patient cancelled appointment ${queue_id} and notifications sent`);

    res.json({
      success: true,
      message: 'ยกเลิกนัดหมายเรียบร้อยแล้ว',
      cancelled_appointment: {
        dentist_name: appointment.dentist_name,
        appointment_time: appointment.time
      }
    });

  } catch (error) {
    console.error('Error in cancelMyAppointment:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการยกเลิกนัดหมาย'
    });
  }
};
// Updated month view with real schedule data
exports.appointmentMonth = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || new Date().getMonth();
    
    // Get available appointments from schedule for the month
    const appointments = await getAvailableAppointmentsByMonth(year, month);
    
    res.render('patient/appointment/month', {
      title: 'Book an appointment - Month View',
      user: req.session,
      patient: patient,
      appointments,
      year: parseInt(year),
      month: parseInt(month),
      currentDate: new Date()
    });
  } catch (error) {
    console.error('Month view error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Updated week view with real schedule data
exports.appointmentWeek = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const date = req.query.date ? new Date(req.query.date) : new Date();
    const monday = getMonday(date);
    
    // Get available appointments from schedule for the week
    const appointments = await getAvailableAppointmentsByWeek(monday);
    
    res.render('patient/appointment/week', {
      title: 'Book an appointment - Week View',
      user: req.session,
      patient: patient,
      appointments,
      startDate: monday,
      currentDate: new Date()
    });
  } catch (error) {
    console.error('Week view error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Updated day view with real schedule data
exports.appointmentDay = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const date = req.query.date ? new Date(req.query.date) : new Date();
    
    // Get available appointments from schedule for the day
    const appointments = await getAvailableAppointmentsByDay(date);
    
    res.render('patient/appointment/day', {
      title: 'Book an appointment - Day View',
      user: req.session,
      patient: patient,
      appointments,
      selectedDate: date,
      currentDate: new Date()
    });
  } catch (error) {
    console.error('Day view error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Updated booking form
exports.showBookingForm = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findByUserIdWithEmail แทน raw SQL
    const patient = await Patient.findByUserIdWithEmail(userId);
    if (!patient) return res.redirect('/login');

    const { date, time, dentist_id, treatment_id } = req.query;

    // [REFACTORED] ใช้ Treatment.findAllActive แทน raw SQL
    const treatments = await Treatment.findAllActive();

    // [REFACTORED] ใช้ Dentist.findAllWithSchedules แทน raw SQL
    const dentists = await Dentist.findAllWithSchedules();

    res.render('patient/appointment/book', {
      title: 'Book an appointment',
      user: req.session,
      patient: patient,
      treatments,
      dentists,
      selectedDate: date || '',
      selectedTime: time || '',
      selectedDentist: dentist_id || '',
      selectedTreatment: treatment_id || ''
    });
  } catch (error) {
    console.error('Booking form error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Updated book appointment function
exports.bookAppointment = async (req, res) => {
  try {
    const { date, time, dentist_id, treatment_id, symptom_details, phone } = req.body;
    const userId = req.session.userId;

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patient_id = await Patient.findIdByUserId(userId);
    if (!patient_id) return res.redirect('/patient/appointment/book?error=1');

    // [REFACTORED] ใช้ DentistSchedule.validateScheduleAvailability แทน raw SQL
    const hour = parseInt(time.split(':')[0]);
    const isAvailable = await DentistSchedule.validateScheduleAvailability(dentist_id, date, hour);

    if (!isAvailable) {
      return res.redirect('/patient/appointment/book?error=time_unavailable');
    }

    // [REFACTORED] ใช้ Queue.createLegacyBooking แทน raw SQL
    await Queue.createLegacyBooking({
      patientId: patient_id,
      treatmentId: treatment_id,
      dentistId: dentist_id,
      date,
      time,
      diagnosis: symptom_details
    });

    res.redirect('/patient/appointment/month?success=1');
  } catch (error) {
    console.error('Create booking error:', error);
    res.redirect('/patient/appointment/book?error=1');
  }
};

// Helper functions using real schedule data
// [REFACTORED] ใช้ DentistSchedule model methods
async function getAvailableAppointmentsByMonth(year, month) {
  return await DentistSchedule.getAvailableAppointmentsByMonth(year, month);
}

async function getAvailableAppointmentsByWeek(startDate) {
  return await DentistSchedule.getAvailableAppointmentsByWeek(startDate);
}

async function getAvailableAppointmentsByDay(date) {
  return await DentistSchedule.getAvailableAppointmentsByDay(date);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Additional functions for patient management (keeping existing functionality)
exports.getHistory = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const patient_id = patient.patient_id;

    // [REFACTORED] ใช้ Queue.getPatientHistoryWithDetails แทน raw SQL
    const appointments = await Queue.getPatientHistoryWithDetails(patient_id);

    res.render('patient/history/list', {
      title: 'Appointment History',
      user: req.session,
      patient: patient,
      appointments
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.getAppointmentDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;

    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const patient_id = patient.patient_id;

    // [REFACTORED] ใช้ Queue.getPatientAppointmentDetail แทน raw SQL
    const appointment = await Queue.getPatientAppointmentDetail(appointmentId, patient_id);

    if (!appointment) {
      return res.status(404).send('Appointment not found');
    }

    res.render('patient/history/details', {
      title: 'Appointment Details',
      user: req.session,
      patient: patient,
      appointment
    });
  } catch (error) {
    console.error('Appointment details error:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.showEditAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;

    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findByUserIdWithEmail แทน raw SQL
    const patient = await Patient.findByUserIdWithEmail(userId);
    if (!patient) return res.redirect('/login');
    const patient_id = patient.patient_id;

    // [REFACTORED] ใช้ Queue.getPatientAppointmentDetail แทน raw SQL
    const appointment = await Queue.getPatientAppointmentDetail(appointmentId, patient_id);

    if (!appointment) {
      return res.status(404).send('Appointment not found');
    }

    // Check if appointment can be edited (24 hours before)
    const appointmentTime = new Date(appointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    const canEdit = hoursDiff > 24;

    // [REFACTORED] ใช้ Treatment.findAllActive แทน raw SQL
    const treatments = await Treatment.findAllActive();

    // [REFACTORED] ใช้ Dentist.findAll แทน raw SQL
    const dentists = await Dentist.findAll();

    res.render('patient/history/edit', {
      title: 'Edit Appointment History',
      user: req.session,
      patient: patient,
      appointment,
      treatments,
      dentists,
      canEdit,
      hoursDiff: Math.floor(hoursDiff)
    });
  } catch (error) {
    console.error('Edit appointment error:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    const { date, time } = req.body;

    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patient_id = await Patient.findIdByUserId(userId);
    if (!patient_id) return res.redirect('/login');

    // [REFACTORED] ใช้ Queue.findById แทน raw SQL
    const currentAppointment = await Queue.findById(appointmentId);

    if (!currentAppointment || currentAppointment.patient_id !== patient_id) {
      return res.status(404).send('Appointment not found');
    }

    // Check if appointment can be edited (24 hours before)
    const appointmentTime = new Date(currentAppointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    if (hoursDiff <= 24) {
      return res.redirect(`/patient/history/edit/${appointmentId}?error=time_limit`);
    }

    // [REFACTORED] ใช้ DentistSchedule.validateScheduleAvailability แทน raw SQL
    const hour = parseInt(time.split(':')[0]);
    const isAvailable = await DentistSchedule.validateScheduleAvailability(
      currentAppointment.dentist_id,
      date,
      hour,
      appointmentId
    );

    if (!isAvailable) {
      return res.redirect(`/patient/history/edit/${appointmentId}?error=time_unavailable`);
    }

    // [REFACTORED] ใช้ Queue.updateAppointmentTime แทน raw SQL
    await Queue.updateAppointmentTime(appointmentId, patient_id, date, time);

    res.redirect(`/patient/history/details/${appointmentId}?success=updated`);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.redirect(`/patient/history/edit/${appointmentId}?error=update_failed`);
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;

    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patient_id = await Patient.findIdByUserId(userId);
    if (!patient_id) return res.redirect('/login');

    // [REFACTORED] ใช้ Queue.findById แทน raw SQL
    const currentAppointment = await Queue.findById(appointmentId);

    if (!currentAppointment || currentAppointment.patient_id !== patient_id) {
      return res.status(404).send('Appointment not found');
    }

    // Check if appointment can be cancelled (24 hours before)
    const appointmentTime = new Date(currentAppointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    if (hoursDiff <= 24) {
      return res.redirect(`/patient/history/details/${appointmentId}?error=cancel_time_limit`);
    }

    // [REFACTORED] ใช้ Queue.cancelPatientAppointment แทน raw SQL
    await Queue.cancelPatientAppointment(appointmentId, patient_id);

    res.redirect('/patient/history?success=cancelled');
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.redirect(`/patient/history/details/${appointmentId}?error=cancel_failed`);
  }
};


// API to get patient appointments
exports.getMyAppointments = async (req, res) => {
  try {
    const patientUserId = req.session.userId;

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patientId = await Patient.findIdByUserId(patientUserId);

    if (!patientId) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    // [REFACTORED] ใช้ Patient.getAppointmentsWithDetails แทน raw SQL
    const appointments = await Patient.getAppointmentsWithDetails(patientId);

    res.json({
      success: true,
      appointments: appointments
    });

  } catch (error) {
    console.error('Error in getMyAppointments:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย'
    });
  }
};

// Get patient treatments history
exports.getMyTreatments = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');
    const patient_id = patient.patient_id;

    const searchYear = req.query.year || new Date().getFullYear();

    // [REFACTORED] ใช้ Queue.getPatientTreatmentsByYear แทน raw SQL
    const treatments = await Queue.getPatientTreatmentsByYear(patient_id);

    // Group treatments by year
    const treatmentsByYear = {};
    treatments.forEach(treatment => {
      const year = treatment.treatment_year;
      if (!treatmentsByYear[year]) {
        treatmentsByYear[year] = [];
      }
      treatmentsByYear[year].push(treatment);
    });

    const availableYears = Object.keys(treatmentsByYear).sort((a, b) => b - a);

    res.render('patient/treatments/list', {
      title: 'Treatment History',
      user: req.session,
      patient: patient,
      treatmentsByYear,
      availableYears,
      selectedYear: parseInt(searchYear),
      treatments: treatmentsByYear[searchYear] || []
    });
  } catch (error) {
    console.error('My treatments error:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.getTreatmentDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    const treatmentId = req.params.id;

    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    res.render('patient/treatments/details', {
      title: 'Treatment History Details',
      user: req.session,
      patient: patient,
      queueId: treatmentId
    });
  } catch (error) {
    console.error('Treatment details error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Get dentists list
exports.getDentists = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const searchQuery = req.query.search || '';

    // [REFACTORED] ใช้ Dentist.findAllForPatients แทน raw SQL
    const dentists = await Dentist.findAllForPatients(searchQuery);
    
    // Debug: Log dentist data to check if email field exists
    console.log('Dentists data sample:', dentists.slice(0, 2).map(d => ({ 
      id: d.dentist_id, 
      name: d.full_name, 
      email: d.email,
      hasEmail: !!d.email 
    })));

    // Get treatments for each dentist
    for (let dentist of dentists) {
      // [REFACTORED] ใช้ Dentist.getTreatments แทน raw SQL
      const treatments = await Dentist.getTreatments(dentist.dentist_id);
      dentist.treatments = treatments;
    }

    // Group dentists by specialty
    const dentistsBySpecialty = {};
    dentists.forEach(dentist => {
      const specialty = dentist.specialty || 'General Dentistry';
      if (!dentistsBySpecialty[specialty]) {
        dentistsBySpecialty[specialty] = [];
      }
      dentistsBySpecialty[specialty].push(dentist);
    });

    const specialties = Object.keys(dentistsBySpecialty).sort();

    res.render('patient/dentists/list', {
      title: 'Our Dental Specialists',
      user: req.session,
      patient: patient,
      dentistsBySpecialty,
      specialties,
      searchQuery,
      totalDentists: dentists.length
    });
  } catch (error) {
    console.error('Dentists error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Make appointment with specific dentist
exports.makeAppointmentWithDentist = async (req, res) => {
  try {
    const dentistId = req.params.dentistId;
    
    // Redirect to new booking form with pre-selected dentist
    res.redirect(`/patient/appointment/new?dentist_id=${dentistId}`);
  } catch (error) {
    console.error('Make appointment error:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.getDentistProfile = async (req, res) => {
  try {
    const { dentistId } = req.params;

    if (!dentistId) {
      return res.status(400).json({
        success: false,
        error: 'ไม่พบรหัสหมอฟัน'
      });
    }

    // [REFACTORED] ใช้ Dentist.getProfileWithStats แทน raw SQL
    const dentist = await Dentist.getProfileWithStats(dentistId);

    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลหมอฟัน'
      });
    }

    // [REFACTORED] ใช้ Dentist.getTreatments แทน raw SQL
    dentist.treatments = await Dentist.getTreatments(dentistId);

    // [REFACTORED] ใช้ Dentist.getUpcomingAvailableSlots แทน raw SQL
    dentist.upcoming_slots = await Dentist.getUpcomingAvailableSlots(dentistId);

    res.json({
      success: true,
      dentist: dentist
    });

  } catch (error) {
    console.error('Error in getDentistProfile:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลหมอฟัน'
    });
  }
};

// API to get dentist availability for quick booking
exports.getDentistAvailability = async (req, res) => {
  try {
    const { dentistId } = req.params;
    const { date } = req.query;

    if (!dentistId) {
      return res.status(400).json({
        success: false,
        error: 'ไม่พบรหัสหมอฟัน'
      });
    }

    // If no date specified, get next 3 days
    let startDate, endDate;
    if (date) {
      startDate = endDate = date;
    } else {
      startDate = new Date().toISOString().split('T')[0];
      const end = new Date();
      end.setDate(end.getDate() + 3);
      endDate = end.toISOString().split('T')[0];
    }

    // [REFACTORED] ใช้ Dentist.getAvailability แทน raw SQL
    const availability = await Dentist.getAvailability(dentistId, startDate, endDate);

    res.json({
      success: true,
      availability: availability,
      dentistId: dentistId,
      dateRange: { start: startDate, end: endDate }
    });

  } catch (error) {
    console.error('Error in getDentistAvailability:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางเวลา'
    });
  }
};

// Enhanced getDentists function with real-time availability
exports.getDentistsEnhanced = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    const searchQuery = req.query.search || '';

    // [REFACTORED] ใช้ Dentist.findAllWithAvailability แทน raw SQL
    const dentists = await Dentist.findAllWithAvailability(searchQuery);

    // Get treatments for each dentist
    for (let dentist of dentists) {
      // [REFACTORED] ใช้ Dentist.getTreatments แทน raw SQL
      dentist.treatments = await Dentist.getTreatments(dentist.dentist_id);
    }

    // Group dentists by specialty
    const dentistsBySpecialty = {};
    dentists.forEach(dentist => {
      const specialty = dentist.specialty || 'General Dentistry';
      if (!dentistsBySpecialty[specialty]) {
        dentistsBySpecialty[specialty] = [];
      }
      dentistsBySpecialty[specialty].push(dentist);
    });

    const specialties = Object.keys(dentistsBySpecialty).sort();

    res.render('patient/dentists/list', {
      title: 'Our Dental Specialists',
      user: req.session,
      patient: patient,
      dentistsBySpecialty,
      specialties,
      searchQuery,
      totalDentists: dentists.length
    });
  } catch (error) {
    console.error('Enhanced dentists error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Get patient profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.getProfileData แทน raw SQL
    const profileData = await Patient.getProfileData(userId);

    if (!profileData) return res.redirect('/login');

    res.render('patient/profile', {
      title: 'My Profile',
      user: req.session,
      patient: profileData
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Show edit profile form
// Show edit profile form
exports.showEditProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForEditProfile แทน raw SQL
    const patient = await Patient.findForEditProfile(userId);

    if (!patient) return res.redirect('/login');

    // Format the data for form
    const profileData = {
      ...patient,
      dob_formatted: formatDateForInput(patient.dob),
      last_login_formatted: formatThaiDateTime(patient.last_login, { includeTime: true }),
      full_name: `${patient.fname} ${patient.lname}`
    };

    // ส่ง query parameter ไปด้วยสำหรับแสดง error/success messages
    res.render('patient/edit-profile', {
      title: 'Edit My Profile',
      user: req.session,
      patient: profileData,
      query: req.query // เพิ่มส่วนนี้
    });
  } catch (error) {
    console.error('Edit profile error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const {
      fname, lname, dob, id_card, address, phone, email,
      gender, chronic_disease, allergy_history
    } = req.body;

    // Validate required fields
    if (!fname || !lname || !email) {
      return res.redirect('/patient/profile/edit?error=missing_required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.redirect('/patient/profile/edit?error=invalid_email');
    }

    // Validate ID Card format (13 digits) if provided
    if (id_card && !/^\d{13}$/.test(id_card)) {
      return res.redirect('/patient/profile/edit?error=invalid_id_card');
    }

    // Validate phone format (10 digits) if provided
    if (phone && !/^\d{10}$/.test(phone)) {
      return res.redirect('/patient/profile/edit?error=invalid_phone');
    }

    // [REFACTORED] ใช้ Patient.updateProfileWithEmail แทน raw SQL และ transaction
    await Patient.updateProfileWithEmail(userId, {
      fname, lname, dob, id_card, address, phone, email,
      gender, chronic_disease, allergy_history
    });

    res.redirect('/patient/profile?success=updated');

  } catch (error) {
    console.error('Update profile error:', error);
    // Check for specific error messages from Model
    if (error.message.includes('อีเมล')) {
      return res.redirect('/patient/profile/edit?error=email_exists');
    }
    if (error.message.includes('บัตรประชาชน')) {
      return res.redirect('/patient/profile/edit?error=id_card_exists');
    }
    res.redirect('/patient/profile/edit?error=update_failed');
  }
};


// Show change password form
exports.showChangePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForChangePassword แทน raw SQL
    const patient = await Patient.findForChangePassword(userId);

    if (!patient) return res.redirect('/login');

    // Format the data for display
    const profileData = {
      ...patient,
      last_login_formatted: formatThaiDateTime(patient.last_login, { includeTime: true }),
      full_name: `${patient.fname} ${patient.lname}`
    };

    res.render('patient/change-password', {
      title: 'Change Password',
      user: req.session,
      patient: profileData
    });
  } catch (error) {
    console.error('Change password form error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Handle password change
exports.changePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const {
      currentPassword,
      newPassword,
      confirmPassword
    } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect('/patient/profile/change-password?error=missing_fields');
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.redirect('/patient/profile/change-password?error=password_mismatch');
    }

    // Check password strength (minimum 8 characters)
    if (newPassword.length < 8) {
      return res.redirect('/patient/profile/change-password?error=password_weak');
    }

    // [REFACTORED] ใช้ User.getPassword แทน raw SQL
    const currentHashedPassword = await User.getPassword(userId);

    if (!currentHashedPassword) return res.redirect('/login');

    // Verify current password
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, currentHashedPassword);
    if (!isCurrentPasswordValid) {
      return res.redirect('/patient/profile/change-password?error=current_password_wrong');
    }

    // Check if new password is different from current
    const isSamePassword = bcrypt.compareSync(newPassword, currentHashedPassword);
    if (isSamePassword) {
      return res.redirect('/patient/profile/change-password?error=same_password');
    }

    // [REFACTORED] ใช้ User.changePassword แทน raw SQL
    await User.changePassword(userId, currentPassword, newPassword);

    res.redirect('/patient/profile?success=password_changed');

  } catch (error) {
    console.error('Change password error:', error);
    if (error.message.includes('รหัสผ่านปัจจุบันไม่ถูกต้อง')) {
      return res.redirect('/patient/profile/change-password?error=current_password_wrong');
    }
    res.redirect('/patient/profile/change-password?error=update_failed');
  }
};

exports.getTreatmentsAPI = async (req, res) => {
  try {
    // [REFACTORED] ใช้ Treatment.findAllActive แทน raw SQL
    const treatments = await Treatment.findAllActive();

    res.json({
      success: true,
      treatments: treatments
    });

  } catch (error) {
    console.error('Error fetching treatments:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถโหลดข้อมูลการรักษาได้'
    });
  }
};

// เพิ่มฟังก์ชันนี้
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.session.userId;

    // [REFACTORED] ใช้ Patient.getBasicProfile แทน raw SQL
    const patient = await Patient.getBasicProfile(userId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    res.json({
      success: true,
      patient: patient
    });

  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
};


exports.getDentistTreatments = async (req, res) => {
  try {
    const { dentistId } = req.params;

    // [REFACTORED] ใช้ Dentist.getTreatments แทน raw SQL
    const treatments = await Dentist.getTreatments(dentistId);

    res.json({
      success: true,
      treatments: treatments
    });

  } catch (error) {
    console.error('Error getting dentist treatments:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
};

exports.getTreatmentHistoryDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // [REFACTORED] ใช้ Patient.findIdByUserId แทน raw SQL
    const patientId = await Patient.findIdByUserId(userId);

    if (!patientId) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    // [REFACTORED] ใช้ Queue.getPatientTreatmentHistoryDetail แทน raw SQL
    const treatment = await Queue.getPatientTreatmentHistoryDetail(id, patientId);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        error: 'Treatment history not found'
      });
    }

    res.json({
      success: true,
      treatment: treatment
    });

  } catch (error) {
    console.error('Error fetching treatment history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch treatment history'
    });
  }
};

// แสดงหน้าการแจ้งเตือนทั้งหมด
exports.getNotificationsPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // [REFACTORED] ใช้ Patient.findForHistoryPage แทน raw SQL
    const patient = await Patient.findForHistoryPage(userId);
    if (!patient) return res.redirect('/login');

    res.render('patient/notifications', {
      title: 'การแจ้งเตือนทั้งหมด',
      user: req.session,
      patient: patient
    });
  } catch (error) {
    console.error('Notifications page error:', error);
    res.status(500).send('Internal Server Error');
  }
};