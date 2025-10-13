const db = require('../config/db');

const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

// Show forgot password form
exports.showForgotPasswordForm = (req, res) => {
  res.render('patient/forgot-password');
};

// Handle forgot password request
exports.handleForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM user u JOIN patient p ON u.user_id = p.user_id WHERE u.email = ? AND u.role_id = 3',
      [email]
    );

    if (rows.length === 0) return res.send('Email not found or not a patient account.');

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
    await db.execute('UPDATE user SET password = ? WHERE email = ? AND role_id = 3', [hashed, email]);
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
    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    const patient = patientRows[0];
    if (!patient) return res.redirect('/login');

    // Get next appointment
    const [nextAppointmentRows] = await db.execute(
      `SELECT q.queue_id, q.time, t.treatment_name AS treatment, 
              CONCAT(d.fname, ' ', d.lname) AS dentist, q.queue_status
       FROM queue q
       JOIN treatment t ON q.treatment_id = t.treatment_id
       JOIN dentist d ON q.dentist_id = d.dentist_id
       WHERE q.patient_id = ? AND q.time > NOW() AND q.queue_status IN ('pending', 'confirm')
       ORDER BY q.time ASC LIMIT 1`,
      [patient.patient_id]
    );
    const nextAppointment = nextAppointmentRows[0];

    // Get appointments history
    const [appointmentsRows] = await db.execute(
      `SELECT q.time, CONCAT(p.fname, ' ', p.lname) AS name, 
              t.treatment_name AS treatment, CONCAT(d.fname, ' ', d.lname) AS dentist, 
              q.queue_status
       FROM queue q
       JOIN patient p ON q.patient_id = p.patient_id
       JOIN treatment t ON q.treatment_id = t.treatment_id
       JOIN dentist d ON q.dentist_id = d.dentist_id
       WHERE q.patient_id = ? ORDER BY q.time DESC LIMIT 5`,
      [patient.patient_id]
    );

    // Get treatment history (แก้ไขส่วนนี้)
    const [treatmentHistoryRows] = await db.execute(
      `SELECT th.diagnosis, th.followUpdate, t.treatment_name AS treatment, 
              CONCAT(d.fname, ' ', d.lname) AS dentist
       FROM treatmentHistory th
       JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       WHERE qd.patient_id = ?
       ORDER BY th.tmh_id DESC LIMIT 1`,
      [patient.patient_id]
    );
    const treatmentHistory = treatmentHistoryRows[0] || null;

    // Get today's working dentists
    const [dentistsRows] = await db.execute(
      `SELECT DISTINCT 
          CONCAT(d.fname, ' ', d.lname) AS name, 
          d.photo,
          d.specialty
       FROM dentist d
       JOIN available_slots s ON d.dentist_id = s.dentist_id
       WHERE s.date = CURDATE()
       AND s.is_available = 1`
    );

    res.render('patient/patient-dashboard', {
      patient,
      nextAppointment,
      appointments: appointmentsRows,
      treatmentHistory,  // ส่งไปแม้จะเป็น null
      dentists: dentistsRows,
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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    const [treatments] = await db.execute('SELECT * FROM treatment ORDER BY treatment_name');
    
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

    if (!date) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาเลือกวันที่' 
      });
    }

    console.log('🔍 Searching dentists for date:', date, 'treatment:', treatment_id);

    // ตรวจสอบกฎ 24 ชั่วโมง
    const appointmentDate = new Date(date);
    const now = new Date();
    const timeDiff = appointmentDate.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);

    if (hoursDiff < 24) {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถจองได้ ต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมง'
      });
    }

    // ตรวจสอบวันอาทิตย์
    if (appointmentDate.getDay() === 0) {
      return res.status(400).json({
        success: false,
        error: 'คลินิกปิดทำการวันอาทิตย์'
      });
    }

    // Query หาทันตแพทย์ที่มี available slots
    let query = `
      SELECT 
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.phone,
        d.education,
        CASE 
          WHEN d.photo IS NULL OR d.photo = '' OR d.photo = 'default-avatar.png' 
          THEN 'default-doctor.png'
          ELSE d.photo 
        END as photo,
        COUNT(DISTINCT s.slot_id) as total_slots,
        COUNT(DISTINCT CASE 
          WHEN s.is_available = 1 
          AND NOT EXISTS (
            SELECT 1 FROM queue q 
            WHERE q.dentist_id = s.dentist_id 
            AND DATE(q.time) = s.date 
            AND TIME(q.time) = s.start_time 
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN s.slot_id 
        END) as available_slots
      FROM dentist d
      INNER JOIN available_slots s ON d.dentist_id = s.dentist_id
      WHERE s.date = ?
      AND d.user_id IS NOT NULL
    `;

    let queryParams = [date];

    // กรองตามการรักษา (ถ้ามี)
    if (treatment_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM dentist_treatment dt 
        WHERE dt.dentist_id = d.dentist_id 
        AND dt.treatment_id = ?
      )`;
      queryParams.push(treatment_id);
    }

    query += `
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.education, d.photo
      HAVING available_slots > 0
      ORDER BY d.fname, d.lname
    `;

    const [availableDentists] = await db.execute(query, queryParams);
    
    console.log('✅ Found', availableDentists.length, 'dentists with available slots');

    // ดึงข้อมูลการรักษาของแต่ละทันตแพทย์
    for (let dentist of availableDentists) {
      const [treatments] = await db.execute(`
        SELECT t.treatment_id, t.treatment_name, t.duration
        FROM dentist_treatment dt
        JOIN treatment t ON dt.treatment_id = t.treatment_id
        WHERE dt.dentist_id = ?
        ORDER BY t.treatment_name
      `, [dentist.dentist_id]);
      
      dentist.treatments = treatments;
    }

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

    // ดึง duration ของการรักษา
    const [treatmentData] = await db.execute(
      'SELECT duration FROM treatment WHERE treatment_id = ?',
      [treatmentId]
    );

    if (treatmentData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลการรักษา'
      });
    }

    const duration = treatmentData[0].duration;
    const requiredSlots = Math.ceil(duration / 30);

    // ดึง available slots ทั้งหมด
    const [slots] = await db.execute(`
      SELECT 
        s.slot_id,
        s.start_time,
        s.end_time,
        TIME_FORMAT(s.start_time, '%H:%i') as formatted_start_time,
        TIME_FORMAT(s.end_time, '%H:%i') as formatted_end_time
      FROM available_slots s
      WHERE s.dentist_id = ?
      AND s.date = ?
      AND s.is_available = 1
      AND NOT EXISTS (
        SELECT 1 FROM queue q
        WHERE q.dentist_id = s.dentist_id 
        AND DATE(q.time) = s.date 
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      )
      ORDER BY s.start_time
    `, [dentistId, date]);

    console.log('Found', slots.length, 'available slots');

    // กรอง slots ที่เพียงพอและต่อเนื่อง
    const now = new Date();
    const validSlots = [];
    
    for (let i = 0; i < slots.length; i++) {
      let hasEnoughTime = true;
      let consecutiveSlots = 1;
      
      // ตรวจสอบ slots ต่อเนื่อง
      for (let j = 1; j < requiredSlots && (i + j) < slots.length; j++) {
        const currentSlot = slots[i + j - 1];
        const nextSlot = slots[i + j];
        
        if (currentSlot.end_time === nextSlot.start_time) {
          consecutiveSlots++;
        } else {
          hasEnoughTime = false;
          break;
        }
      }
      
      if (hasEnoughTime && consecutiveSlots >= requiredSlots) {
        const startDateTime = new Date(`${date} ${slots[i].formatted_start_time}:00`);
        
        // ตรวจสอบกฎ 24 ชั่วโมง
        const slotTimeDiff = startDateTime.getTime() - now.getTime();
        const slotHoursDiff = slotTimeDiff / (1000 * 3600);
        
        if (slotHoursDiff >= 24) {
          const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
          const endHours = String(endDateTime.getHours()).padStart(2, '0');
          const endMinutes = String(endDateTime.getMinutes()).padStart(2, '0');
          
          validSlots.push({
            start_time: slots[i].formatted_start_time,
            end_time: `${endHours}:${endMinutes}`,
            display: `${slots[i].formatted_start_time} - ${endHours}:${endMinutes}`,
            duration: duration,
            slots_needed: requiredSlots
          });
        }
      }
    }

    console.log('✅ Valid slots:', validSlots.length);

    res.json({
      success: true,
      slots: validSlots,
      date: date,
      dentistId: dentistId,
      treatmentId: treatmentId,
      treatment_duration: duration,
      total_slots: validSlots.length
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

    // ดึงข้อมูลผู้ป่วย
    const [patientResult] = await db.execute(`
      SELECT patient_id, fname, lname FROM patient WHERE user_id = ?
    `, [patientUserId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลผู้ป่วย' 
      });
    }

    const patientId = patientResult[0].patient_id;

    // ดึง duration ของการรักษา
    const [treatmentData] = await db.execute(
      'SELECT duration FROM treatment WHERE treatment_id = ?',
      [treatment_id]
    );

    if (treatmentData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลการรักษา'
      });
    }

    const duration = treatmentData[0].duration;
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

      const slotsParams = [
        dentistIdInt,
        date,
        start_time,
        requiredSlotsInt
      ];

      console.log('🔍 Checking slots with params:', slotsParams);
      console.log('🔍 Types:', slotsParams.map(p => `${typeof p} (${p})`));

      
// ✅ Step 1: ดึง available slots ทั้งหมดก่อน (ไม่ใช้ function ใน query)
const [allSlots] = await connection.execute(`
  SELECT s.slot_id, s.start_time, s.end_time
  FROM available_slots s
  WHERE s.dentist_id = ?
  AND s.date = ?
  AND s.start_time >= ?
  AND s.is_available = 1
  ORDER BY s.start_time
`, [dentistIdInt, date, start_time]);

console.log('📊 Found potential slots:', allSlots.length);

// ✅ Step 2: ตรวจสอบว่า slot ไหนมี booking แล้วบ้าง
const slotsCheck = [];
for (const slot of allSlots) {
  if (slotsCheck.length >= requiredSlotsInt) break; // พอแล้ว
  
  const slotDateTime = `${date} ${slot.start_time}`;
  
  const [existingBooking] = await connection.execute(`
    SELECT queue_id
    FROM queue
    WHERE dentist_id = ?
    AND time = ?
    AND queue_status IN ('pending', 'confirm')
  `, [dentistIdInt, slotDateTime]);
  
  if (existingBooking.length === 0) {
    slotsCheck.push(slot);
  }
}

console.log('✅ Available slots after filtering:', slotsCheck.length, '/ Required:', requiredSlotsInt);

if (slotsCheck.length < requiredSlotsInt) {
  await connection.rollback();
  return res.status(400).json({ 
    success: false, 
    error: `ช่วงเวลานี้ไม่เพียงพอสำหรับการรักษา (ต้องการ ${requiredSlotsInt} ช่วง, มีว่าง ${slotsCheck.length} ช่วง)` 
  });
}

// ตรวจสอบว่า slots ต่อเนื่องกัน
for (let i = 0; i < slotsCheck.length - 1; i++) {
  if (slotsCheck[i].end_time !== slotsCheck[i + 1].start_time) {
    await connection.rollback();
    return res.status(400).json({
      success: false,
      error: 'ช่วงเวลาที่เลือกไม่ต่อเนื่องกัน'
    });
  }
}

// ... ส่วนที่เหลือเหมือนเดิม

      // ตรวจสอบว่าไม่มีนัดหมายในวันเดียวกัน
      const [existingAppointments] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM queue q
        WHERE q.patient_id = ?
        AND DATE(q.time) = ?
        AND q.queue_status IN ('pending', 'confirm')
      `, [patientId, date]);

      if (existingAppointments[0].count > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: 'คุณมีนัดหมายในวันนี้แล้ว กรุณาเลือกวันอื่น'
        });
      }

      // สร้าง queuedetail
      const [queueDetailResult] = await connection.execute(`
        INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [patientId, treatment_id, dentistIdInt, date]);

      const queueDetailId = queueDetailResult.insertId;

      // สร้าง queue
      const [queueResult] = await connection.execute(`
        INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status, diagnosis)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `, [queueDetailId, patientId, treatment_id, dentistIdInt, appointmentDateTime, note || null]);

      const queueId = queueResult.insertId;

      // อัพเดท slots เป็น not available
      for (const slot of slotsCheck) {
        await connection.execute(`
          UPDATE available_slots
          SET treatment_id = ?, is_available = 0
          WHERE slot_id = ?
        `, [treatment_id, slot.slot_id]);
      }

      // ดึงรายละเอียดการจอง
      const [bookingDetails] = await connection.execute(`
        SELECT 
          q.queue_id,
          q.time,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.queue_id = ?
      `, [queueId]);

      await connection.commit();
      await NotificationHelper.createNewAppointmentNotification(queueId, patientId, dentistIdInt);


      console.log('✅ Booking successful:', queueId);

      res.json({
        success: true,
        message: 'จองนัดหมายเรียบร้อยแล้ว',
        booking: {
          queue_id: queueId,
          appointment_time: appointmentDateTime,
          patient_name: bookingDetails[0]?.patient_name,
          dentist_name: bookingDetails[0]?.dentist_name,
          treatment_name: bookingDetails[0]?.treatment_name,
          duration: bookingDetails[0]?.duration,
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
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    console.log('📅 Getting calendar data for:', { year, month, startDate, endDate, treatment_id });
    
    // Query หลัก: ดึงข้อมูลทั้งหมดที่ต้องการในครั้งเดียว
    let mainQuery = `
      SELECT 
        s.date,
        DATE_FORMAT(s.date, '%Y-%m-%d') as date_string,
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.photo,
        COUNT(DISTINCT s.slot_id) as dentist_total_slots,
        COUNT(DISTINCT CASE 
          WHEN s.is_available = 1 
          AND NOT EXISTS (
            SELECT 1 FROM queue q 
            WHERE q.dentist_id = s.dentist_id 
            AND DATE(q.time) = s.date 
            AND TIME(q.time) = s.start_time 
            AND q.queue_status IN ('pending', 'confirm')
          ) 
          THEN s.slot_id 
        END) as dentist_available_slots
      FROM available_slots s
      JOIN dentist d ON s.dentist_id = d.dentist_id
      WHERE s.date BETWEEN ? AND ?
      AND d.user_id IS NOT NULL
    `;
    
    let queryParams = [
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ];
    
    // ถ้ามีการกรองตามการรักษา
    if (treatment_id) {
      mainQuery += ` AND EXISTS (
        SELECT 1 FROM dentist_treatment dt 
        WHERE dt.dentist_id = d.dentist_id 
        AND dt.treatment_id = ?
      )`;
      queryParams.push(treatment_id);
    }
    
    mainQuery += `
      GROUP BY s.date, d.dentist_id, d.fname, d.lname, d.specialty, d.photo
      HAVING dentist_available_slots > 0
      ORDER BY s.date, d.fname, d.lname
    `;
    
    const [rawData] = await db.execute(mainQuery, queryParams);
    
    console.log('✅ Raw data from DB:', rawData.length, 'records');
    
    // จัดกลุ่มข้อมูลตามวันที่
    const groupedByDate = {};
    
    rawData.forEach(row => {
      const dateStr = row.date_string;
      
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = {
          date: dateStr,
          available_dentists: 0,
          total_slots: 0,
          available_slots: 0,
          dentists: []
        };
      }
      
      groupedByDate[dateStr].available_dentists++;
      groupedByDate[dateStr].total_slots += parseInt(row.dentist_total_slots);
      groupedByDate[dateStr].available_slots += parseInt(row.dentist_available_slots);
      
      groupedByDate[dateStr].dentists.push({
        dentist_id: row.dentist_id,
        name: `${row.fname} ${row.lname}`,
        fname: row.fname,
        lname: row.lname,
        specialty: row.specialty || 'ทันตแพทย์ทั่วไป',
        photo: row.photo,
        available_slots: parseInt(row.dentist_available_slots)
      });
    });
    
    // แปลงเป็น array
    const calendarData = Object.values(groupedByDate);
    
    console.log('✅ Calendar data processed:', calendarData.length, 'days with available dentists');
    console.log('Sample day:', calendarData[0]);
    
    res.json({
      success: true,
      calendar_data: calendarData,
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

    const [patientResult] = await db.execute(`
      SELECT patient_id FROM patient WHERE user_id = ?
    `, [patientUserId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลผู้ป่วย' 
      });
    }

    const patientId = patientResult[0].patient_id;

    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis as notes,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        t.treatment_name,
        t.duration,
        CASE 
          WHEN q.time > DATE_ADD(NOW(), INTERVAL 24 HOUR) AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_cancel
      FROM queue q
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      AND q.time > NOW()
      AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time ASC
    `, [patientId]);

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

    const [patientResult] = await db.execute(`
      SELECT patient_id FROM patient WHERE user_id = ?
    `, [patientUserId]);

    if (patientResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    const patientId = patientResult[0].patient_id;

    const [appointmentCheck] = await db.execute(`
      SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        q.dentist_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [queue_id, patientId]);

    if (appointmentCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบนัดหมาย หรือไม่มีสิทธิ์ยกเลิก'
      });
    }

    const appointment = appointmentCheck[0];

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

    await db.execute(`
      UPDATE queue
      SET queue_status = 'cancel'
      WHERE queue_id = ? AND patient_id = ?
    `, [queue_id, patientId]);

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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    const { date, time, dentist_id, treatment_id } = req.query;
    
    // Get treatments
    const [treatments] = await db.execute('SELECT * FROM treatment ORDER BY treatment_name');
    
    // Get dentists with schedules
    const [dentists] = await db.execute(`
      SELECT DISTINCT d.*, CONCAT(d.fname, ' ', d.lname) as full_name 
      FROM dentist d 
      JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
      WHERE d.user_id IS NOT NULL
      AND ds.schedule_date >= CURDATE()
      AND ds.status = 'working'
      ORDER BY d.fname
    `);

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
    
    // Get patient ID
    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/patient/appointment/book?error=1');
    
    const patient_id = patientRows[0].patient_id;
    
    // Validate the appointment time against dentist schedule
    const hour = parseInt(time.split(':')[0]);
    const [scheduleValidation] = await db.execute(`
      SELECT ds.schedule_id
      FROM dentist_schedule ds
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.dentist_id = ?
      AND ds.schedule_date = ?
      AND ds.hour = ?
      AND ds.status = 'working'
      AND q.queue_id IS NULL
    `, [dentist_id, date, hour]);

    if (scheduleValidation.length === 0) {
      return res.redirect('/patient/appointment/book?error=time_unavailable');
    }
    
    // Create appointment datetime
    const appointmentTime = `${date} ${time}:00`;
    
    // Insert into queuedetail
    const [queueDetailResult] = await db.execute(`
      INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [patient_id, treatment_id, dentist_id, date]);
    
    // Insert into queue
    await db.execute(`
      INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status, diagnosis)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `, [queueDetailResult.insertId, patient_id, treatment_id, dentist_id, appointmentTime, symptom_details]);
    
    res.redirect('/patient/appointment/month?success=1');
  } catch (error) {
    console.error('Create booking error:', error);
    res.redirect('/patient/appointment/book?error=1');
  }
};

// Helper functions using real schedule data
async function getAvailableAppointmentsByMonth(year, month) {
  const [appointments] = await db.execute(`
    SELECT 
      ds.schedule_date as date,
      ds.hour,
      ds.start_time,
      ds.end_time,
      TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
      CONCAT(d.fname, ' ', d.lname) as dentist_name,
      d.dentist_id,
      d.specialty,
      'Available' as treatment_name,
      60 as duration,
      CASE 
        WHEN q.queue_id IS NULL THEN 'available'
        ELSE 'booked'
      END as status
    FROM dentist_schedule ds
    JOIN dentist d ON ds.dentist_id = d.dentist_id
    LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
      AND DATE(q.time) = ds.schedule_date 
      AND HOUR(q.time) = ds.hour
      AND q.queue_status IN ('pending', 'confirm')
    WHERE YEAR(ds.schedule_date) = ? 
    AND MONTH(ds.schedule_date) = ?
    AND ds.status = 'working'
    AND ds.schedule_date >= CURDATE()
    ORDER BY ds.schedule_date, ds.hour
  `, [year, month + 1]);
  
  return appointments;
}

async function getAvailableAppointmentsByWeek(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  
  const [appointments] = await db.execute(`
    SELECT 
      ds.schedule_date as date,
      ds.hour,
      ds.start_time,
      ds.end_time,
      TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
      CONCAT(d.fname, ' ', d.lname) as dentist_name,
      d.dentist_id,
      d.specialty,
      'Available' as treatment_name,
      60 as duration,
      CASE 
        WHEN q.queue_id IS NULL THEN 'available'
        ELSE 'booked'
      END as status
    FROM dentist_schedule ds
    JOIN dentist d ON ds.dentist_id = d.dentist_id
    LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
      AND DATE(q.time) = ds.schedule_date 
      AND HOUR(q.time) = ds.hour
      AND q.queue_status IN ('pending', 'confirm')
    WHERE ds.schedule_date BETWEEN ? AND ?
    AND ds.status = 'working'
    AND ds.schedule_date >= CURDATE()
    ORDER BY ds.schedule_date, ds.hour
  `, [
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ]);
  
  return appointments;
}

async function getAvailableAppointmentsByDay(date) {
  const [appointments] = await db.execute(`
    SELECT 
      ds.schedule_date as date,
      ds.hour,
      ds.start_time,
      ds.end_time,
      TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
      CONCAT(d.fname, ' ', d.lname) as dentist_name,
      d.dentist_id,
      d.specialty,
      'Available' as treatment_name,
      60 as duration,
      CASE 
        WHEN q.queue_id IS NULL THEN 'available'
        ELSE 'booked'
      END as status
    FROM dentist_schedule ds
    JOIN dentist d ON ds.dentist_id = d.dentist_id
    LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
      AND DATE(q.time) = ds.schedule_date 
      AND HOUR(q.time) = ds.hour
      AND q.queue_status IN ('pending', 'confirm')
    WHERE ds.schedule_date = ?
    AND ds.status = 'working'
    ORDER BY ds.hour
  `, [date.toISOString().split('T')[0]]);
  
  return appointments;
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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    const [appointments] = await db.execute(`
      SELECT q.queue_id, q.time, q.queue_status, q.diagnosis, q.next_appointment,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             qd.date, qd.created_at
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC
    `, [patient_id]);

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    const [appointmentRows] = await db.execute(`
      SELECT q.*, qd.date, qd.created_at,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [appointmentId, patient_id]);

    if (!appointmentRows[0]) {
      return res.status(404).send('Appointment not found');
    }

    const appointment = appointmentRows[0];

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    const [appointmentRows] = await db.execute(`
      SELECT q.*, qd.date, qd.created_at,
             t.treatment_name, t.treatment_id, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.dentist_id, d.specialty,
             CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [appointmentId, patient_id]);

    if (!appointmentRows[0]) {
      return res.status(404).send('Appointment not found');
    }

    const appointment = appointmentRows[0];
    
    // Check if appointment can be edited (24 hours before)
    const appointmentTime = new Date(appointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    
    const canEdit = hoursDiff > 24;

    // Get treatments
    const [treatments] = await db.execute('SELECT * FROM treatment ORDER BY treatment_name');
    
    // Get dentists
    const [dentists] = await db.execute(`
      SELECT d.*, CONCAT(d.fname, ' ', d.lname) as full_name 
      FROM dentist d 
      WHERE d.user_id IS NOT NULL
      ORDER BY d.fname
    `);

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

    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/login');
    
    const patient_id = patientRows[0].patient_id;

    const [currentRows] = await db.execute(`
      SELECT * FROM queue WHERE queue_id = ? AND patient_id = ?
    `, [appointmentId, patient_id]);

    if (!currentRows[0]) {
      return res.status(404).send('Appointment not found');
    }

    const currentAppointment = currentRows[0];
    
    // Check if appointment can be edited (24 hours before)
    const appointmentTime = new Date(currentAppointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    
    if (hoursDiff <= 24) {
      return res.redirect(`/patient/history/edit/${appointmentId}?error=time_limit`);
    }

    // Validate new time against dentist schedule
    const hour = parseInt(time.split(':')[0]);
    const [scheduleValidation] = await db.execute(`
      SELECT ds.schedule_id
      FROM dentist_schedule ds
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
        AND q.queue_id != ?
      WHERE ds.dentist_id = ?
      AND ds.schedule_date = ?
      AND ds.hour = ?
      AND ds.status = 'working'
      AND q.queue_id IS NULL
    `, [appointmentId, currentAppointment.dentist_id, date, hour]);

    if (scheduleValidation.length === 0) {
      return res.redirect(`/patient/history/edit/${appointmentId}?error=time_unavailable`);
    }

    const newAppointmentTime = `${date} ${time}:00`;

    // Update queue
    await db.execute(`
      UPDATE queue 
      SET time = ?
      WHERE queue_id = ? AND patient_id = ?
    `, [newAppointmentTime, appointmentId, patient_id]);

    // Update queuedetail
    await db.execute(`
      UPDATE queuedetail 
      SET date = ?
      WHERE queuedetail_id = ?
    `, [date, currentAppointment.queuedetail_id]);

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

    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/login');
    
    const patient_id = patientRows[0].patient_id;

    const [currentRows] = await db.execute(`
      SELECT * FROM queue WHERE queue_id = ? AND patient_id = ?
    `, [appointmentId, patient_id]);

    if (!currentRows[0]) {
      return res.status(404).send('Appointment not found');
    }

    const currentAppointment = currentRows[0];
    
    // Check if appointment can be cancelled (24 hours before)
    const appointmentTime = new Date(currentAppointment.time);
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 3600);
    
    if (hoursDiff <= 24) {
      return res.redirect(`/patient/history/details/${appointmentId}?error=cancel_time_limit`);
    }

    // Update appointment status to cancelled
    await db.execute(`
      UPDATE queue 
      SET queue_status = 'cancel'
      WHERE queue_id = ? AND patient_id = ?
    `, [appointmentId, patient_id]);

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

    const [patientResult] = await db.execute(`
      SELECT patient_id FROM patient WHERE user_id = ?
    `, [patientUserId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลผู้ป่วย' 
      });
    }

    const patientId = patientResult[0].patient_id;

    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty,
        t.treatment_name,
        t.duration,
        CASE 
          WHEN q.time > NOW() AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_cancel,
        CASE 
          WHEN q.time > DATE_ADD(NOW(), INTERVAL 2 HOUR) AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_modify
      FROM queue q
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC
    `, [patientId]);

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    const searchYear = req.query.year || new Date().getFullYear();

    const [treatments] = await db.execute(`
      SELECT q.queue_id, q.time, q.diagnosis, q.next_appointment,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             qd.date, qd.created_at,
             th.diagnosis as treatment_diagnosis,
             th.followUpdate,
             YEAR(qd.date) as treatment_year,
             MONTH(qd.date) as treatment_month,
             DAY(qd.date) as treatment_day
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      LEFT JOIN treatmentHistory th ON q.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ? AND (q.queue_status = 'confirm' OR th.tmh_id IS NOT NULL)
      ORDER BY qd.date DESC, q.time DESC
    `, [patient_id]);

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    const searchQuery = req.query.search || '';

    let dentistsQuery = `
      SELECT d.dentist_id, d.fname, d.lname, d.specialty, d.education, d.photo,
             CONCAT(d.fname, ' ', d.lname) as full_name,
             u.email
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE u.role_id = 2 AND d.fname IS NOT NULL AND d.lname IS NOT NULL
    `;

    let queryParams = [];

    if (searchQuery) {
      dentistsQuery += ` AND (CONCAT(d.fname, ' ', d.lname) LIKE ? OR d.specialty LIKE ?)`;
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    dentistsQuery += ` ORDER BY d.specialty ASC, d.fname ASC`;

    const [dentists] = await db.execute(dentistsQuery, queryParams);

    // Get treatments for each dentist
    for (let dentist of dentists) {
      const [treatments] = await db.execute(`
        SELECT t.treatment_name, t.duration
        FROM dentist_treatment dt
        JOIN treatment t ON dt.treatment_id = t.treatment_id
        WHERE dt.dentist_id = ?
        ORDER BY t.treatment_name
      `, [dentist.dentist_id]);
      
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

    // Get dentist details with schedule availability
    const [dentistResult] = await db.execute(`
      SELECT 
        d.dentist_id,
        d.fname,
        d.lname,
        CONCAT(d.fname, ' ', d.lname) as full_name,
        d.specialty,
        d.education,
        d.phone,
        d.photo,
        d.work_start,
        d.work_end,
        u.email,
        (
          SELECT COUNT(*) 
          FROM dentist_schedule ds 
          WHERE ds.dentist_id = d.dentist_id 
          AND ds.schedule_date >= CURDATE() 
          AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND ds.status = 'working'
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = ds.dentist_id 
            AND DATE(q.time) = ds.schedule_date 
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          )
        ) as available_slots_this_week,
        (
          SELECT COUNT(*) 
          FROM queue q 
          WHERE q.dentist_id = d.dentist_id 
          AND q.queue_status = 'confirm'
        ) as total_patients_treated
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE d.dentist_id = ?
      AND u.role_id = 2
    `, [dentistId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลหมอฟัน' 
      });
    }

    const dentist = dentistResult[0];

    // Get dentist's treatments/specializations
    const [treatments] = await db.execute(`
      SELECT t.treatment_name, t.duration
      FROM dentist_treatment dt
      JOIN treatment t ON dt.treatment_id = t.treatment_id
      WHERE dt.dentist_id = ?
      ORDER BY t.treatment_name
    `, [dentistId]);

    dentist.treatments = treatments;

    // Get recent availability (next 7 days)
    const [upcomingSlots] = await db.execute(`
      SELECT 
        ds.schedule_date,
        ds.hour,
        TIME_FORMAT(ds.start_time, '%H:%i') as start_time,
        TIME_FORMAT(ds.end_time, '%H:%i') as end_time,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = ds.dentist_id 
            AND DATE(q.time) = ds.schedule_date 
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN 'booked'
          ELSE 'available'
        END as status
      FROM dentist_schedule ds
      WHERE ds.dentist_id = ?
      AND ds.schedule_date >= CURDATE()
      AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      AND ds.status = 'working'
      ORDER BY ds.schedule_date, ds.hour
      LIMIT 20
    `, [dentistId]);

    dentist.upcoming_slots = upcomingSlots;

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

    const [availability] = await db.execute(`
      SELECT 
        ds.schedule_date,
        ds.hour,
        TIME_FORMAT(ds.start_time, '%H:%i') as start_time,
        TIME_FORMAT(ds.end_time, '%H:%i') as end_time,
        CONCAT(
          TIME_FORMAT(ds.start_time, '%H:%i'), ' - ', 
          TIME_FORMAT(ds.end_time, '%H:%i')
        ) as time_display
      FROM dentist_schedule ds
      WHERE ds.dentist_id = ?
      AND ds.schedule_date BETWEEN ? AND ?
      AND ds.status = 'working'
      AND NOT EXISTS (
        SELECT 1 FROM queue q
        WHERE q.dentist_id = ds.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      )
      ORDER BY ds.schedule_date, ds.hour
    `, [dentistId, startDate, endDate]);

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

    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    const searchQuery = req.query.search || '';

    let dentistsQuery = `
      SELECT 
        d.dentist_id, 
        d.fname, 
        d.lname, 
        d.specialty, 
        d.education, 
        d.photo,
        CONCAT(d.fname, ' ', d.lname) as full_name,
        u.email,
        (
          SELECT COUNT(*) 
          FROM dentist_schedule ds 
          WHERE ds.dentist_id = d.dentist_id 
          AND ds.schedule_date >= CURDATE() 
          AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND ds.status = 'working'
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = ds.dentist_id 
            AND DATE(q.time) = ds.schedule_date 
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          )
        ) as available_slots_this_week
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE u.role_id = 2 AND d.fname IS NOT NULL AND d.lname IS NOT NULL
    `;

    let queryParams = [];

    if (searchQuery) {
      dentistsQuery += ` AND (CONCAT(d.fname, ' ', d.lname) LIKE ? OR d.specialty LIKE ?)`;
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    dentistsQuery += ` ORDER BY d.specialty ASC, d.fname ASC`;

    const [dentists] = await db.execute(dentistsQuery, queryParams);

    // Get treatments for each dentist
    for (let dentist of dentists) {
      const [treatments] = await db.execute(`
        SELECT t.treatment_name, t.duration
        FROM dentist_treatment dt
        JOIN treatment t ON dt.treatment_id = t.treatment_id
        WHERE dt.dentist_id = ?
        ORDER BY t.treatment_name
      `, [dentist.dentist_id]);
      
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
    console.error('Enhanced dentists error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Get patient profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // Get patient info with user details - เพิ่ม id_card ในการดึงข้อมูล
    const [patientRows] = await db.execute(
      `SELECT 
        p.patient_id,
        p.fname, 
        p.lname, 
        p.dob, 
        p.phone, 
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        u.email,
        u.last_login
       FROM patient p 
       JOIN user u ON p.user_id = u.user_id 
       WHERE p.user_id = ?`, 
      [userId]
    );

    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    const genderTh = patient.gender === 'male' ? 'ชาย'
                : patient.gender === 'female' ? 'หญิง'
                : patient.gender === 'other' ? 'อื่นๆ' : 'ยังไม่ระบุ';
    
                // Format the data for display
    const profileData = {
      ...patient,
      dob_formatted: patient.dob ? new Date(patient.dob).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long', 
        year: 'numeric'
      }) : 'Not specified',
      last_login_formatted: patient.last_login ? new Date(patient.last_login).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + ' - ' + new Date(patient.last_login).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      }) + ' AM' : 'Never logged in',
      full_name: `${patient.fname} ${patient.lname}`,
      masked_password: '******',
      gender_th: genderTh,
      // ใช้ข้อมูล ID Card จากฐานข้อมูล
      id_card_display: patient.id_card || 'Not specified'
    };

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

    // Get patient info with user details - เพิ่มฟิลด์ทั้งหมด
    const [patientRows] = await db.execute(
      `SELECT 
        p.patient_id,
        p.fname, 
        p.lname, 
        p.dob, 
        p.phone, 
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        u.email,
        u.last_login
       FROM patient p 
       JOIN user u ON p.user_id = u.user_id 
       WHERE p.user_id = ?`, 
      [userId]
    );

    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    // Format the data for form
    const profileData = {
      ...patient,
      dob_formatted: patient.dob ? new Date(patient.dob).toISOString().split('T')[0] : '',
      last_login_formatted: patient.last_login ? new Date(patient.last_login).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + ' - ' + new Date(patient.last_login).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
      }) : 'ยังไม่เคยเข้าสู่ระบบ',
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
  let connection;
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const {
      fname,
      lname,
      dob,
      id_card,
      address,
      phone,
      email,
      gender,
      chronic_disease,
      allergy_history
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

    // Get patient ID
    const [patientRows] = await db.execute(
      'SELECT patient_id, id_card FROM patient WHERE user_id = ?',
      [userId]
    );

    if (!patientRows[0]) return res.redirect('/login');
    const patient_id = patientRows[0].patient_id;
    const currentIdCard = patientRows[0].id_card;

    // Check if email is already used by another user
    const [emailCheck] = await db.execute(
      'SELECT user_id FROM user WHERE email = ? AND user_id != ?',
      [email, userId]
    );

    if (emailCheck.length > 0) {
      return res.redirect('/patient/profile/edit?error=email_exists');
    }

    // Check if ID card is already used by another patient (only if changed)
    if (id_card && id_card !== currentIdCard) {
      const [idCardCheck] = await db.execute(
        'SELECT patient_id FROM patient WHERE id_card = ? AND patient_id != ?',
        [id_card, patient_id]
      );

      if (idCardCheck.length > 0) {
        return res.redirect('/patient/profile/edit?error=id_card_exists');
      }
    }

    // Start transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Update user table
      await connection.execute(
        'UPDATE user SET email = ? WHERE user_id = ?',
        [email, userId]
      );

      // Update patient table - แก้ไข SQL query ให้ถูกต้อง
      await connection.execute(
        `UPDATE patient SET 
         fname = ?, 
         lname = ?, 
         dob = ?, 
         id_card = ?, 
         address = ?, 
         phone = ?,
         gender = ?,
         chronic_disease = ?,
         allergy_history = ?
         WHERE patient_id = ?`,
        [
          fname, 
          lname, 
          dob || null, 
          id_card || null, 
          address || null, 
          phone || null, 
          gender || null, 
          chronic_disease || null, 
          allergy_history || null, 
          patient_id
        ]
      );

      // Commit transaction
      await connection.commit();
      
      res.redirect('/patient/profile?success=updated');
    } catch (error) {
      // Rollback on error
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Update profile error:', error);
    res.redirect('/patient/profile/edit?error=update_failed');
  } finally {
    if (connection) connection.release();
  }
};


// Show change password form
exports.showChangePassword = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    // Get patient info with user details
    const [patientRows] = await db.execute(
      `SELECT 
        p.patient_id,
        p.fname, 
        p.lname, 
        u.email,
        u.last_login
       FROM patient p 
       JOIN user u ON p.user_id = u.user_id 
       WHERE p.user_id = ?`, 
      [userId]
    );

    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    // Format the data for display
    const profileData = {
      ...patient,
      last_login_formatted: patient.last_login ? new Date(patient.last_login).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + ' - ' + new Date(patient.last_login).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      }) + ' AM' : 'Never logged in',
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

    // Get current user data
    const [userRows] = await db.execute(
      'SELECT password FROM user WHERE user_id = ?',
      [userId]
    );

    if (!userRows[0]) return res.redirect('/login');

    // Verify current password
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, userRows[0].password);
    if (!isCurrentPasswordValid) {
      return res.redirect('/patient/profile/change-password?error=current_password_wrong');
    }

    // Check if new password is different from current
    const isSamePassword = bcrypt.compareSync(newPassword, userRows[0].password);
    if (isSamePassword) {
      return res.redirect('/patient/profile/change-password?error=same_password');
    }

    // Hash new password
    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);

    // Update password in database
    await db.execute(
      'UPDATE user SET password = ? WHERE user_id = ?',
      [hashedNewPassword, userId]
    );

    res.redirect('/patient/profile?success=password_changed');

  } catch (error) {
    console.error('Change password error:', error);
    res.redirect('/patient/profile/change-password?error=update_failed');
  }
};

exports.getTreatmentsAPI = async (req, res) => {
  try {
    const [treatments] = await db.execute(`
      SELECT 
        treatment_id,
        treatment_name,
        duration
      FROM treatment
      ORDER BY treatment_name ASC
    `);

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
    
    const [patientRows] = await db.execute(
      'SELECT fname, lname, phone, email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?',
      [userId]
    );
    
    if (patientRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }
    
    res.json({
      success: true,
      patient: patientRows[0]
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
    
    const [treatments] = await db.execute(`
      SELECT t.treatment_id, t.treatment_name, t.duration
      FROM dentist_treatment dt
      JOIN treatment t ON dt.treatment_id = t.treatment_id
      WHERE dt.dentist_id = ?
      ORDER BY t.treatment_name
    `, [dentistId]);
    
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

    // Get patient_id
    const [patientResult] = await db.execute(
      'SELECT patient_id FROM patient WHERE user_id = ?',
      [userId]
    );

    if (patientResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Patient not found' 
      });
    }

    const patientId = patientResult[0].patient_id;

    // Get treatment history with all details
    const [treatments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.gender,
        p.dob,
        p.phone,
        p.address,
        p.id_card,
        p.chronic_disease,
        p.allergy_history,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty,
        t.treatment_name,
        t.duration,
        th.diagnosis as treatment_diagnosis,
        th.followUpdate as next_appointment_detail,
        qd.date
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [id, patientId]);

    if (treatments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Treatment history not found'
      });
    }

    res.json({
      success: true,
      treatment: treatments[0]
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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

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