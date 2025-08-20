const db = require('../models/db');
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

// Get patient dashboard
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
       WHERE q.patient_id = ? AND q.time > NOW() 
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
       WHERE q.patient_id = ? ORDER BY q.time DESC`,
      [patient.patient_id]
    );

    // Get treatment history
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
    const treatmentHistory = treatmentHistoryRows[0];

    // Get today's dentists
    const [dentistsRows] = await db.execute(
      `SELECT DISTINCT CONCAT(d.fname, ' ', d.lname) AS name, d.photo
       FROM dentist d
       JOIN queue q ON d.dentist_id = q.dentist_id
       WHERE DATE(q.time) = CURDATE()`
    );

    res.render('patient/patient-dashboard', {
      patient,
      nextAppointment,
      appointments: appointmentsRows,
      treatmentHistory,
      dentists: dentistsRows,
      currentDate: new Date().toLocaleDateString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard data');
  }
};

// Month View (default appointment page)
exports.getAppointmentsPage = async (req, res) => {
  res.redirect('/patient/appointment/month');
};

// Alternative route handler for /appointments
exports.getAppointments = async (req, res) => {
  res.redirect('/patient/appointment/month');
};

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
    
    // Get appointments for the month
    const appointments = await getAppointmentsByMonth(year, month);
    
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

// Week View
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
    
    // Get appointments for the week
    const appointments = await getAppointmentsByWeek(monday);
    
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

// Day View
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
    
    // Get appointments for the day
    const appointments = await getAppointmentsByDay(date);
    
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

// Show booking form
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
    
    // Get dentists
    const [dentists] = await db.execute(`
      SELECT d.*, CONCAT(d.fname, ' ', d.lname) as full_name 
      FROM dentist d 
      WHERE d.user_id IS NOT NULL
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

// Book appointment
exports.bookAppointment = async (req, res) => {
  try {
    const { date, time, dentist_id, treatment_id, symptom_details, phone } = req.body;
    const userId = req.session.userId;
    
    // Get patient ID
    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/patient/appointment/book?error=1');
    
    const patient_id = patientRows[0].patient_id;
    
    // Create appointment datetime
    const appointmentTime = `${date} ${time}:00`;
    
    // Insert into queuedetail
    const [queueDetailResult] = await db.execute(`
      INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [patient_id, treatment_id, dentist_id, date]);
    
    // Insert into queue
    await db.execute(`
      INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [queueDetailResult.insertId, patient_id, treatment_id, dentist_id, appointmentTime]);
    
    res.redirect('/patient/appointment/month?success=1');
  } catch (error) {
    console.error('Create booking error:', error);
    res.redirect('/patient/appointment/book?error=1');
  }
};

// Get patient history
exports.getHistory = async (req, res) => {
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
    const patient_id = patient.patient_id;

    // Get appointment history
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

// Get appointment details
exports.getAppointmentDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    
    if (!userId) return res.redirect('/login');

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    // Get appointment details
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

// Show edit appointment form
exports.showEditAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    
    if (!userId) return res.redirect('/login');

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    // Get appointment details
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

// Update appointment
exports.updateAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    const { date, time } = req.body;
    
    if (!userId) return res.redirect('/login');

    // Get patient ID
    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/login');
    
    const patient_id = patientRows[0].patient_id;

    // Get current appointment
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

    // Create new appointment datetime
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

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const appointmentId = req.params.id;
    
    if (!userId) return res.redirect('/login');

    // Get patient ID
    const [patientRows] = await db.execute('SELECT patient_id FROM patient WHERE user_id = ?', [userId]);
    if (!patientRows[0]) return res.redirect('/login');
    
    const patient_id = patientRows[0].patient_id;

    // Get current appointment
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

// Helper functions
async function getAppointmentsByMonth(year, month) {
  const [appointments] = await db.execute(`
    SELECT q.*, qd.date,
           TIME_FORMAT(TIME(q.time), '%H:%i') as time_formatted,
           CONCAT(d.fname, ' ', d.lname) as dentist_name,
           t.treatment_name,
           t.duration,
           d.specialty
    FROM queue q
    JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
    JOIN dentist d ON q.dentist_id = d.dentist_id
    JOIN treatment t ON q.treatment_id = t.treatment_id
    WHERE YEAR(qd.date) = ? AND MONTH(qd.date) = ?
    ORDER BY q.time
  `, [year, month + 1]);
  
  return appointments;
}

async function getAppointmentsByWeek(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  
  const [appointments] = await db.execute(`
    SELECT q.*, qd.date,
           TIME_FORMAT(TIME(q.time), '%H:%i') as time_formatted,
           CONCAT(d.fname, ' ', d.lname) as dentist_name,
           t.treatment_name,
           t.duration,
           d.specialty
    FROM queue q
    JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
    JOIN dentist d ON q.dentist_id = d.dentist_id
    JOIN treatment t ON q.treatment_id = t.treatment_id
    WHERE qd.date BETWEEN ? AND ?
    ORDER BY qd.date, q.time
  `, [
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ]);
  
  return appointments;
}

async function getAppointmentsByDay(date) {
  const [appointments] = await db.execute(`
    SELECT q.*, qd.date,
           TIME_FORMAT(TIME(q.time), '%H:%i') as time_formatted,
           CONCAT(d.fname, ' ', d.lname) as dentist_name,
           t.treatment_name,
           t.duration,
           d.specialty
    FROM queue q
    JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
    JOIN dentist d ON q.dentist_id = d.dentist_id
    JOIN treatment t ON q.treatment_id = t.treatment_id
    WHERE qd.date = ?
    ORDER BY q.time
  `, [date.toISOString().split('T')[0]]);
  
  return appointments;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Get patient treatments history
exports.getMyTreatments = async (req, res) => {
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
    const patient_id = patient.patient_id;

    // Get search parameters
    const searchYear = req.query.year || new Date().getFullYear();

    // Get treatment history with completed appointments
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

    // Get available years for dropdown
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

// Get treatment details
exports.getTreatmentDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    const treatmentId = req.params.id;
    
    if (!userId) return res.redirect('/login');

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];
    const patient_id = patient.patient_id;

    // Get treatment details
    const [treatmentRows] = await db.execute(`
      SELECT q.*, qd.date, qd.created_at,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty, d.fname as dentist_fname, d.lname as dentist_lname,
             th.diagnosis as treatment_diagnosis,
             th.followUpdate,
             CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN patient p ON q.patient_id = p.patient_id
      LEFT JOIN treatmentHistory th ON q.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [treatmentId, patient_id]);

    if (!treatmentRows[0]) {
      return res.status(404).send('Treatment record not found');
    }

    const treatment = treatmentRows[0];

    res.render('patient/treatments/details', {
      title: 'Treatment History Details',
      user: req.session,
      patient: patient,
      treatment
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

    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?', 
      [userId]
    );
    if (!patientRows[0]) return res.redirect('/login');
    const patient = patientRows[0];

    // Get search parameter
    const searchQuery = req.query.search || '';

    // Get all dentists with their specialties and treatments
    let dentistsQuery = `
      SELECT d.dentist_id, d.fname, d.lname, d.specialty, d.education, d.photo,
             CONCAT(d.fname, ' ', d.lname) as full_name,
             u.email
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE u.role_id = 2 AND d.fname IS NOT NULL AND d.lname IS NOT NULL
    `;

    let queryParams = [];

    // Add search filter if provided
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

    // Get all available specialties for the page
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
    
    // Redirect to booking form with pre-selected dentist
    res.redirect(`/patient/appointment/book?dentist_id=${dentistId}`);
  } catch (error) {
    console.error('Make appointment error:', error);
    res.status(500).send('Internal Server Error');
  }
};

// เพิ่มฟังก์ชันเหล่านี้ในไฟล์ patient.controller.js ที่มีอยู่แล้ว

// API สำหรับดึงรายชื่อหมอฟันที่ว่างในวันที่เลือก
exports.getAvailableDentistsForBooking = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ 
                success: false, 
                error: 'กรุณาเลือกวันที่' 
            });
        }

        // ดึงรายชื่อหมอฟันที่มีตารางเวลาในวันนั้น
        const [availableDentists] = await db.execute(`
            SELECT DISTINCT
                d.dentist_id,
                d.fname,
                d.lname,
                d.specialty,
                d.photo,
                d.work_start,
                d.work_end,
                COUNT(ds.schedule_id) as total_slots,
                COUNT(CASE WHEN q.queue_id IS NULL THEN 1 END) as available_slots
            FROM dentist d
            JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
            LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
                AND DATE(q.time) = ds.schedule_date 
                AND HOUR(q.time) = ds.hour
                AND q.queue_status IN ('pending', 'confirm')
            WHERE ds.schedule_date = ?
            AND ds.status = 'working'
            GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.photo, d.work_start, d.work_end
            HAVING available_slots > 0
            ORDER BY d.fname, d.lname
        `, [date]);

        res.json({
            success: true,
            dentists: availableDentists,
            date: date
        });

    } catch (error) {
        console.error('Error in getAvailableDentistsForBooking:', error);
        res.status(500).json({ 
            success: false,
            error: 'เกิดข้อผิดพลาดในการดึงข้อมูลหมอฟัน'
        });
    }
};

// API สำหรับดึงช่วงเวลาที่ว่างของหมอฟันในวันที่เลือก
exports.getAvailableTimeSlots = async (req, res) => {
    try {
        const { date, dentistId } = req.query;

        if (!date || !dentistId) {
            return res.status(400).json({ 
                success: false, 
                error: 'ข้อมูลไม่ครบถ้วน' 
            });
        }

        // ดึงตารางเวลาการทำงานที่ว่าง
        const [availableSlots] = await db.execute(`
            SELECT 
                ds.hour,
                ds.start_time,
                ds.end_time,
                ds.note,
                CASE 
                    WHEN q.queue_id IS NULL THEN TRUE
                    ELSE FALSE
                END as is_available,
                COUNT(q.queue_id) as current_bookings,
                TIME_FORMAT(ds.start_time, '%H:%i') as formatted_start_time,
                TIME_FORMAT(ds.end_time, '%H:%i') as formatted_end_time,
                CONCAT(
                    TIME_FORMAT(ds.start_time, '%H:%i'), ' - ', 
                    TIME_FORMAT(ds.end_time, '%H:%i')
                ) as time_display
            FROM dentist_schedule ds
            LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
                AND DATE(q.time) = ds.schedule_date 
                AND HOUR(q.time) = ds.hour
                AND q.queue_status IN ('pending', 'confirm')
            WHERE ds.dentist_id = ?
            AND ds.schedule_date = ?
            AND ds.status = 'working'
            GROUP BY ds.schedule_id, ds.hour, ds.start_time, ds.end_time, ds.note
            HAVING is_available = TRUE
            ORDER BY ds.hour
        `, [dentistId, date]);

        res.json({
            success: true,
            slots: availableSlots,
            date: date,
            dentistId: dentistId
        });

    } catch (error) {
        console.error('Error in getAvailableTimeSlots:', error);
        res.status(500).json({ 
            success: false,
            error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเวลาว่าง'
        });
    }
};

// API สำหรับจองนัดหมายผ่านระบบ Schedule
exports.bookAppointmentWithSchedule = async (req, res) => {
    try {
        const patientUserId = req.session.userId;
        const { dentistId, treatmentId, date, hour, note } = req.body;

        // Validation
        if (!dentistId || !treatmentId || !date || !hour) {
            return res.status(400).json({ 
                success: false, 
                error: 'ข้อมูลไม่ครบถ้วน' 
            });
        }

        // ดึง patient_id
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

        // ตรวจสอบว่าหมอฟันว่างในช่วงเวลานั้นหรือไม่
        const [scheduleCheck] = await db.execute(`
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
        `, [dentistId, date, hour]);

        if (scheduleCheck.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'ช่วงเวลานี้ไม่ว่างหรือไม่มีในตารางการทำงาน' 
            });
        }

        // สร้าง appointment datetime
        const appointmentDateTime = `${date} ${hour.toString().padStart(2, '0')}:00:00`;

        // สร้าง queuedetail
        const [queueDetailResult] = await db.execute(`
            INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [patientId, treatmentId, dentistId, date]);

        const queueDetailId = queueDetailResult.insertId;

        // สร้าง queue
        const [queueResult] = await db.execute(`
            INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status, diagnosis)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `, [queueDetailId, patientId, treatmentId, dentistId, appointmentDateTime, note || null]);

        const queueId = queueResult.insertId;

        res.json({
            success: true,
            message: 'จองนัดหมายเรียบร้อยแล้ว',
            queueId: queueId,
            appointmentDateTime: appointmentDateTime
        });

    } catch (error) {
        console.error('Error in bookAppointmentWithSchedule:', error);
        res.status(500).json({ 
            success: false,
            error: 'เกิดข้อผิดพลาดในการจองนัดหมาย'
        });
    }
};

// API สำหรับยกเลิกนัดหมาย
exports.cancelMyAppointment = async (req, res) => {
    try {
        const patientUserId = req.session.userId;
        const { queueId } = req.body;

        if (!queueId) {
            return res.status(400).json({ 
                success: false, 
                error: 'ไม่พบรหัสนัดหมาย' 
            });
        }

        // ตรวจสอบสิทธิ์ - ให้ยกเลิกได้เฉพาะนัดหมายของตัวเอง
        const [appointmentCheck] = await db.execute(`
            SELECT q.queue_id, p.user_id
            FROM queue q
            JOIN patient p ON q.patient_id = p.patient_id
            WHERE q.queue_id = ?
        `, [queueId]);

        if (appointmentCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'ไม่พบนัดหมาย' 
            });
        }

        if (appointmentCheck[0].user_id !== patientUserId) {
            return res.status(403).json({ 
                success: false, 
                error: 'ไม่มีสิทธิ์ยกเลิกนัดหมายนี้' 
            });
        }

        // ตรวจสอบว่านัดหมายยังยกเลิกได้หรือไม่ (เช่น ก่อนเวลานัดหมาย 2 ชั่วโมง)
        const [timeCheck] = await db.execute(`
            SELECT queue_id
            FROM queue
            WHERE queue_id = ?
            AND time > DATE_ADD(NOW(), INTERVAL 2 HOUR)
            AND queue_status IN ('pending', 'confirm')
        `, [queueId]);

        if (timeCheck.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'ไม่สามารถยกเลิกได้ เนื่องจากใกล้เวลานัดหมายแล้ว' 
            });
        }

        // ยกเลิกนัดหมาย
        await db.execute(`
            UPDATE queue 
            SET queue_status = 'cancel' 
            WHERE queue_id = ?
        `, [queueId]);

        res.json({
            success: true,
            message: 'ยกเลิกนัดหมายเรียบร้อยแล้ว'
        });

    } catch (error) {
        console.error('Error in cancelMyAppointment:', error);
        res.status(500).json({ 
            success: false,
            error: 'เกิดข้อผิดพลาดในการยกเลิกนัดหมาย'
        });
    }
};

// API สำหรับดึงนัดหมายของผู้ป่วย
exports.getMyAppointments = async (req, res) => {
    try {
        const patientUserId = req.session.userId;

        // ดึง patient_id
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

        // ดึงรายการนัดหมาย
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

// หน้าจองนัดหมายใหม่ที่ใช้ระบบ Schedule
exports.showNewBookingForm = async (req, res) => {
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

        // Get treatments
        const [treatments] = await db.execute('SELECT * FROM treatment ORDER BY treatment_name');
        
        // Get dentists with their schedules for next 30 days
        const [dentists] = await db.execute(`
            SELECT DISTINCT
                d.dentist_id,
                d.fname, 
                d.lname,
                d.specialty,
                d.photo,
                CONCAT(d.fname, ' ', d.lname) as full_name
            FROM dentist d 
            JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
            WHERE d.user_id IS NOT NULL
            AND ds.schedule_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            AND ds.status = 'working'
            ORDER BY d.fname
        `);

        res.render('patient/appointment/book-with-schedule', {
            title: 'จองนัดหมาย - ระบบตารางเวลา',
            user: req.session,
            patient: patient,
            treatments,
            dentists
        });
    } catch (error) {
        console.error('New booking form error:', error);
        res.status(500).send('Internal Server Error');
    }
};

// ปรับปรุงฟังก์ชัน getDashboard เพื่อรองรับข้อมูลจาก dentist_schedule
exports.getDashboardWithSchedule = async (req, res) => {
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
             WHERE q.patient_id = ? AND q.time > NOW() 
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
             WHERE q.patient_id = ? ORDER BY q.time DESC`,
            [patient.patient_id]
        );

        // Get treatment history
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
        const treatmentHistory = treatmentHistoryRows[0];

        // Get today's dentists from schedule
        const [dentistsRows] = await db.execute(
            `SELECT DISTINCT 
                CONCAT(d.fname, ' ', d.lname) AS name, 
                d.photo,
                d.specialty
             FROM dentist d
             JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
             WHERE ds.schedule_date = CURDATE()
             AND ds.status = 'working'`
        );

        res.render('patient/patient-dashboard', {
            patient,
            nextAppointment,
            appointments: appointmentsRows,
            treatmentHistory,
            dentists: dentistsRows,
            currentDate: new Date().toLocaleDateString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching dashboard data');
    }
};