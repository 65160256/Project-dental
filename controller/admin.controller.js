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

// Dashboard
exports.getDashboard = async (req, res) => {
  try {
    // ดึงข้อมูลตารางเวลาของทันตแพทย์ทั้งหมด
    const [scheduleData] = await db.execute(`
      SELECT 
        ds.schedule_date,
        ds.hour,
        ds.start_time,
        ds.end_time,
        ds.status,
        ds.note,
        d.fname,
        d.lname,
        d.specialty,
        COUNT(q.queue_id) as appointment_count
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY
        AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY
      GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.fname, d.lname, d.specialty
      ORDER BY ds.schedule_date, ds.hour
    `);

    // จัดรูปแบบข้อมูลสำหรับ FullCalendar
    const events = [];
    
    // Group schedules by dentist and date
    const groupedSchedules = {};
    
    scheduleData.forEach(schedule => {
      const dateKey = schedule.schedule_date.toISOString().split('T')[0];
      const dentistKey = `${schedule.fname} ${schedule.lname}`;
      
      if (!groupedSchedules[dateKey]) {
        groupedSchedules[dateKey] = {};
      }
      
      if (!groupedSchedules[dateKey][dentistKey]) {
        groupedSchedules[dateKey][dentistKey] = {
          dentist: dentistKey,
          specialty: schedule.specialty,
          schedules: [],
          hasAppointments: false
        };
      }
      
      groupedSchedules[dateKey][dentistKey].schedules.push(schedule);
      
      if (schedule.appointment_count > 0) {
        groupedSchedules[dateKey][dentistKey].hasAppointments = true;
      }
    });

    // Create events for FullCalendar
    Object.keys(groupedSchedules).forEach(date => {
      Object.keys(groupedSchedules[date]).forEach(dentistName => {
        const dentistData = groupedSchedules[date][dentistName];
        
        if (dentistData.schedules.length === 0) return;
        
        // Sort schedules by hour
        dentistData.schedules.sort((a, b) => a.hour - b.hour);
        
        // Group continuous working hours
        const workingBlocks = [];
        let currentBlock = null;
        
        dentistData.schedules.forEach(schedule => {
          if (schedule.status === 'dayoff') {
            if (currentBlock) {
              workingBlocks.push(currentBlock);
              currentBlock = null;
            }
            workingBlocks.push({
              type: 'dayoff',
              start: schedule.start_time,
              end: schedule.end_time,
              note: schedule.note
            });
          } else {
            if (!currentBlock) {
              currentBlock = {
                type: 'working',
                start: schedule.start_time,
                end: schedule.end_time,
                hasAppointments: schedule.appointment_count > 0
              };
            } else {
              currentBlock.end = schedule.end_time;
              if (schedule.appointment_count > 0) {
                currentBlock.hasAppointments = true;
              }
            }
          }
        });
        
        if (currentBlock) {
          workingBlocks.push(currentBlock);
        }
        
        // Create FullCalendar events
        workingBlocks.forEach(block => {
          if (block.type === 'dayoff') {
            events.push({
              title: `Dr. ${dentistName}\nDay Off`,
              start: date,
              color: '#f5f5f5',
              textColor: '#999',
              borderColor: '#ddd'
            });
          } else {
            const startTime = block.start.substring(0, 5); // HH:MM
            const endTime = block.end.substring(0, 5);
            
            events.push({
              title: `Dr. ${dentistName}\n${startTime}-${endTime}${block.hasAppointments ? ' (Has Appointments)' : ''}`,
              start: date,
              color: block.hasAppointments ? '#fce4ec' : '#e8f5e8',
              textColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
              borderColor: block.hasAppointments ? '#c2185b' : '#2e7d32'
            });
          }
        });
      });
    });

    res.render('admin-dashboard', { events: JSON.stringify(events) });
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.render('admin-dashboard', { events: JSON.stringify([]) });
  }
};

exports.getScheduleAPI = async (req, res) => {
  try {
    const { start, end } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (start && end) {
      whereClause = 'WHERE ds.schedule_date BETWEEN ? AND ?';
      params = [start, end];
    } else {
      whereClause = `WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY 
                     AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY`;
    }

    const [scheduleData] = await db.execute(`
      SELECT 
        ds.schedule_date,
        ds.hour,
        ds.start_time,
        ds.end_time,
        ds.status,
        ds.note,
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        COUNT(q.queue_id) as appointment_count
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      ${whereClause}
      GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY ds.schedule_date, ds.hour
    `, params);

    // จัดรูปแบบข้อมูลสำหรับ FullCalendar
    const events = [];
    
    // Group schedules by dentist and date
    const groupedSchedules = {};
    
    scheduleData.forEach(schedule => {
      const dateKey = schedule.schedule_date.toISOString().split('T')[0];
      const dentistKey = `${schedule.fname}_${schedule.lname}_${schedule.dentist_id}`;
      
      if (!groupedSchedules[dateKey]) {
        groupedSchedules[dateKey] = {};
      }
      
      if (!groupedSchedules[dateKey][dentistKey]) {
        groupedSchedules[dateKey][dentistKey] = {
          dentist: `${schedule.fname} ${schedule.lname}`,
          specialty: schedule.specialty,
          schedules: [],
          hasAppointments: false
        };
      }
      
      groupedSchedules[dateKey][dentistKey].schedules.push(schedule);
      
      if (schedule.appointment_count > 0) {
        groupedSchedules[dateKey][dentistKey].hasAppointments = true;
      }
    });

    // Create events for FullCalendar
    Object.keys(groupedSchedules).forEach(date => {
      Object.keys(groupedSchedules[date]).forEach(dentistKey => {
        const dentistData = groupedSchedules[date][dentistKey];
        
        if (dentistData.schedules.length === 0) return;
        
        // Sort schedules by hour
        dentistData.schedules.sort((a, b) => a.hour - b.hour);
        
        // Group continuous working hours
        const workingBlocks = [];
        let currentBlock = null;
        
        dentistData.schedules.forEach(schedule => {
          if (schedule.status === 'dayoff') {
            if (currentBlock) {
              workingBlocks.push(currentBlock);
              currentBlock = null;
            }
            workingBlocks.push({
              type: 'dayoff',
              start: schedule.start_time,
              end: schedule.end_time,
              note: schedule.note
            });
          } else {
            if (!currentBlock) {
              currentBlock = {
                type: 'working',
                start: schedule.start_time,
                end: schedule.end_time,
                hasAppointments: schedule.appointment_count > 0,
                appointmentCount: schedule.appointment_count
              };
            } else {
              currentBlock.end = schedule.end_time;
              if (schedule.appointment_count > 0) {
                currentBlock.hasAppointments = true;
                currentBlock.appointmentCount += schedule.appointment_count;
              }
            }
          }
        });
        
        if (currentBlock) {
          workingBlocks.push(currentBlock);
        }
        
        // Create FullCalendar events
        workingBlocks.forEach(block => {
          if (block.type === 'dayoff') {
            events.push({
              id: `dayoff_${dentistKey}_${date}`,
              title: `Dr. ${dentistData.dentist}\nDay Off`,
              start: date,
              color: '#f5f5f5',
              textColor: '#999',
              borderColor: '#ddd',
              extendedProps: {
                type: 'dayoff',
                dentist: dentistData.dentist,
                note: block.note
              }
            });
          } else {
            const startTime = block.start.substring(0, 5); // HH:MM
            const endTime = block.end.substring(0, 5);
            
            const appointmentText = block.hasAppointments 
              ? ` (${block.appointmentCount} appointment${block.appointmentCount > 1 ? 's' : ''})` 
              : '';
            
            events.push({
              id: `work_${dentistKey}_${date}`,
              title: `Dr. ${dentistData.dentist}\n${startTime}-${endTime}${appointmentText}`,
              start: date,
              color: block.hasAppointments ? '#fce4ec' : '#e8f5e8',
              textColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
              borderColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
              extendedProps: {
                type: 'working',
                dentist: dentistData.dentist,
                specialty: dentistData.specialty,
                startTime: startTime,
                endTime: endTime,
                hasAppointments: block.hasAppointments,
                appointmentCount: block.appointmentCount || 0
              }
            });
          }
        });
      });
    });

    res.json({
      success: true,
      events: events
    });
    
  } catch (error) {
    console.error('Error loading schedule API:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load schedule data',
      events: []
    });
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

// ==================== Notifications Functions ====================

// Get all notifications for admin
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = 'false' } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (unread_only === 'true') {
      whereClause = 'WHERE is_read = 0';
    }
    
    const [notifications] = await db.execute(`
      SELECT 
        n.id,
        n.type,
        n.title,
        n.message,
        n.is_read,
        n.is_new,
        n.appointment_id,
        n.dentist_id,
        n.patient_id,
        n.created_at,
        p.fname as patient_fname,
        p.lname as patient_lname,
        d.fname as dentist_fname,
        d.lname as dentist_lname
      FROM notifications n
      LEFT JOIN patient p ON n.patient_id = p.patient_id
      LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    // Get total count
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total FROM notifications n ${whereClause}
    `, params);

    const totalCount = countResult[0].total;
    const unreadCount = await getUnreadNotificationCount();

    res.json({
      success: true,
      notifications: notifications,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        unread_count: unreadCount
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load notifications',
      details: error.message
    });
  }
};

// Get single notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [notifications] = await db.execute(`
      SELECT 
        n.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        q.time as appointment_time,
        t.treatment_name
      FROM notifications n
      LEFT JOIN patient p ON n.patient_id = p.patient_id
      LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
      LEFT JOIN queue q ON n.appointment_id = q.queue_id
      LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE n.id = ?
    `, [id]);

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      notification: notifications[0]
    });

  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load notification details',
      details: error.message
    });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.execute(`
      UPDATE notifications 
      SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      details: error.message
    });
  }
};

// Mark all notifications as read
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const [result] = await db.execute(`
      UPDATE notifications 
      SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE is_read = 0
    `);

    res.json({
      success: true,
      message: `${result.affectedRows} notifications marked as read`
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      details: error.message
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.execute('DELETE FROM notifications WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      details: error.message
    });
  }
};

// Create new notification (for testing or manual creation)
exports.createNotification = async (req, res) => {
  try {
    const { 
      type, 
      title, 
      message, 
      appointment_id = null, 
      dentist_id = null, 
      patient_id = null 
    } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Type, title, and message are required'
      });
    }

    const [result] = await db.execute(`
      INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1)
    `, [type, title, message, appointment_id, dentist_id, patient_id]);

    res.json({
      success: true,
      message: 'Notification created successfully',
      notification_id: result.insertId
    });

  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create notification',
      details: error.message
    });
  }
};

// Helper function to get unread notification count
async function getUnreadNotificationCount() {
  try {
    const [result] = await db.execute('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0');
    return result[0].count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}

// ==================== Utility Functions for Notifications ====================

// Create notification when new appointment is made
async function createAppointmentNotification(appointmentId, patientId, dentistId) {
  try {
    // Get patient and dentist names
    const [patientData] = await db.execute('SELECT fname, lname FROM patient WHERE patient_id = ?', [patientId]);
    const [dentistData] = await db.execute('SELECT fname, lname FROM dentist WHERE dentist_id = ?', [dentistId]);
    
    if (patientData.length > 0 && dentistData.length > 0) {
      const patient = patientData[0];
      const dentist = dentistData[0];
      
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment',
        'New Appointment Request',
        `Appointment from: ${patient.fname} ${patient.lname} with Dr. ${dentist.fname} ${dentist.lname}`,
        appointmentId,
        dentistId,
        patientId
      ]);
    }
  } catch (error) {
    console.error('Error creating appointment notification:', error);
  }
}

// Create notification when appointment is cancelled
async function createCancellationNotification(appointmentId, patientId, dentistId) {
  try {
    const [patientData] = await db.execute('SELECT fname, lname FROM patient WHERE patient_id = ?', [patientId]);
    const [dentistData] = await db.execute('SELECT fname, lname FROM dentist WHERE dentist_id = ?', [dentistId]);
    
    if (patientData.length > 0 && dentistData.length > 0) {
      const patient = patientData[0];
      const dentist = dentistData[0];
      
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'cancellation',
        'Appointment Cancelled',
        `${patient.fname} ${patient.lname} cancelled appointment with Dr. ${dentist.fname} ${dentist.lname}`,
        appointmentId,
        dentistId,
        patientId
      ]);
    }
  } catch (error) {
    console.error('Error creating cancellation notification:', error);
  }
}

// Create notification when dentist updates schedule
async function createScheduleUpdateNotification(dentistId, date, action) {
  try {
    const [dentistData] = await db.execute('SELECT fname, lname FROM dentist WHERE dentist_id = ?', [dentistId]);
    
    if (dentistData.length > 0) {
      const dentist = dentistData[0];
      
      await db.execute(`
        INSERT INTO notifications (type, title, message, dentist_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'schedule_update',
        'Schedule Updated',
        `Dr. ${dentist.fname} ${dentist.lname} ${action} schedule for ${date}`,
        dentistId
      ]);
    }
  } catch (error) {
    console.error('Error creating schedule update notification:', error);
  }
}

// Export utility functions for use in other controllers
module.exports.notificationUtils = {
  createAppointmentNotification,
  createCancellationNotification,
  createScheduleUpdateNotification,
  getUnreadNotificationCount
};

// Get appointments for a specific date
exports.getAppointmentsAPI = async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        p.phone,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        t.treatment_name,
        t.duration as treatment_duration
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE DATE(q.time) = ?
      ORDER BY q.time ASC
    `, [date]);

    res.json({
      success: true,
      appointments: appointments,
      date: date,
      total_count: appointments.length
    });

  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load appointments',
      details: error.message
    });
  }
};

// Get single appointment details
exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [appointments] = await db.execute(`
      SELECT 
        q.*,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        p.phone,
        p.dob as patient_dob,
        p.address as patient_address,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        t.treatment_name,
        t.duration as treatment_duration,
        th.diagnosis as treatment_diagnosis,
        th.followUpdate as follow_update
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ?
    `, [id]);

    if (appointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    res.json({
      success: true,
      appointment: appointments[0]
    });

  } catch (error) {
    console.error('Error fetching appointment details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load appointment details',
      details: error.message
    });
  }
};

// Update appointment status
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, diagnosis, next_appointment } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'confirm', 'cancel'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: pending, confirm, or cancel'
      });
    }

    // Update appointment
    const [result] = await db.execute(`
      UPDATE queue 
      SET queue_status = ?, diagnosis = ?, next_appointment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE queue_id = ?
    `, [status, diagnosis || null, next_appointment || null, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Create notification for status change
    if (status === 'cancel') {
      await createAppointmentStatusNotification(id, 'cancelled');
    } else if (status === 'confirm') {
      await createAppointmentStatusNotification(id, 'confirmed');
    }

    res.json({
      success: true,
      message: 'Appointment status updated successfully'
    });

  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment status',
      details: error.message
    });
  }
};

// Create new appointment
exports.createAppointment = async (req, res) => {
  try {
    const { 
      patient_id, 
      treatment_id, 
      dentist_id, 
      appointment_time, 
      notes 
    } = req.body;

    // Validate required fields
    if (!patient_id || !treatment_id || !dentist_id || !appointment_time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: patient_id, treatment_id, dentist_id, appointment_time'
      });
    }

    // Check if dentist is available at the requested time
    const appointmentDate = new Date(appointment_time);
    const dateStr = appointmentDate.toISOString().split('T')[0];
    const hour = appointmentDate.getHours();

    const [scheduleCheck] = await db.execute(`
      SELECT COUNT(*) as schedule_exists
      FROM dentist_schedule 
      WHERE dentist_id = ? AND schedule_date = ? AND hour = ? AND status = 'working'
    `, [dentist_id, dateStr, hour]);

    if (scheduleCheck[0].schedule_exists === 0) {
      return res.status(400).json({
        success: false,
        error: 'Dentist is not available at the requested time'
      });
    }

    // Check for existing appointments at the same time
    const [existingAppointment] = await db.execute(`
      SELECT COUNT(*) as appointment_exists
      FROM queue 
      WHERE dentist_id = ? AND time = ? AND queue_status IN ('pending', 'confirm')
    `, [dentist_id, appointment_time]);

    if (existingAppointment[0].appointment_exists > 0) {
      return res.status(400).json({
        success: false,
        error: 'Time slot is already booked'
      });
    }

    // Create queuedetail first
    const [queueDetailResult] = await db.execute(`
      INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [patient_id, treatment_id, dentist_id, dateStr]);

    const queueDetailId = queueDetailResult.insertId;

    // Create queue entry
    const [queueResult] = await db.execute(`
      INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status, diagnosis)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `, [queueDetailId, patient_id, treatment_id, dentist_id, appointment_time, notes || null]);

    const queueId = queueResult.insertId;

    // Create notification (this will be handled by the trigger, but we can also create manually)
    await createAppointmentNotification(queueId, patient_id, dentist_id);

    res.json({
      success: true,
      message: 'Appointment created successfully',
      appointment_id: queueId
    });

  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment',
      details: error.message
    });
  }
};

// Delete appointment
exports.deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get appointment details for notification
    const [appointmentData] = await db.execute(`
      SELECT q.*, p.fname, p.lname, d.fname as dentist_fname, d.lname as dentist_lname
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ?
    `, [id]);

    if (appointmentData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Delete the appointment
    const [result] = await db.execute('DELETE FROM queue WHERE queue_id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Create deletion notification
    const appointment = appointmentData[0];
    await db.execute(`
      INSERT INTO notifications (type, title, message, dentist_id, patient_id, is_read, is_new)
      VALUES (?, ?, ?, ?, ?, 0, 1)
    `, [
      'deletion',
      'Appointment Deleted',
      `Appointment deleted: ${appointment.fname} ${appointment.lname} with Dr. ${appointment.dentist_fname} ${appointment.dentist_lname}`,
      appointment.dentist_id,
      appointment.patient_id
    ]);

    res.json({
      success: true,
      message: 'Appointment deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete appointment',
      details: error.message
    });
  }
};

// Get appointment statistics
exports.getAppointmentStats = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const startDate = start_date || new Date().toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Get total appointments
    const [totalResult] = await db.execute(`
      SELECT COUNT(*) as total FROM queue 
      WHERE DATE(time) BETWEEN ? AND ?
    `, [startDate, endDate]);

    // Get appointments by status
    const [statusResult] = await db.execute(`
      SELECT 
        queue_status,
        COUNT(*) as count
      FROM queue 
      WHERE DATE(time) BETWEEN ? AND ?
      GROUP BY queue_status
    `, [startDate, endDate]);

    // Get appointments by dentist
    const [dentistResult] = await db.execute(`
      SELECT 
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        COUNT(*) as appointment_count
      FROM queue q
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE DATE(q.time) BETWEEN ? AND ?
      GROUP BY q.dentist_id, d.fname, d.lname
      ORDER BY appointment_count DESC
    `, [startDate, endDate]);

    // Get popular treatments
    const [treatmentResult] = await db.execute(`
      SELECT 
        t.treatment_name,
        COUNT(*) as booking_count
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE DATE(q.time) BETWEEN ? AND ?
      GROUP BY q.treatment_id, t.treatment_name
      ORDER BY booking_count DESC
      LIMIT 10
    `, [startDate, endDate]);

    res.json({
      success: true,
      stats: {
        total_appointments: totalResult[0].total,
        by_status: statusResult,
        by_dentist: dentistResult,
        popular_treatments: treatmentResult,
        date_range: { start_date: startDate, end_date: endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching appointment stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load appointment statistics',
      details: error.message
    });
  }
};

// ==================== Helper Functions ====================

// Create appointment status change notification
async function createAppointmentStatusNotification(queueId, action) {
  try {
    const [appointmentData] = await db.execute(`
      SELECT q.*, 
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ?
    `, [queueId]);

    if (appointmentData.length > 0) {
      const appointment = appointmentData[0];
      
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'status_change',
        `Appointment ${action}`,
        `${appointment.patient_name}'s appointment with Dr. ${appointment.dentist_name} has been ${action}`,
        queueId,
        appointment.dentist_id,
        appointment.patient_id
      ]);
    }
  } catch (error) {
    console.error('Error creating status notification:', error);
  }
}

// Enhanced appointment notification creation
async function createAppointmentNotification(queueId, patientId, dentistId) {
  try {
    const [patientData] = await db.execute('SELECT fname, lname FROM patient WHERE patient_id = ?', [patientId]);
    const [dentistData] = await db.execute('SELECT fname, lname FROM dentist WHERE dentist_id = ?', [dentistId]);
    
    if (patientData.length > 0 && dentistData.length > 0) {
      const patient = patientData[0];
      const dentist = dentistData[0];
      
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment',
        'New Appointment Request',
        `New appointment from: ${patient.fname} ${patient.lname} with Dr. ${dentist.fname} ${dentist.lname}`,
        queueId,
        dentistId,
        patientId
      ]);
    }
  } catch (error) {
    console.error('Error creating appointment notification:', error);
  }
}

// ==================== Dentists API Routes ====================

// API: Get all dentists for the modern interface
exports.getDentistsAPI = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        d.dentist_id,
        d.fname,
        d.lname,
        d.phone,
        d.specialty,
        d.education,
        d.address,
        d.dob,
        d.idcard,
        d.photo,
        u.email,
        u.last_login,
        COUNT(DISTINCT ds.schedule_id) as total_schedules,
        COUNT(DISTINCT q.queue_id) as total_appointments
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      LEFT JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id AND ds.schedule_date >= CURDATE()
      LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('pending', 'confirm')
      GROUP BY d.dentist_id, d.fname, d.lname, d.phone, d.specialty, d.education, d.address, d.dob, d.idcard, d.photo, u.email, u.last_login
      ORDER BY d.fname, d.lname
    `);

    // Format the data for the frontend
    const dentists = rows.map(dentist => ({
      dentist_id: dentist.dentist_id,
      fname: dentist.fname,
      lname: dentist.lname,
      email: dentist.email,
      phone: dentist.phone,
      specialty: dentist.specialty,
      education: dentist.education,
      address: dentist.address,
      dob: dentist.dob,
      idcard: dentist.idcard,
      photo: dentist.photo,
      last_login: dentist.last_login,
      stats: {
        total_schedules: dentist.total_schedules,
        total_appointments: dentist.total_appointments
      }
    }));

    res.json({
      success: true,
      dentists: dentists,
      total_count: dentists.length
    });

  } catch (error) {
    console.error('Error fetching dentists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dentists',
      details: error.message
    });
  }
};

// API: Get single dentist details
exports.getDentistByIdAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await db.execute(`
      SELECT 
        d.*,
        u.email,
        u.last_login,
        COUNT(DISTINCT ds.schedule_id) as total_schedules,
        COUNT(DISTINCT q.queue_id) as total_appointments
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      LEFT JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id AND ds.schedule_date >= CURDATE()
      LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('pending', 'confirm')
      WHERE d.dentist_id = ?
      GROUP BY d.dentist_id
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }

    res.json({
      success: true,
      dentist: rows[0]
    });

  } catch (error) {
    console.error('Error fetching dentist details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dentist details',
      details: error.message
    });
  }
};

// API: Delete dentist
exports.deleteDentistAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get dentist details before deletion for notification
    const [dentistData] = await db.execute(`
      SELECT d.*, u.email 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.dentist_id = ?
    `, [id]);

    if (dentistData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }

    const dentist = dentistData[0];
    
    // Start transaction to ensure data integrity
    await db.execute('START TRANSACTION');
    
    try {
      // Delete related schedules first (due to foreign key constraints)
      await db.execute('DELETE FROM dentist_schedule WHERE dentist_id = ?', [id]);
      
      // Update any existing appointments to cancelled status instead of deleting
      await db.execute(`
        UPDATE queue 
        SET queue_status = 'cancel' 
        WHERE dentist_id = ? AND queue_status IN ('pending', 'confirm')
      `, [id]);
      
      // Delete dentist-treatment relationships
      await db.execute('DELETE FROM dentist_treatment WHERE dentist_id = ?', [id]);
      
      // Delete the dentist record
      await db.execute('DELETE FROM dentist WHERE dentist_id = ?', [id]);
      
      // Delete the associated user account
      await db.execute('DELETE FROM user WHERE user_id = ?', [dentist.user_id]);
      
      // Commit transaction
      await db.execute('COMMIT');
      
      // Create notification for deletion
      await db.execute(`
        INSERT INTO notifications (type, title, message, is_read, is_new)
        VALUES (?, ?, ?, 0, 1)
      `, [
        'system',
        'Dentist Account Deleted',
        `Dr. ${dentist.fname} ${dentist.lname}'s account has been removed from the system`
      ]);

      res.json({
        success: true,
        message: `Dr. ${dentist.fname} ${dentist.lname} deleted successfully`
      });

    } catch (error) {
      // Rollback transaction on error
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error deleting dentist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete dentist',
      details: error.message
    });
  }
};

// API: Get dentist specialties for filter dropdown
exports.getDentistSpecialtiesAPI = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT DISTINCT specialty 
      FROM dentist 
      WHERE specialty IS NOT NULL AND specialty != ''
      ORDER BY specialty
    `);

    const specialties = rows.map(row => row.specialty);

    res.json({
      success: true,
      specialties: specialties
    });

  } catch (error) {
    console.error('Error fetching specialties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load specialties',
      details: error.message
    });
  }
};

// API: Get current user profile info for avatar
exports.getCurrentUserAPI = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const [userRows] = await db.execute(`
      SELECT u.email, u.username, r.rname 
      FROM user u 
      JOIN role r ON u.role_id = r.role_id 
      WHERE u.user_id = ?
    `, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      email: userRows[0].email,
      username: userRows[0].username,
      role: userRows[0].rname
    });

  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load user info',
      details: error.message
    });
  }
};