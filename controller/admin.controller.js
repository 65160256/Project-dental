const db = require('../models/db');
const bcrypt = require('bcrypt');

// -------------------- แสดงโปรไฟล์ --------------------
exports.getProfile = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  try {
    const [userRows] = await db.execute(`
      SELECT u.email, u.username, u.last_login, r.rname 
      FROM user u 
      JOIN role r ON u.role_id = r.role_id 
      WHERE u.user_id = ?
    `, [userId]);

    if (userRows.length === 0) return res.redirect('/login');

    const user = userRows[0];
    res.render('admin-profile', { user });

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// -------------------- เปลี่ยนรหัสผ่าน --------------------
exports.changePassword = async (req, res) => {
  const userId = req.session.userId;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!userId) return res.redirect('/login');
  if (newPassword !== confirmPassword) {
    req.flash('error', 'New password and confirm password do not match.');
    return res.redirect('/profile');
  }

  try {
    const [rows] = await db.execute('SELECT password FROM user WHERE user_id = ?', [userId]);
    if (rows.length === 0) return res.redirect('/login');

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/profile');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, userId]);

    req.flash('success', 'Password changed successfully. Please log in again.');
    req.session.destroy(() => {
      res.redirect('/login');
    });

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// -------------------- แสดงรายการนัด --------------------
exports.viewAppointments = async (req, res) => {
  try {
    const weekOffset = parseInt(req.query.weekOffset) || 0;
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

    const [appointments] = await db.execute(`
      SELECT 
        qd.date AS time_start,
        CONCAT(p.fname, ' ', p.lname) AS name,
        t.treatment_name AS treatment,
        d.fname AS dentist,
        p.phone,
        q.queue_status AS status
      FROM queuedetail qd
      JOIN patient p ON qd.patient_id = p.patient_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE DATE(qd.date) = ?
      ORDER BY qd.date DESC
    `, [selectedDate]);

    res.render('admin-appointments', {
      appointments,
      weekOffset,
      selectedDate
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// -------------------- AJAX เปลี่ยนวันที่ --------------------
exports.ajaxAppointments = async (req, res) => {
  const date = req.query.date;

  try {
    const [appointments] = await db.execute(`
      SELECT 
        qd.date AS time_start,
        CONCAT(p.fname, ' ', p.lname) AS name,
        t.treatment_name AS treatment,
        d.fname AS dentist,
        p.phone,
        q.queue_status AS status
      FROM queuedetail qd
      JOIN patient p ON qd.patient_id = p.patient_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE DATE(qd.date) = ?
      ORDER BY qd.date DESC
    `, [date]);

    res.render('partials/appointments-table', { appointments });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// -------------------- AJAX เปลี่ยนสัปดาห์ --------------------
exports.renderWeekCalendar = (req, res) => {
  const weekOffset = parseInt(req.query.offset || 0); // ✅ เพิ่มชื่อตัวแปรให้ตรง
  const today = new Date();
  const selectedDate = req.query.selectedDate || today.toISOString().split('T')[0];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(today.getDate() + i + weekOffset * 7);
    days.push({
      label: date.toDateString(),
      iso: date.toISOString().split('T')[0],
      isToday: date.toDateString() === today.toDateString()
    });
  }

  // ✅ ส่งค่า weekOffset ไปให้ view ด้วย
  res.render('partials/calendar-bar', { days, selectedDate, weekOffset });
};



// หน้า dentist
exports.viewDentists = async (req, res) => {
  const [rows] = await db.execute(`
    SELECT d.*, u.email FROM dentist d
    JOIN user u ON d.user_id = u.user_id
  `);
  res.render('admin-dentists', { dentists: rows });
};

exports.addDentistForm = (req, res) => {
  res.render('add-dentist');
};

exports.addDentist = async (req, res) => {
  const {
    email, password, fname, lname, dob, idcard,
    specialty, education, address, phone
  } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);
  const [userResult] = await db.execute(
    `INSERT INTO user (email, password, role_id) VALUES (?, ?, 2)`,
    [email, hashedPassword]
  );
  const userId = userResult.insertId;
  await db.execute(
    `INSERT INTO dentist (user_id, fname, lname, dob, idcard, specialty, education, address, phone, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, fname, lname, dob, idcard, specialty, education, address, phone, req.file?.filename || null]
  );
  res.redirect('/admin/dentists');
};

exports.viewDentist = async (req, res) => {
  const id = req.params.id;
  const [rows] = await db.execute(`
    SELECT d.*, u.email FROM dentist d
    JOIN user u ON d.user_id = u.user_id WHERE d.dentist_id = ?
  `, [id]);
  res.render('view-dentist', { dentist: rows[0] });
};

exports.editDentistForm = async (req, res) => {
  const id = req.params.id;
  const [rows] = await db.execute(`
    SELECT d.*, u.email FROM dentist d
    JOIN user u ON d.user_id = u.user_id
    WHERE d.dentist_id = ?
  `, [id]);

  if (rows.length === 0) return res.status(404).send('Dentist not found');

  // ✅ แปลง dob เป็น Date object ถ้ามีค่า
  const dentist = rows[0];
  if (dentist.dob) {
    dentist.dob = new Date(dentist.dob);
  }

  res.render('edit-dentist', { dentist });
};



exports.editDentist = async (req, res) => {
  const id = req.params.id;

  // ป้องกัน req.body เป็น undefined
  if (!req.body) return res.status(400).send('No form data submitted.');

  const {
    email = '',
    password = '',
    fname = '',
    lname = '',
    dob = '',
    idcard = '',
    specialty = '',
    education = '',
    address = '',
    phone = ''
  } = req.body;

  try {
    const [dentistRow] = await db.execute(`SELECT user_id FROM dentist WHERE dentist_id = ?`, [id]);
    if (dentistRow.length === 0) return res.status(404).send('Dentist not found');

    const userId = dentistRow[0].user_id;

    // เตรียมคำสั่งและพารามิเตอร์สำหรับ user
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await db.execute(
        `UPDATE user SET email = ?, password = ? WHERE user_id = ?`,
        [email, hashed, userId]
      );
    } else {
      await db.execute(
        `UPDATE user SET email = ? WHERE user_id = ?`,
        [email, userId]
      );
    }

    // เตรียมคำสั่งและพารามิเตอร์สำหรับ dentist
    const sql = `
      UPDATE dentist SET
        fname = ?, lname = ?, dob = ?, idcard = ?,
        specialty = ?, education = ?, address = ?, phone = ?
        ${req.file ? ', photo = ?' : ''}
      WHERE dentist_id = ?
    `;

    const values = req.file
      ? [fname, lname, dob, idcard, specialty, education, address, phone, req.file.filename, id]
      : [fname, lname, dob, idcard, specialty, education, address, phone, id];

    await db.execute(sql, values);

    res.redirect('/admin/dentists');
  } catch (err) {
    console.error('Edit dentist error:', err);
    res.status(500).send('Server error during update.');
  }
};


exports.deleteDentist = async (req, res) => {
  const id = req.params.id;
  try {
    await db.execute('DELETE FROM dentist WHERE dentist_id = ?', [id]);
    req.flash('success', 'Dentist deleted successfully.');
    res.redirect('/admin/dentists');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};


exports.dentistSchedule = (req, res) => {
  const id = req.params.id;
  res.render('dentist-schedule', { dentistId: id });
};


// patients
exports.getPatients = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
      FROM patient
    `);
    res.render('admin-patients', { patients: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load patients');
  }
};


// แสดงฟอร์มเพิ่ม patient
exports.showAddPatientForm = (req, res) => {
  res.render('add-patient');
};
exports.listPatients = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
      FROM patient
    `);
    res.render('admin-patients', { patients: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load patients');
  }
};

// เพิ่ม patient
exports.addPatient = async (req, res) => {
  const { fname, lname, dob, phone, address } = req.body;
  if (!fname || !lname) return res.status(400).send('Missing required fields');
  try {
    await db.execute(`
      INSERT INTO patient (fname, lname, dob, phone, address)
      VALUES (?, ?, ?, ?, ?)`,
      [fname, lname, dob || null, phone || '', address || '']
    );
    req.flash('success', 'Patient added successfully.');
    res.redirect('/admin/patients');
  } catch (err) {
    console.error('Add patient error:', err);
    res.status(500).send('Server error while adding patient');
  }
};

// แสดงฟอร์มแก้ไข patient
exports.showEditPatientForm = async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.execute(`
      SELECT p.*, u.email
      FROM patient p
      JOIN user u ON p.user_id = u.user_id
      WHERE p.patient_id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).send('Patient not found');

    const patient = rows[0];
    if (patient.dob) {
      patient.dob = new Date(patient.dob).toISOString().split('T')[0];
    }

    res.render('edit-patient', { patient });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading patient for edit');
  }
};


// อัปเดตข้อมูล patient
exports.editPatient = async (req, res) => {
  const id = req.params.id;
  const { fname, lname, dob, phone, address } = req.body;

  try {
    await db.execute(`
      UPDATE patient
      SET fname = ?, lname = ?, dob = ?, phone = ?, address = ?
      WHERE patient_id = ?`,
      [fname, lname, dob || null, phone || '', address || '', id]
    );
    req.flash('success', 'Patient updated successfully.');
    res.redirect('/admin/patients');
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).send('Error updating patient');
  }
};

// ดูรายละเอียด patient
exports.viewPatient = async (req, res) => {
  const id = req.params.id;

  try {
    const [rows] = await db.execute(`
      SELECT p.*, u.email
      FROM patient p
      JOIN user u ON p.user_id = u.user_id
      WHERE p.patient_id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).send('Patient not found');

    res.render('view-patient', { patient: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};


// ลบ patient
exports.deletePatient = async (req, res) => {
  const id = req.params.id;
  console.log('🧨 DELETE PATIENT ID:', id); // สำหรับ debug

  try {
    // ลบข้อมูลใน queue ที่อ้างอิงถึง patient นี้
    await db.execute('DELETE FROM queue WHERE patient_id = ?', [id]);

    // จากนั้นลบ patient
    await db.execute('DELETE FROM patient WHERE patient_id = ?', [id]);

    req.flash('success', 'Patient deleted successfully.');
    res.redirect('/admin/patients');
  } catch (err) {
    console.error('❌ Error while deleting:', err);
    res.status(500).send('Error deleting patient');
  }
};

// ----Treatment History----

exports.viewPatientTreatmentHistory = async (req, res) => {
  const id = req.params.id;

  try {
    const [rows] = await db.execute(`
      SELECT qd.date, t.treatment_name, q.queue_id
      FROM queuedetail qd
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.patient_id = ?
      ORDER BY qd.date DESC
    `, [id]);

    const groupedHistory = {};

    rows.forEach(row => {
      const dateObj = new Date(row.date);
      const year = dateObj.getFullYear();
      const day = dateObj.getDate();
      const month = dateObj.toLocaleString('default', { month: 'short' });

      if (!groupedHistory[year]) groupedHistory[year] = [];
      groupedHistory[year].push({
        date: dateObj.toISOString().split('T')[0],
        day,
        month,
        treatment: row.treatment_name,
        queueId: row.queue_id
      });
    });

    res.render('patient-treatments', {
      groupedHistory,
      patientId: id
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};


exports.viewTreatmentDetails = async (req, res) => {
  const { id, queueId } = req.params;

  try {
    const [rows] = await db.execute(`
      SELECT 
        q.queue_id,
        qd.date,
        t.treatment_name,
        d.fname AS dentist_name,
        th.diagnosis,
        th.followUpdate
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [queueId, id]);

    if (rows.length === 0) return res.status(404).send('Treatment detail not found');

    const detail = rows[0];
    const dateObj = new Date(detail.date);
    detail.formattedDate = dateObj.toLocaleDateString('en-GB'); // ex: 11/04/2025
    detail.formattedTime = dateObj.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    res.render('treatment-detail', { detail, patientId: id });

  } catch (err) {
    console.error('Error fetching treatment details:', err);
    res.status(500).send('Server error');
  }
};



// ---treatments
exports.listTreatments = async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM treatment ORDER BY treatment_name ASC`);
    res.render('admin-treatments', { treatments: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading treatments');
  }
};

exports.viewTreatment = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(`
      SELECT 
        t.treatment_name AS name,
        t.duration,
        GROUP_CONCAT(CONCAT(d.fname, ' ', d.lname) SEPARATOR ', ') AS dentists
      FROM treatment t
      LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
      LEFT JOIN dentist d ON dt.dentist_id = d.dentist_id
      WHERE t.treatment_id = ?
      GROUP BY t.treatment_id
    `, [id]);

    if (rows.length === 0) return res.status(404).send('Treatment not found');

    const treatment = rows[0];
    res.render('view-treatment', { treatment });

  } catch (err) {
    console.error('Error fetching treatment:', err);
    res.status(500).send('Server error');
  }
};

exports.showAddTreatmentForm = async (req, res) => {
  try {
    const [dentists] = await db.execute('SELECT dentist_id, fname, lname FROM dentist');
    res.render('add-treatment', { dentists });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dentists');
  }
};
exports.addTreatment = async (req, res) => {
  const { name, duration, dentist_id } = req.body;
  try {
    // เพิ่ม treatment
    const [result] = await db.execute(
      `INSERT INTO treatment (treatment_name, duration) VALUES (?, ?)`,
      [name, duration]
    );

    const treatmentId = result.insertId;

    // เชื่อมกับ dentist ในตารางสัมพันธ์ (กรณีใช้ many-to-many)
    await db.execute(
      `INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)`,
      [dentist_id, treatmentId]
    );

    req.flash('success', 'Treatment added successfully.');
    res.redirect('/admin/treatments');
  } catch (err) {
    console.error('Error adding treatment:', err);
    res.status(500).send('Error adding treatment');
  }
};


// แสดงฟอร์มแก้ไข treatment
// exports.showEditTreatmentForm = async (req, res) => {
//   const treatmentId = req.params.id;

//   try {
//     const [treatmentRows] = await db.execute('SELECT * FROM treatment WHERE treatment_id = ?', [treatmentId]);
//     const [dentistRows] = await db.execute('SELECT dentist_id, fname, lname FROM dentist');

//     if (treatmentRows.length === 0) {
//       return res.status(404).send('Treatment not found');
//     }

//     res.render('edit-treatment', {
//       treatment: treatmentRows[0],
//       dentists: dentistRows
//     });

//   } catch (err) {
//     console.error('Error fetching treatment:', err);
//     res.status(500).send('Internal Server Error');
//   }
// };
exports.showEditTreatmentForm = async (req, res) => {
  const treatmentId = req.params.id;

  try {
    const [treatmentRows] = await db.execute('SELECT * FROM treatment WHERE treatment_id = ?', [treatmentId]);
    const [dentistRows] = await db.execute('SELECT dentist_id, fname, lname FROM dentist');
    const [mappedRows] = await db.execute('SELECT dentist_id FROM dentist_treatment WHERE treatment_id = ?', [treatmentId]);

    if (treatmentRows.length === 0) {
      return res.status(404).send('Treatment not found');
    }

    // เตรียม array ของ dentist_id ที่เคยเชื่อม
    const dentistIds = mappedRows.map(row => row.dentist_id);
    const treatment = treatmentRows[0];
    treatment.dentist_ids = dentistIds;

    res.render('edit-treatment', {
      treatment,
      dentists: dentistRows
    });

  } catch (err) {
    console.error('Error fetching treatment:', err);
    res.status(500).send('Internal Server Error');
  }
};



// บันทึกการแก้ไข treatment
// exports.updateTreatment = async (req, res) => {
//   const treatmentId = req.params.id;
//   const { treatment_name, duration } = req.body;

//   try {
//     await db.execute(
//       'UPDATE treatment SET treatment_name = ?, duration = ? WHERE treatment_id = ?',
//       [treatment_name, duration, treatmentId]
//     );

//     // TODO: ถ้าต้องการอัปเดต dentist_treatment ให้เพิ่ม logic ที่นี่

//     res.redirect('/admin/treatments');
//   } catch (err) {
//     console.error('Error updating treatment:', err);
//     res.status(500).send('Failed to update treatment');
//   }
// };
exports.updateTreatment = async (req, res) => {
  const treatmentId = req.params.id;
  const { treatment_name, duration, dentist_ids } = req.body;

  try {
    // อัปเดตตาราง treatment
    await db.execute(
      'UPDATE treatment SET treatment_name = ?, duration = ? WHERE treatment_id = ?',
      [treatment_name, duration, treatmentId]
    );

    // ลบ dentist ที่เคยผูกไว้กับ treatment นี้
    await db.execute(
      'DELETE FROM dentist_treatment WHERE treatment_id = ?',
      [treatmentId]
    );

    // เพิ่ม dentist ใหม่ที่ถูกเลือก
    if (Array.isArray(dentist_ids)) {
      for (const dentistId of dentist_ids) {
        await db.execute(
          'INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)',
          [dentistId, treatmentId]
        );
      }
    } else if (dentist_ids) {
      // กรณีเลือกมาแค่คนเดียว (ไม่เป็น array)
      await db.execute(
        'INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)',
        [dentist_ids, treatmentId]
      );
    }

    req.flash('success', 'Treatment updated successfully.');
    res.redirect('/admin/treatments');
  } catch (err) {
    console.error('Error updating treatment:', err);
    res.status(500).send('Failed to update treatment');
  }
};

exports.deleteTreatment = async (req, res) => {
  const treatmentId = req.params.id;
  try {
    await db.execute('DELETE FROM treatment WHERE treatment_id = ?', [treatmentId]);
    res.redirect('/admin/treatments');
  } catch (error) {
    console.error('Delete Treatment Error:', error);
    res.status(500).send('Internal Server Error');
  }
};
