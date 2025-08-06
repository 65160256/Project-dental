const db = require('../models/db');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const moment = require('moment');

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

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: '"Dentistry Clinic" <' + process.env.EMAIL_USER + '>',
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
  const patientId = req.session.userId;
  if (!patientId) return res.redirect('/login');

  try {
    const [patientRows] = await db.execute('SELECT * FROM patient WHERE user_id = ?', [patientId]);
    if (patientRows.length === 0) return res.status(404).send('Patient not found.');

    const patient = patientRows[0];

    const [nextAppointmentRows] = await db.execute(
      `SELECT a.queue_id, a.time, t.treatment_name AS treatment, d.fname AS dentist, a.queue_status
       FROM queue a
       JOIN treatment t ON a.treatment_id = t.treatment_id
       JOIN dentist d ON a.dentist_id = d.dentist_id
       WHERE a.patient_id = ? AND a.time > NOW() ORDER BY a.time ASC LIMIT 1`,
      [patientId]
    );
    const nextAppointment = nextAppointmentRows[0];

    const [appointmentsRows] = await db.execute(
      `SELECT a.time, t.treatment_name AS treatment, d.fname AS dentist, a.queue_status
       FROM queue a
       JOIN treatment t ON a.treatment_id = t.treatment_id
       JOIN dentist d ON a.dentist_id = d.dentist_id
       WHERE a.patient_id = ? ORDER BY a.time DESC`,
      [patientId]
    );

    const [treatmentHistoryRows] = await db.execute(
      `SELECT th.diagnosis, th.followUpdate, t.treatment_name AS treatment, d.fname AS dentist
       FROM treatmentHistory th
       JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       WHERE qd.patient_id = ?
       ORDER BY th.tmh_id DESC LIMIT 1`,
      [patientId]
    );
    const treatmentHistory = treatmentHistoryRows[0];

    const [dentistsRows] = await db.execute(
      `SELECT d.fname, d.lname, d.photo
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

function getColor(treatmentName) {
  if (treatmentName.toLowerCase().includes('fill')) return 'green';
  return 'blue';
}

exports.renderDayView = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT q.queue_id, p.fname, p.lname, t.treatment_name, q.time
       FROM queue q
       JOIN patient p ON q.patient_id = p.patient_id
       JOIN treatment t ON q.treatment_id = t.treatment_id
       WHERE DATE(q.time) = CURDATE()
       ORDER BY q.time`
    );

    const appointments = rows.map(row => ({
      patient: row.fname + ' ' + row.lname,
      treatment: row.treatment_name,
      time: row.time,
      color: getColor(row.treatment_name)
    }));

    // 👇 ดึงชื่อผู้ใช้จาก session (หรือ mock สำหรับ dev)
    const patientName = req.session?.name || 'Guest';

    res.render('patient/appointment/day', {
      displayDate: new Date().toLocaleDateString(),
      appointments,
      patientName // ✅ ส่งตัวแปรนี้เข้า view
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching day appointments');
  }
};


exports.renderForm = async (req, res) => {
  try {
    const [treatments] = await db.execute('SELECT * FROM treatment');
    const [dentists] = await db.execute('SELECT * FROM dentist');

    const patient = {
      name: 'Mock Patient',
      phone: '0123456789'
    };

    res.render('patient/appointment/form', {
      treatments: treatments.map(t => ({ id: t.treatment_id, name: t.treatment_name })),
      dentists: dentists.map(d => ({ id: d.dentist_id, name: d.fname + ' ' + d.lname })),
      patient
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading form');
  }
};

exports.renderConfirm = async (req, res) => {
  const { name, phone, date, start_time, end_time, dentist_id, symptom, treatment_id } = req.body;

  try {
    const [[treatment]] = await db.execute('SELECT treatment_name FROM treatment WHERE treatment_id = ?', [treatment_id]);
    const [[dentist]] = await db.execute('SELECT fname, lname FROM dentist WHERE dentist_id = ?', [dentist_id]);

    res.render('patient/appointment/confirm', {
      queueId: 'Y-106666',
      name,
      phone,
      date,
      time: start_time + ' - ' + end_time,
      dentist: dentist ? dentist.fname + ' ' + dentist.lname : 'Any',
      symptom,
      treatment: treatment ? treatment.treatment_name : 'Unknown'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error confirming appointment');
  }
};

