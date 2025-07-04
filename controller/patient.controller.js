
// controllers/patient.controller.js

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
      'SELECT * FROM user u JOIN patient p ON u.user_id = p.user_id WHERE u.email = ? AND u.role_id = 1',
      [email]
    );

    if (rows.length === 0) return res.send('Email not found or not a patient account.');

    const resetToken = Math.random().toString(36).substring(2);
    const resetLink = `http://localhost:3000/patient/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'yourclinicemail@gmail.com',
        pass: 'yourapppassword'
      }
    });

    const mailOptions = {
      from: '"Dentistry Clinic" <yourclinicemail@gmail.com>',
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
    await db.execute('UPDATE user SET password = ? WHERE email = ? AND role_id = 1', [hashed, email]);
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
      `SELECT a.time, p.fname AS name, t.treatment_name AS treatment, d.fname AS dentist, a.queue_status
       FROM queue a
       JOIN patient p ON a.patient_id = p.patient_id
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
    const dentists = dentistsRows;

    res.render('patient/patient-dashboard', {
      patient,
      nextAppointment,
      appointments: appointmentsRows,
      treatmentHistory,
      dentists,
      currentDate: new Date().toLocaleDateString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard data');
  }
};

exports.getAppointmentsPage = async (req, res) => {
  try {
    const selectedDate = req.query.date ?? new Date().toISOString().slice(0, 10);

    if (!selectedDate) {
      return res.status(400).send('Missing or invalid date');
    }

    const userId = req.session.userId;
    const [patientRows] = await db.execute('SELECT * FROM patient WHERE user_id = ?', [userId]);
    const patient = patientRows[0];

    const [appointments] = await db.execute(`
      SELECT q.time, p.fname AS patient_fname, p.lname AS patient_lname, t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE DATE(q.time) = ?
    `, [selectedDate]);

    res.render('patient/appointments', {
      date: selectedDate,
      appointments,
      patient
    });
  } catch (error) {
    console.error('Error loading appointments:', error);
    res.status(500).send('Internal Server Error');
  }
};
