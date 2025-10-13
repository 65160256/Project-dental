const db = require('../config/db');

const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

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
    res.render('admin/profile/admin-profile', { user });

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// -------------------- เปลี่ยนรหัสผ่าน --------------------
// เพิ่ม API endpoint สำหรับ change password
exports.changePassword = async (req, res) => {
  const userId = req.session.userId;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!userId) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized' 
    });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'New password and confirm password do not match.' 
    });
  }

  try {
    const [rows] = await db.execute('SELECT password FROM user WHERE user_id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect.' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, userId]);

    // ลบ session
    req.session.destroy(() => {
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
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

    // Create events for FullCalendar with Thai text
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
        
        // Create FullCalendar events with Thai labels
        workingBlocks.forEach(block => {
          if (block.type === 'dayoff') {
            events.push({
              id: `dayoff_${dentistKey}_${date}`,
              title: `ทพ. ${dentistData.dentist}\nวันหยุด`,
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
            // Format time to 24-hour format
            const startTime = block.start.substring(0, 5); // HH:MM
            const endTime = block.end.substring(0, 5);
            
            const appointmentText = block.hasAppointments 
              ? ` (${block.appointmentCount} นัดหมาย)` 
              : '';
            
            events.push({
              id: `work_${dentistKey}_${date}`,
              title: `ทพ. ${dentistData.dentist}\n${startTime}-${endTime}${appointmentText}`,
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
    console.error('เกิดข้อผิดพลาดในการโหลด API ตารางเวลา:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถโหลดข้อมูลตารางเวลาได้',
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

    res.render('admin/appointment/admin-appointments', {
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
  try {
    res.render('admin/dentists/admin-dentists', { 
      title: 'จัดการทันตแพทย์ - Smile Clinic',
      user: req.session.user || { email: 'admin@clinic.com' }
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการโหลดหน้าทันตแพทย์:', error);
    res.status(500).render('error', { 
      message: 'ไม่สามารถโหลดหน้าทันตแพทย์ได้',
      error: error 
    });
  }
};
exports.addDentistForm = (req, res) => {
  res.render('admin/dentists/add-dentist');
};

exports.addDentist = async (req, res) => {
  console.log('='.repeat(60));
  console.log('ADD DENTIST - START');
  console.log('='.repeat(60));
  console.log('Form data received:', req.body);
  console.log('File uploaded:', req.file);

  // รับข้อมูลและกำหนดค่า default
  const email = req.body.email || '';
  const password = req.body.password || '';
  const fname = req.body.fname || '';
  const lname = req.body.lname || '';
  const dob = req.body.dob || null;
  const id_card = req.body.id_card || '';
  const specialty = req.body.specialty || '';
  const education = req.body.education || '';
  const address = req.body.address || '';
  const phone = req.body.phone || '';

  console.log('Processed data:', {
    email, fname, lname, dob, id_card, specialty, education, address, phone,
    hasPassword: !!password,
    hasFile: !!req.file
  });

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!email || !password || !fname || !lname || !id_card || !specialty || !phone) {
    console.log('Missing required fields');
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    });
  }

  try {
    // ตรวจสอบอีเมลซ้ำก่อน
    console.log('Checking for duplicate email:', email);
    const [existingUser] = await db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
    
    if (existingUser[0].count > 0) {
      console.log('Email already exists:', email);
      
      // ลบไฟล์ที่อัพโหลดแล้ว
      if (req.file) {
        const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
        console.log('Deleting uploaded file:', filePath);
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting uploaded file:', err);
          else console.log('Deleted uploaded file due to email duplicate');
        });
      }
      
      return res.status(400).json({
        success: false,
        error: 'Email address is already in use',
        field: 'email'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // สร้าง user record
    console.log('Creating user record...');
    const [userResult] = await db.execute(
      `INSERT INTO user (email, password, role_id) VALUES (?, ?, 2)`,
      [email, hashedPassword]
    );
    const userId = userResult.insertId;
    console.log('User created with ID:', userId);
    
    // กำหนด photo filename
    let photoFilename = null;
    if (req.file) {
      photoFilename = req.file.filename;
      
      const uploadPath = path.join(__dirname, '../public/uploads', photoFilename);
      console.log('='.repeat(60));
      console.log('FILE UPLOAD DETAILS:');
      console.log('='.repeat(60));
      console.log('  Original name:', req.file.originalname);
      console.log('  Saved name:', photoFilename);
      console.log('  Size:', (req.file.size / 1024).toFixed(2), 'KB');
      console.log('  MIME type:', req.file.mimetype);
      console.log('  Full path:', uploadPath);
      
      // ตรวจสอบว่าไฟล์ถูกบันทึกจริงหรือไม่
      if (fs.existsSync(uploadPath)) {
        const stats = fs.statSync(uploadPath);
        console.log('  File saved: YES');
        console.log('  File size on disk:', stats.size, 'bytes');
        console.log('  Permissions:', stats.mode.toString(8));
      } else {
        console.error('  File saved: NO - File was not written to disk!');
        photoFilename = null; // Reset to null if file doesn't exist
      }
      console.log('='.repeat(60));
    } else {
      console.log('No photo uploaded, using default');
    }
    
    // แปลง empty string เป็น null สำหรับฟิลด์ที่อาจเป็น null
    const dobValue = dob && dob.trim() !== '' ? dob : null;
    const educationValue = education && education.trim() !== '' ? education : null;
    const addressValue = address && address.trim() !== '' ? address : null;
    
    console.log('Creating dentist record with values:', {
      userId, fname, lname, dobValue, id_card, specialty, 
      educationValue, addressValue, phone, photoFilename
    });
    
    // สร้าง dentist record
    await db.execute(
      `INSERT INTO dentist (user_id, fname, lname, dob, id_card, specialty, education, address, phone, photo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, fname, lname, dobValue, id_card, specialty, educationValue, addressValue, phone, photoFilename]
    );
    
    console.log('='.repeat(60));
    console.log('Dentist created successfully');
    console.log('='.repeat(60));
    
    // ส่งกลับ JSON response
    res.json({
      success: true,
      message: 'Dentist added successfully',
      redirect: '/admin/dentists',
      dentist: {
        userId,
        fname,
        lname,
        email,
        photo: photoFilename
      }
    });
    
  } catch (error) {
    console.log('='.repeat(60));
    console.error('ERROR creating dentist:', error);
    console.error('Error details:', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    console.log('='.repeat(60));
    
    // ลบไฟล์ที่อัพโหลดแล้วหากเกิดข้อผิดพลาด
    if (req.file) {
      const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
      console.log('Attempting to delete uploaded file due to error:', filePath);
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
        else console.log('Deleted uploaded file due to error');
      });
    }
    
    // จัดการ error แบบละเอียด
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage && error.sqlMessage.includes('email')) {
        return res.status(400).json({
          success: false,
          error: 'Email address is already in use',
          field: 'email'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create dentist: ' + error.message
    });
  }
};

exports.viewDentist = async (req, res) => {
  const id = req.params.id;
  const [rows] = await db.execute(`
    SELECT d.*, u.email FROM dentist d
    JOIN user u ON d.user_id = u.user_id WHERE d.dentist_id = ?
  `, [id]);
  res.render('admin/dentists/view-dentist', { dentist: rows[0] });
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

  res.render('admin/dentists/edit-dentist', { dentist });
};



// ส่วนของ editDentist function - แก้ไขให้รองรับ license_no
exports.editDentist = async (req, res) => {
  const id = req.params.id;

  if (!req.body) return res.status(400).json({
    success: false,
    error: 'No form data submitted.'
  });

  console.log('📋 Edit form data received:', req.body);
  console.log('📁 New file uploaded:', req.file);

  try {
    const [dentistRow] = await db.execute(`
      SELECT d.*, u.email as current_email 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.dentist_id = ?
    `, [id]);
    
    if (dentistRow.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }

    const currentDentist = dentistRow[0];
    const userId = currentDentist.user_id;
    const oldPhoto = currentDentist.photo;

    // รับค่าจากฟอร์ม
    const email = req.body.email || currentDentist.current_email;
    const password = req.body.password || '';
    const fname = req.body.fname || currentDentist.fname;
    const lname = req.body.lname || currentDentist.lname;
    const specialty = req.body.specialty || currentDentist.specialty;
    const education = req.body.education || currentDentist.education;
    const address = req.body.address || currentDentist.address;
    const phone = req.body.phone || currentDentist.phone;
    const id_card = req.body.id_card || currentDentist.id_card;
    const license_no = req.body.license_no || currentDentist.license_no; // ✅ เพิ่มบรรทัดนี้
    
    // จัดการ dob
    let dob = req.body.dob || currentDentist.dob;
    if (dob instanceof Date) {
      dob = dob.toISOString().split('T')[0];
    } else if (typeof dob === 'string') {
      dob = dob.trim();
    }

    // ตรวจสอบอีเมลซ้ำ
    if (email && email !== currentDentist.current_email) {
      const [existingUser] = await db.execute(
        'SELECT COUNT(*) as count FROM user WHERE email = ? AND user_id != ?', 
        [email, userId]
      );
      
      if (existingUser[0].count > 0) {
        if (req.file) {
          const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
          fs.unlink(filePath, () => {});
        }
        
        return res.status(400).json({
          success: false,
          error: 'Email address is already in use',
          field: 'email'
        });
      }
    }

    // ✅ ตรวจสอบเลขบัตรประชาชนซ้ำ
    if (id_card && id_card !== currentDentist.id_card) {
      const [existingIdCard] = await db.execute(
        'SELECT COUNT(*) as count FROM dentist WHERE id_card = ? AND dentist_id != ?',
        [id_card, id]
      );
      
      if (existingIdCard[0].count > 0) {
        if (req.file) {
          const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
          fs.unlink(filePath, () => {});
        }
        
        return res.status(400).json({
          success: false,
          error: 'ID card number is already in use',
          field: 'id_card'
        });
      }
    }

    // ✅ ตรวจสอบเลขใบอนุญาตซ้ำ
    if (license_no && license_no !== currentDentist.license_no) {
      const [existingLicense] = await db.execute(
        'SELECT COUNT(*) as count FROM dentist WHERE license_no = ? AND dentist_id != ?',
        [license_no, id]
      );
      
      if (existingLicense[0].count > 0) {
        if (req.file) {
          const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
          fs.unlink(filePath, () => {});
        }
        
        return res.status(400).json({
          success: false,
          error: 'License number is already in use',
          field: 'license_no'
        });
      }
    }

    // อัปเดต user table
    let shouldUpdateUser = false;
    let userUpdateQuery = 'UPDATE user SET ';
    let userUpdateParams = [];
    let userUpdateFields = [];

    if (email && email !== currentDentist.current_email) {
      userUpdateFields.push('email = ?');
      userUpdateParams.push(email);
      shouldUpdateUser = true;
    }

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      userUpdateFields.push('password = ?');
      userUpdateParams.push(hashedPassword);
      shouldUpdateUser = true;
    }

    if (shouldUpdateUser) {
      userUpdateQuery += userUpdateFields.join(', ') + ' WHERE user_id = ?';
      userUpdateParams.push(userId);
      
      console.log('👤 Updating user table...');
      await db.execute(userUpdateQuery, userUpdateParams);
      console.log('✅ User table updated');
    }

    // จัดการรูปภาพ
    let photoFilename = oldPhoto;
    
    if (req.file) {
      photoFilename = req.file.filename;
      console.log('✅ New photo uploaded:', photoFilename);
      
      // ลบรูปเก่า
      if (oldPhoto && oldPhoto !== 'default-avatar.png') {
        const oldPhotoPath = path.join(__dirname, '../public/uploads/', oldPhoto);
        fs.unlink(oldPhotoPath, (err) => {
          if (err) console.log('Could not delete old photo:', err.message);
          else console.log('🗑️ Old photo deleted:', oldPhoto);
        });
      }
    }

    const dobValue = dob && dob !== '' && dob !== 'null' ? dob : null;
    const educationValue = education && education.trim() !== '' ? education : null;
    const addressValue = address && address.trim() !== '' ? address : null;

    // ✅ อัปเดต dentist table พร้อม license_no
    console.log('🦷 Updating dentist table...');
    await db.execute(`
      UPDATE dentist SET
        fname = ?, lname = ?, dob = ?, id_card = ?, license_no = ?,
        specialty = ?, education = ?, address = ?, phone = ?, photo = ?
      WHERE dentist_id = ?
    `, [fname, lname, dobValue, id_card, license_no, specialty, educationValue, addressValue, phone, photoFilename, id]);

    console.log('✅ Dentist updated successfully');
    
    res.json({
      success: true,
      message: 'Dentist updated successfully'
    });
    
  } catch (err) {
    console.error('❌ Edit dentist error:', err);
    
    if (req.file) {
      const filePath = path.join(__dirname, '../public/uploads/', req.file.filename);
      fs.unlink(filePath, () => {});
    }
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Duplicate entry detected',
        field: 'unknown'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update dentist: ' + err.message
    });
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
  res.render('admin/dentists/dentist-schedule', { dentistId: id });
};


// patients
exports.getPatients = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
      FROM patient
    `);
    res.render('admin/patient/admin-patients', { patients: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load patients');
  }
};

// API: Get all patients for the modern interface
exports.getPatientsAPI = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        u.email,
        u.last_login,
        MAX(q.time) as last_visit,
        COUNT(DISTINCT q.queue_id) as total_appointments
      FROM patient p
      LEFT JOIN user u ON p.user_id = u.user_id
      LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
      GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address, p.id_card, u.email, u.last_login
      ORDER BY p.fname, p.lname
    `);

    // Format the data for the frontend
    const patients = rows.map(patient => ({
      patient_id: patient.patient_id,
      fname: patient.fname,
      lname: patient.lname,
      phone: patient.phone,
      dob: patient.dob,
      address: patient.address,
      id_card: patient.id_card,
      email: patient.email,
      last_login: patient.last_login,
      last_visit: patient.last_visit,
      stats: {
        total_appointments: patient.total_appointments
      }
    }));

    res.json({
      success: true,
      patients: patients,
      total_count: patients.length
    });

  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load patients',
      details: error.message
    });
  }
};

// API: Get single patient details
exports.getPatientByIdAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await db.execute(`
      SELECT 
        p.*,
        u.email,
        u.last_login,
        COUNT(DISTINCT q.queue_id) as total_appointments,
        MAX(q.time) as last_visit
      FROM patient p
      LEFT JOIN user u ON p.user_id = u.user_id
      LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
      WHERE p.patient_id = ?
      GROUP BY p.patient_id
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = rows[0];
    
    res.json({
      success: true,
      patient: patient
    });

  } catch (error) {
    console.error('Error fetching patient details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load patient details',
      details: error.message
    });
  }
};

// API: Delete patient
exports.deletePatientAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get patient details before deletion for notification
    const [patientData] = await db.execute(`
      SELECT p.*, u.email 
      FROM patient p 
      LEFT JOIN user u ON p.user_id = u.user_id 
      WHERE p.patient_id = ?
    `, [id]);

    if (patientData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = patientData[0];
    
    // Start transaction to ensure data integrity
    await db.query('START TRANSACTION');
    
    try {
      // Update any existing appointments to cancelled status instead of deleting
      await db.execute(`
        UPDATE queue 
        SET queue_status = 'cancel' 
        WHERE patient_id = ? AND queue_status IN ('pending', 'confirm')
      `, [id]);
      
      // Delete treatment history first
      await db.execute(`
        DELETE th FROM treatmentHistory th
        JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
        WHERE qd.patient_id = ?
      `, [id]);
      
      // Delete queue details
      await db.execute('DELETE FROM queuedetail WHERE patient_id = ?', [id]);
      
      // Delete the patient record
      await db.execute('DELETE FROM patient WHERE patient_id = ?', [id]);
      
      // Delete the associated user account if exists
      if (patient.user_id) {
        await db.execute('DELETE FROM user WHERE user_id = ?', [patient.user_id]);
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      // Create notification for deletion
      await db.execute(`
        INSERT INTO notifications (type, title, message, is_read, is_new)
        VALUES (?, ?, ?, 0, 1)
      `, [
        'patient',
        'Patient Record Deleted',
        `Patient ${patient.fname || 'Unknown'} ${patient.lname || 'Patient'} has been removed from the system`
      ]);

      res.json({
        success: true,
        message: `${patient.fname || 'Unknown'} ${patient.lname || 'Patient'} deleted successfully`
      });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error deleting patient:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete patient',
      details: error.message
    });
  }
};

// แสดงฟอร์มเพิ่ม patient
exports.showAddPatientForm = (req, res) => {
  res.render('admin/patient/add-patient');
};

// Updated addPatient function to handle the new form structure
exports.addPatient = async (req, res) => {
  console.log('📥 Request body:', req.body);
  
  const { 
    fname, lname, dob, id_card, email, password, phone, address, 
    gender, chronic_disease, drug_allergy  // ✅ เพิ่มฟิลด์ใหม่
  } = req.body;
  
  // Validate required fields
  if (!fname || !lname || !dob || !id_card || !email || !password || !phone) {
    console.log('❌ Missing required fields');
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: fname, lname, dob, id_card, email, password, phone are required'
    });
  }

  try {
    // Check if email already exists
    const [existingUser] = await db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
    if (existingUser[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email address is already in use'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.query('START TRANSACTION');
    
    try {
      // Create user record first (role_id = 3 for patients)
      const [userResult] = await db.execute(
        `INSERT INTO user (email, password, role_id) VALUES (?, ?, 3)`,
        [email, hashedPassword]
      );
      const userId = userResult.insertId;
      
      // ✅ Create patient record with new fields
      const [patientResult] = await db.execute(`
        INSERT INTO patient (
          user_id, fname, lname, dob, id_card, phone, address,
          gender, chronic_disease, allergy_history
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, fname, lname, dob, id_card, phone, address || '',
          gender || null,
          chronic_disease || null,
          drug_allergy || null  // ✅ Note: ฐานข้อมูลใช้ชื่อ allergy_history
        ]
      );
      
      const patientId = patientResult.insertId;
      
      await db.query('COMMIT');
      
      // Create notification
      try {
        await db.execute(`
          INSERT INTO notifications (type, title, message, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'patient',
          'New Patient Registered',
          `New patient ${fname} ${lname} has been added to the system`,
          patientId
        ]);
      } catch (notificationError) {
        console.warn('Could not create notification:', notificationError.message);
      }

      console.log('✅ Patient created successfully');
      
      res.json({
        success: true,
        message: 'Patient added successfully',
        redirect: '/admin/patients'
      });
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error creating patient:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Email address is already in use'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add patient: ' + error.message
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

    res.render('admin/patient/edit-patient', { patient });
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

    res.render('admin/patient/view-patient', { patient: rows[0] });
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

// API: Update patient information
exports.updatePatientAPI = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('📝 Updating patient:', id, 'with data:', updateData);
    
    // ตรวจสอบว่าผู้ป่วยมีอยู่จริง
    const [currentPatient] = await db.execute(`
      SELECT p.*, u.email, u.user_id 
      FROM patient p 
      LEFT JOIN user u ON p.user_id = u.user_id 
      WHERE p.patient_id = ?
    `, [id]);

    if (currentPatient.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }

    const patient = currentPatient[0];
    
    await db.query('START TRANSACTION');
    
    try {
      // ตรวจสอบอีเมลซ้ำ (ถ้ามีการเปลี่ยนแปลงอีเมล)
      if (updateData.email && updateData.email !== patient.email) {
        const [existingEmail] = await db.execute(
          'SELECT COUNT(*) as count FROM user WHERE email = ? AND user_id != ?', 
          [updateData.email, patient.user_id]
        );
        
        if (existingEmail[0].count > 0) {
          await db.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: 'Email address is already in use'
          });
        }
      }

      // อัปเดตตาราง user (email และ password)
      if (updateData.email || updateData.password) {
        let userUpdateQuery = 'UPDATE user SET ';
        let userUpdateParams = [];
        let userUpdateFields = [];

        if (updateData.email) {
          userUpdateFields.push('email = ?');
          userUpdateParams.push(updateData.email);
        }

        if (updateData.password) {
          const bcrypt = require('bcrypt');
          const hashedPassword = await bcrypt.hash(updateData.password, 10);
          userUpdateFields.push('password = ?');
          userUpdateParams.push(hashedPassword);
        }

        if (userUpdateFields.length > 0) {
          userUpdateQuery += userUpdateFields.join(', ') + ' WHERE user_id = ?';
          userUpdateParams.push(patient.user_id);
          
          await db.execute(userUpdateQuery, userUpdateParams);
          console.log('✅ User table updated');
        }
      }

      // ✅ อัปเดตตาราง patient รวมฟิลด์ใหม่
      const patientFields = [
        'fname', 'lname', 'dob', 'id_card', 'phone', 'address',
        'gender', 'chronic_disease'  // ✅ เพิ่มฟิลด์ใหม่
      ];
      let patientUpdateFields = [];
      let patientUpdateParams = [];

      patientFields.forEach(field => {
        if (updateData.hasOwnProperty(field)) {
          patientUpdateFields.push(`${field} = ?`);
          if (field === 'dob' && (!updateData[field] || updateData[field] === 'null')) {
            patientUpdateParams.push(null);
          } else {
            patientUpdateParams.push(updateData[field] || null);
          }
        }
      });

      // ✅ จัดการ drug_allergy แยกเพราะชื่อฟิลด์ต่างกัน (form ใช้ drug_allergy, DB ใช้ allergy_history)
      if (updateData.hasOwnProperty('drug_allergy')) {
        patientUpdateFields.push('allergy_history = ?');
        patientUpdateParams.push(updateData.drug_allergy || null);
      }

      if (patientUpdateFields.length > 0) {
        const patientUpdateQuery = `UPDATE patient SET ${patientUpdateFields.join(', ')} WHERE patient_id = ?`;
        patientUpdateParams.push(id);
        
        await db.execute(patientUpdateQuery, patientUpdateParams);
        console.log('✅ Patient table updated');
      }
      
      await db.query('COMMIT');
      console.log('✅ Transaction committed');
      
      // สร้าง notification สำหรับการอัปเดต
      try {
        await db.execute(`
          INSERT INTO notifications (type, title, message, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'patient_update',
          'Patient Information Updated',
          `Patient ${updateData.fname || patient.fname} ${updateData.lname || patient.lname}'s information has been updated`,
          id
        ]);
        console.log('✅ Notification created');
      } catch (notificationError) {
        console.warn('⚠️ Could not create notification:', notificationError.message);
      }

      res.json({
        success: true,
        message: 'Patient updated successfully'
      });

    } catch (error) {
      await db.query('ROLLBACK');
      console.error('❌ Transaction rolled back due to error');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error updating patient:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update patient: ' + error.message
    });
  }
};


// Enhanced email check function สำหรับ patients (ไม่รวมอีเมลปัจจุบันของผู้ป่วย)
exports.checkPatientEmailAvailability = async (req, res) => {
  try {
    const { email, patient_id } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
    let params = [email];

    // ถ้าเป็นการตรวจสอบสำหรับผู้ป่วยเฉพาะ ให้ยกเว้นอีเมลปัจจุบันของเขา
    if (patient_id) {
      query += ' AND user_id != (SELECT user_id FROM patient WHERE patient_id = ?)';
      params.push(patient_id);
    }

    const [result] = await db.execute(query, params);
    const exists = result[0].count > 0;

    res.json({
      success: true,
      exists: exists
    });

  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email availability'
    });
  }
};

// แสดงฟอร์มแก้ไข patient แบบ modern
exports.showEditPatientFormModern = async (req, res) => {
  const id = req.params.id;
  
  try {
    const [rows] = await db.execute(`
      SELECT 
        p.*,
        u.email,
        u.last_login,
        u.created_at,
        u.updated_at as user_updated_at
      FROM patient p
      LEFT JOIN user u ON p.user_id = u.user_id
      WHERE p.patient_id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).render('error', { 
        message: 'Patient not found',
        backUrl: '/admin/patients'
      });
    }

    const patient = rows[0];
    
    // Format date สำหรับ HTML input
    if (patient.dob) {
      patient.dob = new Date(patient.dob).toISOString().split('T')[0];
    }

    // เพิ่มสถิติ
    const [appointmentStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN queue_status = 'confirm' THEN 1 END) as confirmed_appointments,
        COUNT(CASE WHEN queue_status = 'pending' THEN 1 END) as pending_appointments,
        COUNT(CASE WHEN queue_status = 'cancel' THEN 1 END) as cancelled_appointments,
        MAX(time) as last_appointment
      FROM queue 
      WHERE patient_id = ?
    `, [id]);

    patient.stats = appointmentStats[0];

    // ใช้ template ใหม่
    res.render('admin/patient/edit-patient-modern', { patient });
  } catch (err) {
    console.error('Error loading patient for edit:', err);
    res.status(500).render('error', { 
      message: 'Error loading patient information',
      backUrl: '/admin/patients'
    });
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

    res.render('admin/patient/treatment-history/patient-treatment', {
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
        q.time,
        t.treatment_name,
        t.duration,
        CONCAT(d.fname, ' ', d.lname) AS dentist_name,
        th.diagnosis,
        th.followUpdate,
        p.fname AS patient_fname,
        p.lname AS patient_lname,
        p.gender,
        p.dob,
        p.id_card,
        p.phone,
        p.address,
        p.chronic_disease,
        p.allergy_history
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN patient p ON q.patient_id = p.patient_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?
    `, [queueId, id]);

    if (rows.length === 0) {
      return res.status(404).send('ไม่พบข้อมูลการรักษา');
    }

    const detail = rows[0];
    const dateObj = new Date(detail.time);
    
    // คำนวณเวลาสิ้นสุด
    const endTime = new Date(dateObj.getTime() + (detail.duration * 60000)); // duration เป็นนาที
    
    // รูปแบบวันที่เป็นภาษาไทย
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    
    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const year = dateObj.getFullYear() + 543;
    
    // Format เวลาเริ่มต้น
    const startHours = dateObj.getHours().toString().padStart(2, '0');
    const startMinutes = dateObj.getMinutes().toString().padStart(2, '0');
    
    // Format เวลาสิ้นสุด
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    
    detail.formattedDate = `${day} ${month} ${year}`;
    detail.formattedTime = `${startHours}:${startMinutes} น.`;
    detail.formattedTimeRange = `${startHours}:${startMinutes} - ${endHours}:${endMinutes} น.`;
    detail.formattedDuration = `${detail.duration} นาที`;

    res.render('admin/patient/treatment-history/treatment-detail', { 
      detail, 
      patientId: id 
    });

  } catch (err) {
    console.error('Error fetching treatment details:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
};



// ---treatments
exports.listTreatments = async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM treatment ORDER BY treatment_name ASC`);
    res.render('admin/treatment/admin-treatments', { treatments: rows });
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
    res.render('admin/treatment/view-treatment', { treatment });

  } catch (err) {
    console.error('Error fetching treatment:', err);
    res.status(500).send('Server error');
  }
};

exports.showAddTreatmentForm = async (req, res) => {
  try {
    const [dentists] = await db.execute('SELECT dentist_id, fname, lname FROM dentist');
    res.render('admin/treatment/add-treatment', { dentists });
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

//     res.render('admin/treatment/edit-treatment', {
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

    res.render('admin/treatment/edit-treatment', {
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
    await db.query('START TRANSACTION');
    
    try {
      // Delete dentist-treatment relationships first
      await db.execute('DELETE FROM dentist_treatment WHERE treatment_id = ?', [treatmentId]);
      
      // Delete the treatment
      await db.execute('DELETE FROM treatment WHERE treatment_id = ?', [treatmentId]);
      
      await db.query('COMMIT');
      
      req.flash('success', 'Treatment deleted successfully.');
      res.redirect('/admin/treatments'); // ✅ ตอนนี้ route นี้มีแล้ว
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error deleting treatment:', error);
    req.flash('error', 'Failed to delete treatment.');
    res.redirect('/admin/treatments'); // ✅ fallback redirect
  }
};
// ==================== Notifications Functions ====================

// Get all notifications for admin
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = 'false' } = req.query;

    // แปลงเป็น number ทันที
    const limitNum = Number(limit);
    const offsetNum = Number(offset);

    console.log('🔍 Query params:', { limit, offset, unread_only, limitNum, offsetNum });

    let whereClause = '';

    if (unread_only === 'true') {
      whereClause = 'WHERE n.is_read = 0';
    }

    // Build query without placeholders for LIMIT/OFFSET (MySQL issue with prepared statements)
    const query =
      'SELECT ' +
      'n.id, n.type, n.title, n.message, n.is_read, n.is_new, ' +
      'n.appointment_id, n.dentist_id, n.patient_id, n.created_at, ' +
      'p.fname as patient_fname, p.lname as patient_lname, ' +
      'd.fname as dentist_fname, d.lname as dentist_lname ' +
      'FROM notifications n ' +
      'LEFT JOIN patient p ON n.patient_id = p.patient_id ' +
      'LEFT JOIN dentist d ON n.dentist_id = d.dentist_id ' +
      (whereClause ? whereClause + ' ' : '') +
      'ORDER BY n.created_at DESC ' +
      'LIMIT ' + limitNum + ' OFFSET ' + offsetNum;

    console.log('🔍 Final Query:', query);

    const [notifications] = await db.query(query);

    // Get total count with same WHERE clause - use string concatenation
    const countQuery = 'SELECT COUNT(*) as total FROM notifications n ' + (whereClause ? whereClause : '');
    console.log('🔍 Count query:', countQuery);

    const [countResult] = await db.execute(countQuery);

    const totalCount = countResult[0].total;
    const unreadCount = await getUnreadNotificationCount();

    res.json({
      success: true,
      notifications: notifications,
      unread: unreadCount,
      total: totalCount
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
        th.diagnosis,
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
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
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

// Update appointment details
exports.updateAppointment = async (req, res) => {
  console.log('=== UPDATE APPOINTMENT START ===');
  console.log('Appointment ID:', req.params.id);
  console.log('Request body:', req.body);

  try {
    const { id } = req.params;
    const { 
      dentist_id, 
      treatment_id, 
      appointment_datetime, 
      status, 
      diagnosis, 
      next_appointment 
    } = req.body;

    // Basic validation
    if (!id || !dentist_id || !treatment_id || !appointment_datetime) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Check if appointment exists
    console.log('🔍 Checking if appointment exists...');
    const [existingAppointment] = await db.execute(`
      SELECT 
        q.*,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        p.phone as patient_phone
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.queue_id = ?
    `, [id]);

    if (existingAppointment.length === 0) {
      console.log('❌ Appointment not found');
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    console.log('✅ Appointment found:', existingAppointment[0]);
    const currentAppointment = existingAppointment[0];

    // Simple update query
    console.log('📝 Updating appointment...');
    const [updateResult] = await db.execute(`
      UPDATE queue 
      SET dentist_id = ?, 
          treatment_id = ?, 
          time = ?, 
          queue_status = ?, 
          diagnosis = ?, 
          next_appointment = ?
      WHERE queue_id = ?
    `, [
      dentist_id, 
      treatment_id, 
      appointment_datetime, 
      status || 'pending', 
      diagnosis || null, 
      next_appointment || null, 
      id
    ]);

    console.log('📊 Update result:', updateResult);

    if (updateResult.affectedRows === 0) {
      console.log('❌ No rows affected');
      return res.status(400).json({
        success: false,
        error: 'No changes were made'
      });
    }

    // Try to update queuedetail if it exists
    if (currentAppointment.queuedetail_id) {
      try {
        const appointmentDate = new Date(appointment_datetime).toISOString().split('T')[0];
        await db.execute(`
          UPDATE queuedetail 
          SET dentist_id = ?, 
              treatment_id = ?, 
              date = ?
          WHERE queuedetail_id = ?
        `, [dentist_id, treatment_id, appointmentDate, currentAppointment.queuedetail_id]);
        console.log('✅ QueueDetail updated');
      } catch (queueDetailError) {
        console.log('⚠️ QueueDetail update failed (but continuing):', queueDetailError.message);
      }
    }

    // Create a simple notification
    try {
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `, [
        'appointment_updated',
        'Appointment Updated',
        `Appointment updated for ${currentAppointment.patient_name}`,
        id,
        dentist_id,
        currentAppointment.patient_id
      ]);
      console.log('✅ Notification created');
    } catch (notificationError) {
      console.log('⚠️ Notification creation failed (but continuing):', notificationError.message);
    }

    // Get updated appointment data
    const [updatedAppointment] = await db.execute(`
      SELECT 
        q.*,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.queue_id = ?
    `, [id]);

    console.log('✅ Update successful');
    
    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: updatedAppointment[0] || {
        queue_id: id,
        patient_name: currentAppointment.patient_name,
        status: status || 'pending'
      }
    });

  } catch (error) {
    console.error('❌ ERROR in updateAppointment:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sql: error.sql,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment',
      details: error.message
    });
  } finally {
    console.log('=== UPDATE APPOINTMENT END ===');
  }
};


// Get dentist schedule/availability
exports.getDentistSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุวันที่'
      });
    }

    // Get dentist schedule for the specified date
    const [scheduleData] = await db.execute(`
      SELECT 
        ds.hour,
        ds.start_time,
        ds.end_time,
        ds.status,
        COUNT(q.queue_id) as booked_count
      FROM dentist_schedule ds
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.dentist_id = ? 
        AND ds.schedule_date = ?
        AND ds.status = 'working'
      GROUP BY ds.hour, ds.start_time, ds.end_time, ds.status
      ORDER BY ds.hour
    `, [id, date]);

    // Generate time slots based on schedule
    const timeSlots = [];
    
    if (scheduleData.length === 0) {
      // If no schedule found, generate default working hours (8 AM - 6 PM)
      for (let hour = 8; hour <= 18; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          timeSlots.push({
            time: timeString,
            available: true,
            note: 'เวลาว่าง'
          });
        }
      }
    } else {
      // Generate time slots based on actual schedule
      scheduleData.forEach(slot => {
        const startHour = parseInt(slot.start_time.split(':')[0]);
        const endHour = parseInt(slot.end_time.split(':')[0]);
        
        for (let hour = startHour; hour < endHour; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeSlots.push({
              time: timeString,
              available: slot.booked_count === 0,
              note: slot.booked_count > 0 ? 'ไม่ว่าง' : 'เวลาว่าง'
            });
          }
        }
      });
    }

    res.json({
      success: true,
      timeSlots: timeSlots,
      date: date
    });

  } catch (error) {
    console.error('Error getting dentist schedule:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถโหลดตารางเวลาแพทย์ได้',
      details: error.message
    });
  }
};

// Send appointment update email
async function sendAppointmentUpdateEmail(email, appointment, oldStatus, newStatus) {
  try {
    // This is a placeholder for email service integration
    const emailContent = {
      to: email,
      subject: 'การจองของคุณได้รับการอัปเดต - Smile Clinic',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">การจองได้รับการอัปเดต</h2>
          <p>เรียนคุณผู้ป่วย</p>
          <p>การจองของคุณได้รับการอัปเดตรายละเอียดดังนี้:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>รายละเอียดการจองใหม่</h3>
            <p><strong>แพทย์:</strong> Dr. ${appointment.dentist_name}</p>
            <p><strong>การรักษา:</strong> ${appointment.treatment_name}</p>
            <p><strong>วันที่:</strong> ${new Date(appointment.time).toLocaleDateString('th-TH')}</p>
            <p><strong>เวลา:</strong> ${new Date(appointment.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>สถานะ:</strong> ${newStatus === 'pending' ? 'รอยืนยัน' : newStatus === 'confirm' ? 'ยืนยันแล้ว' : 'ยกเลิกแล้ว'}</p>
          </div>
          
          ${appointment.diagnosis ? `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4>หมายเหตุจากแพทย์:</h4>
              <p>${appointment.diagnosis}</p>
            </div>
          ` : ''}
          
          <p>หากมีข้อสงสัยกรุณาติดต่อคลินิก</p>
          <p>ขอบคุณที่ไว้วางใจ Smile Clinic</p>
        </div>
      `
    };

    console.log(`[EMAIL] Would send appointment update to ${email}`);
    console.log('Email content:', emailContent);
    
    // Here you would integrate with your email service
    // Example: await emailService.send(emailContent);
    
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

// Validate appointment time conflicts
exports.validateAppointmentTime = async (req, res) => {
  try {
    const { dentist_id, appointment_datetime, exclude_appointment_id } = req.query;

    if (!dentist_id || !appointment_datetime) {
      return res.status(400).json({
        success: false,
        error: 'Dentist ID and appointment datetime are required'
      });
    }

    // Check for conflicts
    const [conflicts] = await db.execute(`
      SELECT 
        q.queue_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        q.time
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.dentist_id = ? 
        AND q.time = ? 
        AND q.queue_status IN ('pending', 'confirm')
        ${exclude_appointment_id ? 'AND q.queue_id != ?' : ''}
    `, exclude_appointment_id ? 
      [dentist_id, appointment_datetime, exclude_appointment_id] : 
      [dentist_id, appointment_datetime]
    );

    res.json({
      success: true,
      available: conflicts.length === 0,
      conflicts: conflicts
    });

  } catch (error) {
    console.error('Error validating appointment time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate appointment time',
      details: error.message
    });
  }
};

// Update appointment status
exports.updateAppointmentStatus = async (req, res) => {
  const NotificationHelper = require('../utils/notificationHelper');

  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'confirm', 'cancel'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'สถานะไม่ถูกต้อง ต้องเป็น pending, confirm หรือ cancel'
      });
    }

    // Get current appointment details for notification
    const [appointmentData] = await db.execute(`
      SELECT 
        q.*,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        p.phone as patient_phone,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        t.treatment_name,
        t.duration as treatment_duration,
        u.email as patient_email
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN user u ON p.user_id = u.user_id
      WHERE q.queue_id = ?
    `, [id]);

    if (appointmentData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบการจองที่ระบุ'
      });
    }

    const appointment = appointmentData[0];
    const oldStatus = appointment.queue_status;

    // Don't update if status is the same
    if (oldStatus === status) {
      return res.status(400).json({
        success: false,
        error: 'สถานะเหมือนเดิม ไม่จำเป็นต้องอัปเดต'
      });
    }

    // Start transaction
    await db.query('START TRANSACTION');
    
    try {
      // Update appointment status
      const [updateResult] = await db.execute(`
  UPDATE queue 
  SET queue_status = ?
  WHERE queue_id = ?
`, [status, id]);

      if (updateResult.affectedRows === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'ไม่สามารถอัปเดตสถานะการจองได้'
        });
      }

      // Create notification for the patient
      const notificationTitle = status === 'confirm' 
        ? 'การจองได้รับการยืนยัน' 
        : 'การจองถูกยกเลิก';
      
      let notificationMessage = '';
      if (status === 'confirm') {
        notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} เวลา ${new Date(appointment.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} ได้รับการยืนยันแล้ว`;
      } else if (status === 'cancel') {
        notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} ถูกยกเลิก${reason ? ` เหตุผล: ${reason}` : ''}`;
      }

      // Insert notification for patient
      await db.execute(`
        INSERT INTO notifications (
          type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `, [
        status === 'confirm' ? 'appointment_confirmed' : 'appointment_cancelled',
        notificationTitle,
        notificationMessage,
        id,
        appointment.dentist_id,
        appointment.patient_id
      ]);

      // Create admin notification for tracking
      const adminNotificationMessage = status === 'confirm'
        ? `ยืนยันการจองสำเร็จ: ${appointment.patient_name} กับ Dr. ${appointment.dentist_name}`
        : `ยกเลิกการจองสำเร็จ: ${appointment.patient_name} กับ Dr. ${appointment.dentist_name}`;

      await db.execute(`
        INSERT INTO notifications (
          type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `, [
        'admin_action',
        'การดำเนินการโดยแอดมิน',
        adminNotificationMessage,
        id,
        appointment.dentist_id,
        appointment.patient_id
      ]);

      // Send email notification to patient (if email exists)
      if (appointment.patient_email) {
        try {
          await sendEmailNotification(
            appointment.patient_email,
            notificationTitle,
            notificationMessage,
            appointment
          );
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
          // Don't fail the entire operation if email fails
        }
      }

      // Send SMS notification (if you have SMS service)
      if (appointment.patient_phone) {
        try {
          await sendSMSNotification(
            appointment.patient_phone,
            notificationMessage
          );
        } catch (smsError) {
          console.error('Failed to send SMS notification:', smsError);
          // Don't fail the entire operation if SMS fails
        }
      }

      // Commit transaction
      await db.query('COMMIT');

      // สร้าง notification ตามสถานะ
if (status === 'confirm') {
  await NotificationHelper.createConfirmationNotification(id, appointment.patient_id, appointment.dentist_id);
} else if (status === 'cancel') {
  await NotificationHelper.createCancellationNotification(id, appointment.patient_id, appointment.dentist_id, 'admin', reason);
}

      // Log the action for audit trail
      console.log(`[AUDIT] Admin updated appointment ${id} status from ${oldStatus} to ${status}. Patient: ${appointment.patient_name}, Time: ${new Date().toISOString()}`);

      res.json({
        success: true,
        message: status === 'confirm' 
          ? 'การจองได้รับการยืนยันแล้ว และส่งการแจ้งเตือนไปยังผู้ป่วยเรียบร้อย'
          : 'การจองถูกยกเลิกแล้ว และส่งการแจ้งเตือนไปยังผู้ป่วยเรียบร้อย',
        appointment: {
          queue_id: id,
          old_status: oldStatus,
          new_status: status,
          patient_name: appointment.patient_name,
          dentist_name: appointment.dentist_name,
          treatment_name: appointment.treatment_name,
          appointment_time: appointment.time
        }
      });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตสถานะการจอง',
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
      INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [queueDetailId, patient_id, treatment_id, dentist_id, appointment_time]);

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
        d.id_card,
        d.photo,
        u.email,
        u.last_login,
        COUNT(DISTINCT ds.schedule_id) as total_schedules,
        COUNT(DISTINCT q.queue_id) as total_appointments
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      LEFT JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id AND ds.schedule_date >= CURDATE()
      LEFT JOIN queue q ON d.dentist_id = q.dentist_id AND q.queue_status IN ('pending', 'confirm')
      GROUP BY d.dentist_id, d.fname, d.lname, d.phone, d.specialty, d.education, d.address, d.dob, d.id_card, d.photo, u.email, u.last_login
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
      id_card: dentist.id_card,
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

    const dentist = rows[0];
    
    // ✅ เพิ่มส่วนนี้เพื่อแปลง license_no เป็นหลายรูปแบบเพื่อรองรับ frontend
    if (dentist.license_no) {
      dentist.licenseNo = dentist.license_no;        // camelCase
      dentist.license_number = dentist.license_no;   // snake_case แบบเต็ม
      dentist.license = dentist.license_no;          // แบบสั้น
    }
    
    // ตรวจสอบว่ามีไฟล์รูปจริงหรือไม่
    if (dentist.photo && dentist.photo !== 'default-avatar.png') {
      const photoPath = path.join(__dirname, '../public/uploads/', dentist.photo);
      const photoExists = fs.existsSync(photoPath);
      
      console.log(`🔍 Checking photo: ${dentist.photo} - Exists: ${photoExists}`);
      
      if (!photoExists) {
        console.log('⚠️ Photo file not found, setting to null');
        dentist.photo = null;
        
        // อัปเดต database ให้ตรงกับความเป็นจริง
        await db.execute('UPDATE dentist SET photo = NULL WHERE dentist_id = ?', [id]);
      }
    }

    res.json({
      success: true,
      dentist: dentist
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
    await db.query('START TRANSACTION');
    
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
      await db.query('COMMIT');
      
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
      await db.query('ROLLBACK');
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
        error: 'ไม่พบข้อมูลผู้ใช้'
      });
    }

    // ดึงข้อมูล user
    const [users] = await db.execute(`
      SELECT 
        u.user_id,
        u.email,
        u.role_id,
        CASE 
          WHEN u.role_id = 1 THEN 'Admin'
          WHEN u.role_id = 2 THEN 'Dentist'
          WHEN u.role_id = 3 THEN 'Patient'
          ELSE 'Unknown'
        END as role_name,
        COALESCE(d.fname, p.fname, 'Admin') as fname,
        COALESCE(d.lname, p.lname, '') as lname,
        d.dentist_id,
        p.patient_id
      FROM user u
      LEFT JOIN dentist d ON u.user_id = d.user_id
      LEFT JOIN patient p ON u.user_id = p.user_id
      WHERE u.user_id = ?
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ใช้'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
        fname: user.fname,
        lname: user.lname,
        full_name: `${user.fname} ${user.lname}`.trim(),
        dentist_id: user.dentist_id || null,
        patient_id: user.patient_id || null
      }
    });

  } catch (error) {
    console.error('Error in getCurrentUserAPI:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้'
    });
  }
},

// Get treatments API
exports.getTreatmentsAPI = async (req, res) => {
  try {
    const [treatments] = await db.execute(`
      SELECT 
        t.treatment_id,
        t.treatment_name,
        t.duration,
        COUNT(dt.dentist_id) as dentist_count
      FROM treatment t
      LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
      GROUP BY t.treatment_id, t.treatment_name, t.duration
      ORDER BY t.treatment_name
    `);

    res.json({
      success: true,
      treatments: treatments
    });
  } catch (error) {
    console.error('Error loading treatments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load treatments'
    });
  }
};

// Delete treatment API
exports.deleteTreatmentAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('START TRANSACTION');
    
    try {
      // Delete dentist-treatment relationships
      await db.execute('DELETE FROM dentist_treatment WHERE treatment_id = ?', [id]);
      
      // Delete the treatment
      await db.execute('DELETE FROM treatment WHERE treatment_id = ?', [id]);
      
      await db.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Treatment deleted successfully'
      });
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error deleting treatment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete treatment'
    });
  }
};

// Get single treatment details
exports.getTreatmentByIdAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [treatments] = await db.execute(`
      SELECT treatment_id, treatment_name, duration
      FROM treatment 
      WHERE treatment_id = ?
    `, [id]);

    if (treatments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Treatment not found'
      });
    }

    res.json({
      success: true,
      treatment: treatments[0]
    });

  } catch (error) {
    console.error('Error loading treatment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load treatment'
    });
  }
};

// Get dentists for a specific treatment
exports.getTreatmentDentistsAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [dentists] = await db.execute(`
      SELECT 
        d.dentist_id, 
        d.fname, 
        d.lname, 
        d.specialty,
        d.phone
      FROM dentist d
      JOIN dentist_treatment dt ON d.dentist_id = dt.dentist_id
      WHERE dt.treatment_id = ?
      ORDER BY d.fname, d.lname
    `, [id]);

    res.json({
      success: true,
      dentists: dentists,
      treatment_id: id
    });

  } catch (error) {
    console.error('Error loading treatment dentists:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load treatment dentists'
    });
  }
};

// Update treatment API
exports.updateTreatmentAPI = async (req, res) => {
  try {
    const { id } = req.params;
    const { treatment_name, duration, dentist_ids } = req.body;
    
    // Validate input
    if (!treatment_name || !duration || !dentist_ids || !Array.isArray(dentist_ids)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    await db.query('START TRANSACTION');
    
    try {
      // Update treatment
      await db.execute(`
        UPDATE treatment 
        SET treatment_name = ?, duration = ? 
        WHERE treatment_id = ?
      `, [treatment_name, parseInt(duration), id]);

      // Delete existing dentist assignments
      await db.execute(
        'DELETE FROM dentist_treatment WHERE treatment_id = ?',
        [id]
      );

      // Add new dentist assignments
      for (const dentistId of dentist_ids) {
        await db.execute(
          'INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)',
          [dentistId, id]
        );
      }

      await db.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Treatment updated successfully'
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating treatment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update treatment'
    });
  }
};

// Create new treatment API
exports.createTreatmentAPI = async (req, res) => {
  try {
    const { name, duration, dentist_ids } = req.body;
    
    // Validate input
    if (!name || !duration || !dentist_ids || !Array.isArray(dentist_ids) || dentist_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, duration, and at least one dentist must be selected'
      });
    }

    await db.query('START TRANSACTION');
    
    try {
      // Create treatment
      const [treatmentResult] = await db.execute(`
        INSERT INTO treatment (treatment_name, duration) 
        VALUES (?, ?)
      `, [name.trim(), parseInt(duration)]);

      const treatmentId = treatmentResult.insertId;

      // Add dentist assignments
      for (const dentistId of dentist_ids) {
        await db.execute(
          'INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)',
          [dentistId, treatmentId]
        );
      }

      await db.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Treatment created successfully',
        treatment_id: treatmentId
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating treatment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create treatment'
    });
  }
};

exports.getPendingAppointmentsCount = async (req, res) => {
  try {
    const [result] = await db.execute(`
      SELECT COUNT(*) as pending_count 
      FROM queue 
      WHERE queue_status = 'pending' 
      AND DATE(time) >= CURDATE()
    `);

    res.json({
      success: true,
      pending_count: result[0].pending_count
    });

  } catch (error) {
    console.error('Error getting pending appointments count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pending appointments count'
    });
  }
};

// Send email notification to patient
async function sendEmailNotification(email, title, message, appointment) {
  // This is a placeholder for email service integration
  // You can integrate with services like SendGrid, AWS SES, or Nodemailer
  
  try {
    // Example with Nodemailer (you'll need to install and configure)
    /*
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransporter({
      host: 'your-smtp-host',
      port: 587,
      secure: false,
      auth: {
        user: 'your-email',
        pass: 'your-password'
      }
    });

    const mailOptions = {
      from: 'Smile Clinic <noreply@smileclinic.com>',
      to: email,
      subject: title,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">${title}</h2>
          <p>${message}</p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>รายละเอียดการจอง</h3>
            <p><strong>ผู้ป่วย:</strong> ${appointment.patient_name}</p>
            <p><strong>แพทย์:</strong> Dr. ${appointment.dentist_name}</p>
            <p><strong>การรักษา:</strong> ${appointment.treatment_name}</p>
            <p><strong>วันที่:</strong> ${new Date(appointment.time).toLocaleDateString('th-TH')}</p>
            <p><strong>เวลา:</strong> ${new Date(appointment.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <p>ขอบคุณที่ไว้วางใจ Smile Clinic</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    */
    
    console.log(`[EMAIL] Would send to ${email}: ${title} - ${message}`);
    return true;
    
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

// Send SMS notification to patient
async function sendSMSNotification(phone, message) {
  // This is a placeholder for SMS service integration
  // You can integrate with services like Twilio, AWS SNS, or local SMS providers
  
  try {
    // Example SMS integration
    /*
    const twilio = require('twilio');
    const client = twilio('your-account-sid', 'your-auth-token');

    await client.messages.create({
      body: message,
      from: '+1234567890', // Your Twilio phone number
      to: phone
    });
    */
    
    console.log(`[SMS] Would send to ${phone}: ${message}`);
    return true;
    
  } catch (error) {
    console.error('SMS sending failed:', error);
    throw error;
  }
}

// Get appointment statistics for admin dashboard
exports.getAppointmentStatistics = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const startDate = start_date || new Date().toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Get total appointments by status
    const [statusStats] = await db.execute(`
      SELECT 
        queue_status,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM queue WHERE DATE(time) BETWEEN ? AND ?)), 2) as percentage
      FROM queue 
      WHERE DATE(time) BETWEEN ? AND ?
      GROUP BY queue_status
    `, [startDate, endDate, startDate, endDate]);

    // Get daily appointment trends
    const [dailyTrends] = await db.execute(`
      SELECT 
        DATE(time) as date,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN queue_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN queue_status = 'confirm' THEN 1 END) as confirmed,
        COUNT(CASE WHEN queue_status = 'cancel' THEN 1 END) as cancelled
      FROM queue 
      WHERE DATE(time) BETWEEN ? AND ?
      GROUP BY DATE(time)
      ORDER BY date
    `, [startDate, endDate]);

    // Get top treatments
    const [topTreatments] = await db.execute(`
      SELECT 
        t.treatment_name,
        COUNT(*) as booking_count,
        COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_count
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE DATE(q.time) BETWEEN ? AND ?
      GROUP BY t.treatment_id, t.treatment_name
      ORDER BY booking_count DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Get dentist performance
    const [dentistStats] = await db.execute(`
      SELECT 
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty,
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_bookings,
        ROUND((COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) * 100.0 / COUNT(*)), 2) as confirmation_rate
      FROM queue q
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE DATE(q.time) BETWEEN ? AND ?
      GROUP BY q.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY total_bookings DESC
    `, [startDate, endDate]);

    res.json({
      success: true,
      statistics: {
        status_distribution: statusStats,
        daily_trends: dailyTrends,
        top_treatments: topTreatments,
        dentist_performance: dentistStats,
        date_range: { start_date: startDate, end_date: endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching appointment statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load appointment statistics',
      details: error.message
    });
  }
};

// Bulk update appointment status
exports.bulkUpdateAppointmentStatus = async (req, res) => {
  try {
    const { appointment_ids, status, reason } = req.body;
    
    if (!appointment_ids || !Array.isArray(appointment_ids) || appointment_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุรายการการจองที่ต้องการอัปเดต'
      });
    }

    const validStatuses = ['pending', 'confirm', 'cancel'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'สถานะไม่ถูกต้อง'
      });
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    // Process each appointment
    for (const appointmentId of appointment_ids) {
      try {
        // Call the single update function
        await updateSingleAppointmentStatus(appointmentId, status, reason);
        successCount++;
        results.push({ appointment_id: appointmentId, success: true });
      } catch (error) {
        failureCount++;
        results.push({ 
          appointment_id: appointmentId, 
          success: false, 
          error: error.message 
        });
      }
    }

    res.json({
      success: true,
      message: `อัปเดตสำเร็จ ${successCount} รายการ${failureCount > 0 ? `, ล้มเหลว ${failureCount} รายการ` : ''}`,
      results: results,
      summary: {
        total: appointment_ids.length,
        success: successCount,
        failure: failureCount
      }
    });

  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดตแบบกลุ่ม',
      details: error.message
    });
  }
};
// Helper function for single appointment status update
async function updateSingleAppointmentStatus(appointmentId, status, reason) {
  // Get appointment details
  const [appointmentData] = await db.execute(`
    SELECT 
      q.*,
      CONCAT(p.fname, ' ', p.lname) as patient_name,
      CONCAT(d.fname, ' ', d.lname) as dentist_name,
      t.treatment_name,
      u.email as patient_email,
      p.phone as patient_phone
    FROM queue q
    JOIN patient p ON q.patient_id = p.patient_id
    JOIN dentist d ON q.dentist_id = d.dentist_id
    JOIN treatment t ON q.treatment_id = t.treatment_id
    LEFT JOIN user u ON p.user_id = u.user_id
    WHERE q.queue_id = ?
  `, [appointmentId]);

  if (appointmentData.length === 0) {
    throw new Error(`ไม่พบการจอง ID: ${appointmentId}`);
  }

  const appointment = appointmentData[0];

  // Update status
  await db.execute(`
    UPDATE queue 
    SET queue_status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE queue_id = ?
  `, [status, appointmentId]);

  // Create notification
  const notificationTitle = status === 'confirm' 
    ? 'การจองได้รับการยืนยัน' 
    : 'การจองถูกยกเลิก';
  
  let notificationMessage = '';
  if (status === 'confirm') {
    notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} ได้รับการยืนยันแล้ว`;
  } else if (status === 'cancel') {
    notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} ถูกยกเลิก${reason ? ` เหตุผล: ${reason}` : ''}`;
  }

  // Insert notification
  await db.execute(`
    INSERT INTO notifications (
      type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
  `, [
    status === 'confirm' ? 'appointment_confirmed' : 'appointment_cancelled',
    notificationTitle,
    notificationMessage,
    appointmentId,
    appointment.dentist_id,
    appointment.patient_id
  ]);

  return true;
}

// Show edit appointment page
exports.showEditAppointmentForm = async (req, res) => {
  try {
    const appointmentId = req.params.id || req.query.id;
    
    if (!appointmentId) {
      req.flash('error', 'Appointment ID is required');
      return res.redirect('/admin/appointments');
    }
    
    // Verify appointment exists
    const [appointments] = await db.execute(`
      SELECT queue_id FROM queue WHERE queue_id = ?
    `, [appointmentId]);
    
    if (appointments.length === 0) {
      req.flash('error', 'Appointment not found');
      return res.redirect('/admin/appointments');
    }
    
    res.render('edit-appointment', { 
      appointmentId: appointmentId,
      title: 'Edit Appointment - Smile Clinic'
    });
    
  } catch (error) {
    console.error('Error loading edit appointment page:', error);
    req.flash('error', 'Error loading appointment');
    res.redirect('/admin/appointments');
  }
};

// Show add appointment form
exports.showAddAppointmentForm = async (req, res) => {
  try {
    res.render('admin/appointment/add-appointment', { 
      title: 'Book New Appointment - Smile Clinic'
    });
  } catch (error) {
    console.error('Error loading add appointment page:', error);
    req.flash('error', 'Error loading appointment booking page');
    res.redirect('/admin/appointments');
  }
};

// Create new appointment (API)
exports.createAppointmentAPI = async (req, res) => {
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

    // Parse appointment time
    const appointmentDate = new Date(appointment_time);
    const dateStr = appointmentDate.toISOString().split('T')[0];
    const hour = appointmentDate.getHours();

    // Check if dentist is available at the requested time
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

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Create queuedetail first
      const [queueDetailResult] = await db.execute(`
        INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [patient_id, treatment_id, dentist_id, dateStr]);

      const queueDetailId = queueDetailResult.insertId;

      // Create queue entry
      const [queueResult] = await db.execute(`
        INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, [queueDetailId, patient_id, treatment_id, dentist_id, appointment_time]);

      const queueId = queueResult.insertId;

      // Commit transaction
      await db.query('COMMIT');

      // Get appointment details for response
      const [appointmentDetails] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.queue_id = ?
      `, [queueId]);

      // Create success notification
      try {
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment',
          'New Appointment Created',
          `New appointment created for ${appointmentDetails[0].patient_name} with Dr. ${appointmentDetails[0].dentist_name}`,
          queueId,
          dentist_id,
          patient_id
        ]);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the entire operation if notification fails
      }

      res.json({
        success: true,
        message: 'Appointment created successfully',
        appointment: {
          id: queueId,
          time: appointment_time,
          patient_name: appointmentDetails[0].patient_name,
          dentist_name: appointmentDetails[0].dentist_name,
          treatment_name: appointmentDetails[0].treatment_name,
          status: 'pending'
        }
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment: ' + error.message
    });
  }
};

// Get dentist schedule API
exports.getDentistScheduleAPI = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }

    // Get dentist schedule for the specified date
    const [scheduleData] = await db.execute(`
      SELECT 
        ds.hour,
        ds.start_time,
        ds.end_time,
        ds.status,
        COUNT(q.queue_id) as booked_count
      FROM dentist_schedule ds
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id 
        AND DATE(q.time) = ds.schedule_date 
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.dentist_id = ? 
        AND ds.schedule_date = ?
        AND ds.status = 'working'
      GROUP BY ds.hour, ds.start_time, ds.end_time, ds.status
      ORDER BY ds.hour
    `, [id, date]);

    // Generate time slots based on schedule
    const timeSlots = [];
    
    if (scheduleData.length === 0) {
      // If no schedule found, generate default working hours (10 AM - 8 PM)
      for (let hour = 10; hour <= 20; hour++) {
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        timeSlots.push({
          time: timeString,
          available: true,
          note: 'Available'
        });
      }
    } else {
      // Generate time slots based on actual schedule
      scheduleData.forEach(slot => {
        const startHour = parseInt(slot.start_time.split(':')[0]);
        const endHour = parseInt(slot.end_time.split(':')[0]);
        
        for (let hour = startHour; hour < endHour; hour++) {
          const timeString = `${hour.toString().padStart(2, '0')}:00`;
          timeSlots.push({
            time: timeString,
            available: slot.booked_count === 0,
            note: slot.booked_count > 0 ? 'Booked' : 'Available'
          });
        }
      });
    }

    res.json({
      success: true,
      timeSlots: timeSlots,
      date: date
    });

  } catch (error) {
    console.error('Error getting dentist schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dentist schedule',
      details: error.message
    });
  }
};

// Get patient treatment history API
exports.getPatientTreatmentHistoryAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [treatments] = await db.execute(`
      SELECT
        q.queue_id,
        q.time as date,
        q.queue_status,
        th.diagnosis,
        t.treatment_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        th.followUpdate as follow_update
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC
    `, [id]);

    res.json({
      success: true,
      treatments: treatments
    });

  } catch (error) {
    console.error('Error fetching treatment history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load treatment history',
      details: error.message
    });
  }
};

// Enhanced Dashboard with Reports
exports.getReportsDashboard = async (req, res) => {
  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0);

    // 1. นับจำนวนผู้ป่วยทั้งหมด
    const [totalPatientsResult] = await db.execute(`
      SELECT COUNT(*) as total_patients FROM patient
    `);
    const totalPatients = totalPatientsResult[0].total_patients;

    // 2. สถิติการนัดหมายตามสถานะ
    const [appointmentStats] = await db.execute(`
      SELECT 
        queue_status,
        COUNT(*) as count
      FROM queue 
      WHERE DATE(time) BETWEEN ? AND ?
      GROUP BY queue_status
    `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

    const appointmentSummary = {
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      total: 0
    };

    appointmentStats.forEach(stat => {
      if (stat.queue_status === 'confirm') {
        appointmentSummary.confirmed = stat.count;
      } else if (stat.queue_status === 'pending') {
        appointmentSummary.pending = stat.count;
      } else if (stat.queue_status === 'cancel') {
        appointmentSummary.cancelled = stat.count;
      }
      appointmentSummary.total += stat.count;
    });

    // 3. สถิติการรักษา
    const [treatmentStats] = await db.execute(`
      SELECT 
        t.treatment_name,
        COUNT(q.queue_id) as count
      FROM treatment t
      LEFT JOIN queue q ON t.treatment_id = q.treatment_id 
        AND DATE(q.time) BETWEEN ? AND ?
      GROUP BY t.treatment_id, t.treatment_name
      ORDER BY count DESC
      LIMIT 10
    `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

    // 4. สถิติผู้ป่วยต่อทันตแพทย์
    const [doctorStats] = await db.execute(`
      SELECT 
        d.dentist_id,
        CONCAT(d.fname, ' ', d.lname) as doctor_name,
        d.specialty,
        COUNT(DISTINCT q.patient_id) as unique_patients,
        COUNT(q.queue_id) as total_appointments
      FROM dentist d
      LEFT JOIN queue q ON d.dentist_id = q.dentist_id 
        AND DATE(q.time) BETWEEN ? AND ?
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY total_appointments DESC
    `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

    // 5. ทันตแพทย์ที่ทำงานวันนี้
    const [todaysDoctors] = await db.execute(`
      SELECT DISTINCT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.photo
      FROM dentist d
      JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
      WHERE ds.schedule_date = CURDATE() AND ds.status = 'working'
      ORDER BY d.fname, d.lname
    `);

    // 6. การนัดหมายที่จะมาถึงใน 7 วันข้างหน้า
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    const [upcomingAppointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as doctor_name,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE DATE(q.time) BETWEEN CURDATE() AND ?
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time ASC
      LIMIT 10
    `, [nextWeek.toISOString().split('T')[0]]);

    // 7. ข้อมูลแนวโน้มรายเดือน
    const [monthlyTrends] = await db.execute(`
      SELECT 
        DATE(time) as appointment_date,
        COUNT(*) as daily_count
      FROM queue
      WHERE DATE(time) BETWEEN ? AND ?
      GROUP BY DATE(time)
      ORDER BY appointment_date
    `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

    // เตรียมข้อมูล
    const dashboardData = {
      totalPatients,
      appointmentSummary,
      treatmentStats,
      doctorStats,
      todaysDoctors,
      upcomingAppointments,
      monthlyTrends,
      currentMonth: today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    };

    res.render('admin/reports/admin-reports-dashboard', { 
      dashboardData,
      user: req.session.user || { email: 'admin@clinic.com' }
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการโหลดแดชบอร์ดรายงาน:', error);
    res.render('admin/reports/admin-reports-dashboard', { 
      dashboardData: {
        totalPatients: 0,
        appointmentSummary: { confirmed: 0, pending: 0, cancelled: 0, total: 0 },
        treatmentStats: [],
        doctorStats: [],
        todaysDoctors: [],
        upcomingAppointments: [],
        monthlyTrends: [],
        currentMonth: 'เดือนปัจจุบัน'
      },
      user: req.session.user || { email: 'admin@clinic.com' }
    });
  }
};



// API endpoint for appointment statistics
// API: รับสถิติการนัดหมาย
exports.getAppointmentStatsAPI = async (req, res) => {
  try {
    const { period = 'month', status } = req.query;
    
    let dateFilter = '';
    let params = [];
    
    if (period === 'today') {
      dateFilter = 'DATE(time) = CURDATE()';
    } else if (period === 'week') {
      dateFilter = 'DATE(time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()';
    } else if (period === 'month') {
      dateFilter = 'MONTH(time) = MONTH(CURDATE()) AND YEAR(time) = YEAR(CURDATE())';
    }
    
    let statusFilter = '';
    if (status && status !== 'all') {
      statusFilter = 'AND queue_status = ?';
      params.push(status);
    }

    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE ${dateFilter} ${statusFilter}
      ORDER BY q.time DESC
    `, params);

    res.json({
      success: true,
      appointments,
      total: appointments.length,
      period,
      status: status || 'all'
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงสถิติการนัดหมาย:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงสถิติการนัดหมายได้'
    });
  }
};


// API: รับสถิติการรักษา
exports.getTreatmentStatsAPI = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = '';
    if (period === 'today') {
      dateFilter = 'AND DATE(q.time) = CURDATE()';
    } else if (period === 'week') {
      dateFilter = 'AND DATE(q.time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()';
    } else if (period === 'month') {
      dateFilter = 'AND MONTH(q.time) = MONTH(CURDATE()) AND YEAR(q.time) = YEAR(CURDATE())';
    } else if (period === 'year') {
      dateFilter = 'AND YEAR(q.time) = YEAR(CURDATE())';
    }

    const [treatmentStats] = await db.execute(`
      SELECT 
        t.treatment_name,
        COUNT(q.queue_id) as count,
        COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_count
      FROM treatment t
      LEFT JOIN queue q ON t.treatment_id = q.treatment_id ${dateFilter}
      GROUP BY t.treatment_id, t.treatment_name
      HAVING count > 0
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      treatments: treatmentStats,
      period
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงสถิติการรักษา:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงสถิติการรักษาได้'
    });
  }
};

// Get dentist schedule data from database
exports.getDentistScheduleData = async (req, res) => {
  try {
    const dentistId = parseInt(req.params.id, 10);
    const { start_date, end_date } = req.query;

    if (!dentistId || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Missing dentistId, start_date or end_date'
      });
    }

    // หมายเหตุ: DAYOFWEEK() ใน MySQL => อาทิตย์=1, จันทร์=2, ... เสาร์=7
    // เราคัดวันอาทิตย์ทิ้ง (<> 1) เพื่อให้ “อาทิตย์ปิด” เสมอ
    const [rows] = await db.execute(
      `
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
      LEFT JOIN queue q 
        ON q.dentist_id = ds.dentist_id
       AND DATE(q.time) = ds.schedule_date
       AND HOUR(q.time) = ds.hour
       AND q.queue_status IN ('pending','confirm')
      WHERE ds.dentist_id = ?
        AND ds.schedule_date BETWEEN ? AND ?
        AND DAYOFWEEK(ds.schedule_date) <> 1    -- << อาทิตย์ปิด
      GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note, d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY ds.schedule_date, ds.hour
      `,
      [dentistId, start_date, end_date]
    );

    // แปลงให้ง่ายต่อการแสดงผลในปฏิทิน (รวมช่วงเวลาทำงานต่อเนื่อง)
    const schedules = rows.map(r => ({
      schedule_date: r.schedule_date.toISOString().split('T')[0],
      hour: r.hour,
      start_time: r.start_time.substring(0,5), // HH:MM
      end_time: r.end_time.substring(0,5),
      status: r.status, // 'working' หรือ 'dayoff'
      note: r.note || null,
      appointment_count: r.appointment_count || 0
    }));

    return res.json({ success: true, schedules });
  } catch (err) {
    console.error('getDentistScheduleData error:', err);
    return res.status(500).json({
      success: false,
      error: 'ไม่สามารถโหลดตารางทำงานได้'
    });
  }
};

exports.getDentistTreatmentMappingAPI = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        dt.dentist_id,
        dt.treatment_id,
        d.fname,
        d.lname,
        d.specialty,
        t.treatment_name,
        t.duration
      FROM dentist_treatment dt
      JOIN dentist d ON dt.dentist_id = d.dentist_id
      JOIN treatment t ON dt.treatment_id = t.treatment_id
      ORDER BY d.fname, d.lname, t.treatment_name
    `);

    // จัดกลุ่มข้อมูลตาม dentist_id
    const mappings = {};
    rows.forEach(row => {
      if (!mappings[row.dentist_id]) {
        mappings[row.dentist_id] = {
          dentist_info: {
            dentist_id: row.dentist_id,
            fname: row.fname,
            lname: row.lname,
            specialty: row.specialty
          },
          treatments: []
        };
      }
      
      mappings[row.dentist_id].treatments.push({
        treatment_id: row.treatment_id,
        treatment_name: row.treatment_name,
        duration: row.duration
      });
    });

    res.json({
      success: true,
      mappings: mappings
    });

  } catch (error) {
    console.error('Error fetching dentist-treatment mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dentist-treatment mappings',
      details: error.message
    });
  }
};

exports.getDentistTreatmentsAPI = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [treatments] = await db.execute(`
      SELECT 
        t.treatment_id,
        t.treatment_name,
        t.duration
      FROM treatment t
      JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
      WHERE dt.dentist_id = ?
      ORDER BY t.treatment_name
    `, [id]);

    res.json({
      success: true,
      treatments: treatments,
      dentist_id: id
    });

  } catch (error) {
    console.error('Error loading dentist treatments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dentist treatments'
    });
  }
};


// Check ID Card availability function
exports.checkid_cardAvailability = async (req, res) => {
  try {
    const { id_card, exclude_dentist_id, exclude_patient_id } = req.query;
    
    if (!id_card) {
      return res.status(400).json({
        success: false,
        error: 'ID Card parameter is required'
      });
    }

    // Validate ID card format (13 digits)
    if (!/^\d{13}$/.test(id_card)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'ID card must be exactly 13 digits'
      });
    }

    let dentistExists = false;
    let patientExists = false;

    // Check in dentist table
    let dentistQuery = 'SELECT COUNT(*) as count FROM dentist WHERE id_card = ?';
    let dentistParams = [id_card];
    
    if (exclude_dentist_id) {
      dentistQuery += ' AND dentist_id != ?';
      dentistParams.push(exclude_dentist_id);
    }
    
    const [dentistResult] = await db.execute(dentistQuery, dentistParams);
    dentistExists = dentistResult[0].count > 0;

    // Check in patient table  
    let patientQuery = 'SELECT COUNT(*) as count FROM patient WHERE id_card = ?';
    let patientParams = [id_card];
    
    if (exclude_patient_id) {
      patientQuery += ' AND patient_id != ?';
      patientParams.push(exclude_patient_id);
    }
    
    const [patientResult] = await db.execute(patientQuery, patientParams);
    patientExists = patientResult[0].count > 0;

    const exists = dentistExists || patientExists;
    let foundIn = '';
    
    if (dentistExists && patientExists) {
      foundIn = 'both dentist and patient records';
    } else if (dentistExists) {
      foundIn = 'dentist records';
    } else if (patientExists) {
      foundIn = 'patient records';
    }

    res.json({
      success: true,
      exists: exists,
      valid: true,
      foundIn: foundIn,
      message: exists ? `ID card already exists in ${foundIn}` : 'ID card is available'
    });

  } catch (error) {
    console.error('Error checking ID card:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check ID card availability'
    });
  }
};

// Enhanced email check to avoid duplicates across all tables
exports.checkEmailAvailabilityEnhanced = async (req, res) => {
  try {
    const { email, exclude_user_id, exclude_dentist_id, exclude_patient_id } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'Invalid email format'
      });
    }

    let query = 'SELECT COUNT(*) as count FROM user WHERE email = ?';
    let params = [email];

    // Exclude by user_id if provided
    if (exclude_user_id) {
      query += ' AND user_id != ?';
      params.push(exclude_user_id);
    }

    // Exclude by dentist_id if provided
    if (exclude_dentist_id) {
      query += ' AND user_id != (SELECT user_id FROM dentist WHERE dentist_id = ?)';
      params.push(exclude_dentist_id);
    }

    // Exclude by patient_id if provided  
    if (exclude_patient_id) {
      query += ' AND user_id != (SELECT user_id FROM patient WHERE patient_id = ?)';
      params.push(exclude_patient_id);
    }

    const [result] = await db.execute(query, params);
    const exists = result[0].count > 0;

    res.json({
      success: true,
      exists: exists,
      valid: true,
      message: exists ? 'Email address is already in use' : 'Email is available'
    });

  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email availability'
    });
  }
};

exports.getSchedulePage = async (req, res) => {
  try {
    res.render('admin/reports/admin-schedule', { 
      title: 'ตารางเวลาทันตแพทย์ - Smile Clinic',
      user: req.session.user || { email: 'admin@clinic.com' }
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการโหลดหน้าตารางเวลา:', error);
    res.status(500).render('error', { 
      message: 'ไม่สามารถโหลดหน้าตารางเวลาได้',
      error: error 
    });
  }
};

// ตรวจสอบเลขใบประกอบวิชาชีพซ้ำ
exports.checkLicenseAvailability = async (req, res) => {
  try {
    const { license, exclude_dentist_id } = req.query;
    
    if (!license) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุเลขใบประกอบวิชาชีพ'
      });
    }

    // ตรวจสอบรูปแบบ (6-10 หลัก)
    if (!/^\d{6,10}$/.test(license)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'เลขใบประกอบวิชาชีพต้องเป็นตัวเลข 6-10 หลัก'
      });
    }

let query = 'SELECT COUNT(*) as count FROM dentist WHERE license_no = ?';
    let params = [license];
    
    if (exclude_dentist_id) {
      query += ' AND dentist_id != ?';
      params.push(exclude_dentist_id);
    }
    
    const [result] = await db.execute(query, params);
    const exists = result[0].count > 0;

    res.json({
      success: true,
      exists: exists,
      valid: true,
      message: exists ? 'เลขใบประกอบวิชาชีพนี้มีในระบบแล้ว' : 'เลขใบประกอบวิชาชีพสามารถใช้ได้'
    });

  } catch (error) {
    console.error('Error checking license:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถตรวจสอบเลขใบประกอบวิชาชีพได้'
    });
  }
};

// ========== API สำหรับ Admin Booking ที่ใช้ Available Slots ==========

// Get available dentists for admin booking
exports.getAvailableDentistsForAdmin = async (req, res) => {
  try {
    const { date, treatment_id } = req.query;

    if (!date) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาระบุวันที่' 
      });
    }

    console.log('🔍 Admin searching dentists for date:', date, 'treatment:', treatment_id);

    // ตรวจสอบวันอาทิตย์
    const appointmentDate = new Date(date);
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
        d.license_no,
        CASE 
          WHEN d.photo IS NULL OR d.photo = '' OR d.photo = 'default-avatar.png' 
          THEN NULL
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

    if (treatment_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM dentist_treatment dt 
        WHERE dt.dentist_id = d.dentist_id 
        AND dt.treatment_id = ?
      )`;
      queryParams.push(treatment_id);
    }

    query += `
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.education, d.license_no, d.photo
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
    console.error('❌ Error in getAvailableDentistsForAdmin:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error.message
    });
  }
};

// Get available time slots for admin
exports.getAvailableSlotsForAdmin = async (req, res) => {
  try {
    const { date, dentistId, treatmentId } = req.query;

    if (!date || !dentistId || !treatmentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    console.log('⏰ Admin getting time slots:', { date, dentistId, treatmentId });

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

    // ดึง available slots
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
    const validSlots = [];
    
    for (let i = 0; i < slots.length; i++) {
      let hasEnoughTime = true;
      let consecutiveSlots = 1;
      
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

    console.log('✅ Valid slots for admin:', validSlots.length);

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
    console.error('❌ Error in getAvailableSlotsForAdmin:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเวลาว่าง'
    });
  }
};

// Book appointment for walk-in patient (admin)
exports.bookAppointmentForPatient = async (req, res) => {
  let connection;
  
  try {
    const { patient_id, dentist_id, treatment_id, date, start_time, note } = req.body;

    console.log('📝 Admin booking for patient:', { patient_id, dentist_id, treatment_id, date, start_time });

    if (!patient_id || !dentist_id || !treatment_id || !date || !start_time) {
      return res.status(400).json({ 
        success: false, 
        error: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    // ตรวจสอบวันอาทิตย์
    const appointmentDateTime = new Date(`${date} ${start_time}:00`);
    if (appointmentDateTime.getDay() === 0) {
      return res.status(400).json({
        success: false,
        error: 'คลินิกปิดทำการวันอาทิตย์'
      });
    }

    // ดึง duration
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

    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const dentistIdInt = parseInt(dentist_id);
      const requiredSlotsInt = Math.max(1, parseInt(requiredSlots));

      // ดึง available slots
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

      // ตรวจสอบว่า slot ไหนมี booking แล้ว
      const slotsCheck = [];
      for (const slot of allSlots) {
        if (slotsCheck.length >= requiredSlotsInt) break;
        
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

      console.log('✅ Available slots:', slotsCheck.length, '/ Required:', requiredSlotsInt);

      if (slotsCheck.length < requiredSlotsInt) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          error: `ช่วงเวลานี้ไม่เพียงพอสำหรับการรักษา (ต้องการ ${requiredSlotsInt} ช่วง, มีว่าง ${slotsCheck.length} ช่วง)` 
        });
      }

      // ตรวจสอบว่า slots ต่อเนื่อง
      for (let i = 0; i < slotsCheck.length - 1; i++) {
        if (slotsCheck[i].end_time !== slotsCheck[i + 1].start_time) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: 'ช่วงเวลาที่เลือกไม่ต่อเนื่องกัน'
          });
        }
      }

      // สร้าง queuedetail
      const [queueDetailResult] = await connection.execute(`
        INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [patient_id, treatment_id, dentistIdInt, date]);

      const queueDetailId = queueDetailResult.insertId;

      // ✅ สร้าง queue โดยใช้ 'confirm' แทน 'pending' เพราะเป็น admin จอง
      const [queueResult] = await connection.execute(`
        INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
        VALUES (?, ?, ?, ?, ?, 'confirm')
      `, [queueDetailId, patient_id, treatment_id, dentistIdInt, appointmentDateTime]);

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
          p.phone as patient_phone,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.license_no,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.queue_id = ?
      `, [queueId]);

      // ✅ คำนวณเวลาสิ้นสุด
      const endDateTime = new Date(appointmentDateTime.getTime() + (duration * 60000));
      const endTime = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;

      await connection.commit();

      console.log('✅ Admin booking successful:', queueId);

      res.json({
        success: true,
        message: 'จองนัดหมายสำเร็จ (ยืนยันแล้ว)',
        booking: {
          queue_id: queueId,
          appointment_time: appointmentDateTime,
          appointment_date: date,
          start_time: start_time,
          end_time: endTime,
          patient_name: bookingDetails[0]?.patient_name,
          patient_phone: bookingDetails[0]?.patient_phone,
          dentist_name: bookingDetails[0]?.dentist_name,
          dentist_license: bookingDetails[0]?.license_no,
          treatment_name: bookingDetails[0]?.treatment_name,
          duration: bookingDetails[0]?.duration,
          status: 'confirm'
        }
      });

    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error in bookAppointmentForPatient:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการจองนัดหมาย: ' + error.message
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get calendar data for admin (same as patient but different permission)
exports.getCalendarDataForAdmin = async (req, res) => {
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
    
    console.log('📅 Admin getting calendar data:', { year, month, startDate, endDate, treatment_id });
    
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
    
    console.log('✅ Admin calendar data:', rawData.length, 'records');
    
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
    
    const calendarData = Object.values(groupedByDate);
    
    res.json({
      success: true,
      calendar_data: calendarData,
      year: parseInt(year),
      month: parseInt(month)
    });
    
  } catch (error) {
    console.error('❌ Error in getCalendarDataForAdmin:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน',
      details: error.message
    });
  }
};