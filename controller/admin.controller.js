const db = require('../config/db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Import Admin Models
const {
  AdminModel,
  DentistAdminModel,
  PatientAdminModel,
  TreatmentAdminModel,
  AppointmentAdminModel,
  NotificationAdminModel,
  ReportAdminModel,
  QueueModel,
  AvailableSlotsModel
} = require('../models');

// -------------------- แสดงโปรไฟล์ --------------------
exports.getProfile = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  try {
    const user = await AdminModel.getProfile(userId);
    
    if (!user) return res.redirect('/login');

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
    const currentHashedPassword = await AdminModel.getCurrentPassword(userId);
    if (!currentHashedPassword) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const match = await bcrypt.compare(currentPassword, currentHashedPassword);
    if (!match) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect.' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await AdminModel.updatePassword(userId, hashedPassword);

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
// exports.getDashboard = async (req, res) => {
//   try {
//     // ดึงข้อมูลตารางเวลาของทันตแพทย์ทั้งหมด
//     const scheduleData = await AdminModel.getDashboardData();

//     // จัดรูปแบบข้อมูลสำหรับ FullCalendar
//     const events = [];
    
//     // Group schedules by dentist and date
//     const groupedSchedules = {};
    
//     scheduleData.forEach(schedule => {
//       const dateKey = schedule.schedule_date.toISOString().split('T')[0];
//       const dentistKey = `${schedule.fname} ${schedule.lname}`;
      
//       if (!groupedSchedules[dateKey]) {
//         groupedSchedules[dateKey] = {};
//       }
      
//       if (!groupedSchedules[dateKey][dentistKey]) {
//         groupedSchedules[dateKey][dentistKey] = {
//           dentist: dentistKey,
//           specialty: schedule.specialty,
//           schedules: [],
//           hasAppointments: false
//         };
//       }
      
//       groupedSchedules[dateKey][dentistKey].schedules.push(schedule);
      
//       if (schedule.appointment_count > 0) {
//         groupedSchedules[dateKey][dentistKey].hasAppointments = true;
//       }
//     });

//     // Create events for FullCalendar
//     Object.keys(groupedSchedules).forEach(date => {
//       Object.keys(groupedSchedules[date]).forEach(dentistName => {
//         const dentistData = groupedSchedules[date][dentistName];
        
//         if (dentistData.schedules.length === 0) return;
        
//         // Sort schedules by hour
//         dentistData.schedules.sort((a, b) => a.hour - b.hour);
        
//         // Group continuous working hours
//         const workingBlocks = [];
//         let currentBlock = null;
        
//         dentistData.schedules.forEach(schedule => {
//           if (schedule.status === 'dayoff') {
//             if (currentBlock) {
//               workingBlocks.push(currentBlock);
//               currentBlock = null;
//             }
//             workingBlocks.push({
//               type: 'dayoff',
//               start: schedule.start_time,
//               end: schedule.end_time,
//               note: schedule.note
//             });
//           } else {
//             if (!currentBlock) {
//               currentBlock = {
//                 type: 'working',
//                 start: schedule.start_time,
//                 end: schedule.end_time,
//                 hasAppointments: schedule.appointment_count > 0
//               };
//             } else {
//               currentBlock.end = schedule.end_time;
//               if (schedule.appointment_count > 0) {
//                 currentBlock.hasAppointments = true;
//               }
//             }
//           }
//         });
        
//         if (currentBlock) {
//           workingBlocks.push(currentBlock);
//         }
        
//         // Create FullCalendar events
//         workingBlocks.forEach(block => {
//           if (block.type === 'dayoff') {
//             events.push({
//               title: `Dr. ${dentistName}\nDay Off`,
//               start: date,
//               color: '#f5f5f5',
//               textColor: '#999',
//               borderColor: '#ddd'
//             });
//           } else {
//             const startTime = block.start.substring(0, 5); // HH:MM
//             const endTime = block.end.substring(0, 5);
            
//             events.push({
//               title: `Dr. ${dentistName}\n${startTime}-${endTime}${block.hasAppointments ? ' (Has Appointments)' : ''}`,
//               start: date,
//               color: block.hasAppointments ? '#fce4ec' : '#e8f5e8',
//               textColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
//               borderColor: block.hasAppointments ? '#c2185b' : '#2e7d32'
//             });
//           }
//         });
//       });
//     });

//     res.render('admin-dashboard', { events: JSON.stringify(events) });
    
//   } catch (error) {
//     console.error('Error loading dashboard:', error);
//     res.render('admin-dashboard', { events: JSON.stringify([]) });
//   }
// };

exports.getScheduleAPI = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'กรุณาเข้าสู่ระบบก่อน'
    });
  }

  try {
    // ดึงข้อมูลตารางเวลาทันตแพทย์ทั้งหมดจาก Model
    const schedules = await DentistAdminModel.getAllSchedulesForCalendar();

    console.log('📊 Raw schedules from DB:', schedules);

    // จัดกลุ่มตามวันที่และทันตแพทย์
    const groupedByDate = {};

    schedules.forEach(schedule => {
      // แปลงวันที่
      let dateStr;
      if (schedule.schedule_date instanceof Date) {
        const year = schedule.schedule_date.getFullYear();
        const month = String(schedule.schedule_date.getMonth() + 1).padStart(2, '0');
        const day = String(schedule.schedule_date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else {
        dateStr = String(schedule.schedule_date).split('T')[0];
      }

      const dentistKey = `${schedule.dentist_id}`;
      const dateKey = dateStr;

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {};
      }

      if (!groupedByDate[dateKey][dentistKey]) {
        groupedByDate[dateKey][dentistKey] = {
          dentist_id: schedule.dentist_id,
          fname: schedule.fname,
          lname: schedule.lname,
          specialty: schedule.specialty,
          status: schedule.status,
          appointment_count: 0,
          schedules: []
        };
      }

      groupedByDate[dateKey][dentistKey].schedules.push(schedule);
      groupedByDate[dateKey][dentistKey].appointment_count += parseInt(schedule.appointment_count) || 0;
    });

    // สร้าง events แบบแสดงทันตแพทย์ต่อวัน (ไม่แยกช่วงเวลา)
    const events = [];

    Object.keys(groupedByDate).forEach(dateStr => {
      const dentistsOnThisDay = groupedByDate[dateStr];

      Object.keys(dentistsOnThisDay).forEach(dentistKey => {
        const dentistInfo = dentistsOnThisDay[dentistKey];
        const scheduleList = dentistInfo.schedules;

        // หาช่วงเวลาเริ่มต้นและสิ้นสุด
        const times = scheduleList
          .filter(s => s.status === 'working')
          .sort((a, b) => a.start_time.localeCompare(b.start_time));

        const startTime = times.length > 0 ? times[0].start_time : '00:00:00';
        const endTime = times.length > 0 ? times[times.length - 1].end_time : '23:59:59';

        const hasWorking = scheduleList.some(s => s.status === 'working');
        const isDayOff = scheduleList.every(s => s.status === 'dayoff');

        events.push({
          id: `dentist_${dentistInfo.dentist_id}_${dateStr}`,
          title: `ทพ. ${dentistInfo.fname} ${dentistInfo.lname}`,
          start: dateStr,
          end: dateStr,
          allDay: true,
          backgroundColor: isDayOff ? '#f5f5f5' : (dentistInfo.appointment_count > 0 ? '#fce4ec' : '#e8f5e8'),
          borderColor: isDayOff ? '#999' : (dentistInfo.appointment_count > 0 ? '#c2185b' : '#2e7d32'),
          textColor: isDayOff ? '#999' : (dentistInfo.appointment_count > 0 ? '#c2185b' : '#2e7d32'),
          extendedProps: {
            dentist: `${dentistInfo.fname} ${dentistInfo.lname}`,
            specialty: dentistInfo.specialty || 'ทันตแพทย์ทั่วไป',
            startTime: startTime.substring(0, 5),
            endTime: endTime.substring(0, 5),
            type: isDayOff ? 'dayoff' : 'working',
            hasAppointments: dentistInfo.appointment_count > 0,
            appointmentCount: dentistInfo.appointment_count,
            note: scheduleList.find(s => s.note)?.note || null
          }
        });
      });
    });

    console.log('📊 Total events created:', events.length);
    console.log('📅 Events:', events);

    res.json({
      success: true,
      events: events,
      total: events.length
    });

  } catch (err) {
    console.error('Error fetching schedule data:', err);
    res.status(500).json({
      success: false,
      message: 'ไม่สามารถโหลดข้อมูลตารางเวลาได้',
      error: err.message
    });
  }
};

// -------------------- แสดงรายการนัด --------------------
exports.viewAppointments = async (req, res) => {
  try {
    const weekOffset = parseInt(req.query.weekOffset) || 0;
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

    const appointments = await AdminModel.getAppointmentsByDate(selectedDate);

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
    const appointments = await AdminModel.getAllAppointments(date);

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
  // Handle new license format (prefix + number)
  const license_prefix = req.body.license_prefix || '';
  const license_number = req.body.license_no || '';
  const license_no = license_prefix && license_number ? `${license_prefix} ${license_number}` : (req.body.license_no || '');

  console.log('Processed data:', {
    email, fname, lname, dob, id_card, license_no, specialty, education, address, phone,
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
    const emailExists = await DentistAdminModel.checkEmailExists(email);
    
    if (emailExists) {
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
      fname, lname, dobValue, id_card, license_no, specialty, 
      educationValue, addressValue, phone, photoFilename
    });
    
    // สร้าง dentist record
    const dentistData = {
      email,
      hashedPassword,
      fname,
      lname,
      dob: dobValue,
      id_card,
      license_no,
      specialty,
      education: educationValue,
      address: addressValue,
      phone,
      photo: photoFilename
    };
    
    const result = await DentistAdminModel.createDentist(dentistData);
    
    console.log('='.repeat(60));
    console.log('Dentist created successfully');
    console.log('='.repeat(60));
    
    // ส่งกลับ JSON response
    res.json({
      success: true,
      message: result.message,
      redirect: '/admin/dentists',
      dentist: {
        userId: result.userId,
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
  const dentist = await DentistAdminModel.getDentistById(id);
  res.render('admin/dentists/view-dentist', { dentist });
};

exports.editDentistForm = async (req, res) => {
  const id = req.params.id;
  const dentist = await DentistAdminModel.getDentistById(id);

  if (!dentist) return res.status(404).send('Dentist not found');

  // ✅ แปลง dob เป็น Date object ถ้ามีค่า
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
    // ใช้ Model แทนการเขียน SQL ใน controller
    const dentist = await DentistAdminModel.getDentistById(id);
    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }

    const currentDentist = { ...dentist, current_email: dentist.email };
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
    // Handle new license format (prefix + number)
    const license_prefix = req.body.license_prefix || '';
    const license_number = req.body.license_no || '';
    const license_no = license_prefix && license_number ? `${license_prefix} ${license_number}` : (req.body.license_no || currentDentist.license_no);
    
    // จัดการ dob
    let dob = req.body.dob || currentDentist.dob;
    if (dob instanceof Date) {
      dob = dob.toISOString().split('T')[0];
    } else if (typeof dob === 'string') {
      dob = dob.trim();
    }

    // ตรวจสอบอีเมลซ้ำด้วย Model
    if (email && email !== currentDentist.current_email) {
      const emailExists = await DentistAdminModel.checkEmailExists(email, userId);
      if (emailExists) {
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

    // ✅ ตรวจสอบเลขบัตรประชาชนซ้ำด้วย Model
    if (id_card && id_card !== currentDentist.id_card) {
      const idCardExists = await DentistAdminModel.checkIdCardExists(id_card, id);
      if (idCardExists) {
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

    // ✅ ตรวจสอบเลขใบอนุญาตซ้ำด้วย Model
    if (license_no && license_no !== currentDentist.license_no) {
      const licenseExists = await DentistAdminModel.checkLicenseExists(license_no, id);
      if (licenseExists) {
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

    // สร้างข้อมูลสำหรับอัปเดตผ่าน Model
    const hashedPassword = password && password.trim() !== '' ? await bcrypt.hash(password, 10) : undefined;

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

    // อัปเดตข้อมูลผ่าน Model (รวมทั้ง user และ dentist)
    await DentistAdminModel.updateDentist(id, {
      email,
      password: hashedPassword,
      fname,
      lname,
      dob: dobValue,
      id_card,
      license_no,
      specialty,
      education: educationValue,
      address: addressValue,
      phone,
      photo: photoFilename
    });
    
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
    await DentistAdminModel.deleteDentist(id);
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
    const rows = await PatientAdminModel.getAllPatients();
    res.render('admin/patient/admin-patients', { patients: rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load patients');
  }
};

// API: Get all patients for the modern interface
exports.getPatientsAPI = async (req, res) => {
  try {
    const rows = await PatientAdminModel.getAllPatientsWithDetails();

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
    
    const patient = await PatientAdminModel.getPatientById(id);

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'Patient not found'
      });
    }
    
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
    
    // ใช้ Model แทนการเขียน SQL ใน controller
    const patient = await PatientAdminModel.getPatientById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วย'
      });
    }

    await PatientAdminModel.deletePatient(id);

    res.json({
      success: true,
      message: `ลบข้อมูลผู้ป่วย ${patient.fname || 'ไม่ระบุ'} ${patient.lname || ''} เรียบร้อยแล้ว`
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการลบผู้ป่วย:', error);
    
    // จัดการ foreign key constraint error โดยเฉพาะ
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(409).json({
        success: false,
        error: 'ไม่สามารถลบผู้ป่วยได้ เนื่องจากมีข้อมูลนัดหมายหรือประวัติการรักษาที่เกี่ยวข้อง กรุณายกเลิกนัดหมายทั้งหมดก่อน',
        code: 'FOREIGN_KEY_CONSTRAINT'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถลบผู้ป่วยได้: ' + error.message,
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
    // ตรวจสอบอีเมลซ้ำผ่าน Model
    const emailExists = await PatientAdminModel.checkEmailExists(email);
    if (emailExists) {
      return res.status(400).json({
        success: false,
        error: 'Email address is already in use'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await PatientAdminModel.createPatient({
      email,
      hashedPassword,
      fname,
      lname,
      dob,
      id_card,
      phone,
      address: address || '',
      gender: gender || null,
      chronic_disease: chronic_disease || null,
      allergy_history: drug_allergy || null
    });

      console.log('✅ Patient created successfully');
      
      res.json({
        success: true,
        message: 'Patient added successfully',
        redirect: '/admin/patients'
      });
    
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
    const count = await NotificationAdminModel.getUnreadCount();
    return count;
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงจำนวนที่ยังไม่อ่าน:', error);
    return 0;
  }
}

// แสดงฟอร์มแก้ไข patient
exports.showEditPatientForm = async (req, res) => {
  const id = req.params.id;
  try {
    const patient = await PatientAdminModel.getPatientById(id);
    if (!patient) return res.status(404).send('Patient not found');
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
    await PatientAdminModel.updatePatient(id, {
      fname, lname, dob: dob || null, phone: phone || '', address: address || ''
    });
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
    const patient = await PatientAdminModel.getPatientById(id);
    if (!patient) return res.status(404).send('Patient not found');
    res.render('admin/patient/view-patient', { patient });
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
    await PatientAdminModel.deletePatient(id);

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
    const patient = await PatientAdminModel.getPatientById(id);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // เตรียม payload และ hash password ถ้ามี
          const bcrypt = require('bcrypt');
    const payload = { ...updateData };
    if (updateData.password) {
      payload.password = await bcrypt.hash(updateData.password, 10);
    }

    // อัปเดตผ่านโมเดล
    await PatientAdminModel.updatePatient(id, payload);

    // สร้าง notification ผ่านโมเดล
    await NotificationAdminModel.createNotification({
      type: 'patient_update',
      title: 'Patient Information Updated',
      message: `Patient ${updateData.fname || patient.fname} ${updateData.lname || patient.lname}'s information has been updated`,
      patient_id: Number(id),
      is_read: 0,
      is_new: 1
    });

    res.json({ success: true, message: 'Patient updated successfully' });

    } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update patient: ' + error.message });
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

    // ใช้โมเดลเพื่อตรวจสอบอีเมล
    const availability = await PatientAdminModel.checkEmailAvailability(email);
    const exists = !availability.available;

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
    const patient = await PatientAdminModel.getPatientById(id);
    if (!patient) {
      return res.status(404).render('error', { 
        message: 'Patient not found',
        backUrl: '/admin/patients'
      });
    }
    
    // Format date สำหรับ HTML input
    if (patient.dob) {
      patient.dob = new Date(patient.dob).toISOString().split('T')[0];
    }

    // เพิ่มสถิติ
    // นับสถิตินัดหมายด้วย QueueModel
    const total = await QueueModel.count({ patientId: Number(id) });
    patient.stats = { total_appointments: total };

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
    const groupedHistory = await PatientAdminModel.getPatientTreatmentHistoryGrouped(id);

    res.render('admin/patient/treatment-history/patient-treatment', {
      groupedHistory,
      patientId: id
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};


// ✅ REFACTORED: ใช้ Model แทน SQL
exports.viewTreatmentDetails = async (req, res) => {
  const { id, queueId } = req.params;

  try {
    // ใช้ Model ดึงข้อมูลประวัติการรักษา
    const { TreatmentHistoryModel } = require('../models');
    const treatment = await TreatmentHistoryModel.findByQueueIdWithDetails(queueId);

    if (!treatment) {
      return res.status(404).send('ไม่พบข้อมูลการรักษา');
    }

    // ตรวจสอบว่าเป็นผู้ป่วยคนเดียวกันหรือไม่
    if (treatment.patient_id !== parseInt(id)) {
      return res.status(403).send('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
    }

    // จัดรูปแบบวันที่และเวลา (View Logic - อยู่ใน Controller ได้)
    const dateObj = new Date(treatment.appointment_time);
    const endTime = new Date(dateObj.getTime() + (treatment.duration * 60000));

    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const day = dateObj.getDate();
    const month = thaiMonths[dateObj.getMonth()];
    const year = dateObj.getFullYear() + 543;

    const startHours = dateObj.getHours().toString().padStart(2, '0');
    const startMinutes = dateObj.getMinutes().toString().padStart(2, '0');
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');

    // เพิ่มข้อมูลที่จัดรูปแบบแล้ว
    const detail = {
      ...treatment,
      time: treatment.appointment_time,
      dentist_name: `${treatment.dentist_fname} ${treatment.dentist_lname}`,
      formattedDate: `${day} ${month} ${year}`,
      formattedTime: `${startHours}:${startMinutes} น.`,
      formattedTimeRange: `${startHours}:${startMinutes} - ${endHours}:${endMinutes} น.`,
      formattedDuration: `${treatment.duration} นาที`,
      // เพิ่มข้อมูลที่อาจจะไม่มีใน treatmentHistory
      diagnosis: treatment.diagnosis || '',
      followUpdate: treatment.followUpdate || ''
    };

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
    const treatments = await TreatmentAdminModel.getAllTreatments();
    res.render('admin/treatment/admin-treatments', { treatments });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading treatments');
  }
};

exports.viewTreatment = async (req, res) => {
  const { id } = req.params;

  try {
    const treatment = await TreatmentAdminModel.getTreatmentByIdForAPI(id);

    if (!treatment) return res.status(404).send('Treatment not found');

    res.render('admin/treatment/view-treatment', { treatment });

  } catch (err) {
    console.error('Error fetching treatment:', err);
    res.status(500).send('Server error');
  }
};

exports.showAddTreatmentForm = async (req, res) => {
  try {
    const dentists = await TreatmentAdminModel.getAvailableDentists();
    res.render('admin/treatment/add-treatment', { dentists });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dentists');
  }
};
exports.addTreatment = async (req, res) => {
  const { name, duration, dentist_id } = req.body;
  try {
    await TreatmentAdminModel.createTreatment({
      name,
      duration,
      description: null,
      dentist_ids: dentist_id ? [Number(dentist_id)] : []
    });

    req.flash('success', 'Treatment added successfully.');
    res.redirect('/admin/treatments');
  } catch (err) {
    console.error('Error adding treatment:', err);
    res.status(500).send('Error adding treatment');
  }
};



exports.showEditTreatmentForm = async (req, res) => {
  const treatmentId = req.params.id;

  try {
    const treatment = await TreatmentAdminModel.getTreatmentByIdForAPI(treatmentId);
    const dentistRows = await TreatmentAdminModel.getAvailableDentists();
    if (!treatment) {
      return res.status(404).send('Treatment not found');
    }

    res.render('admin/treatment/edit-treatment', {
      treatment,
      dentists: dentistRows
    });

  } catch (err) {
    console.error('Error fetching treatment:', err);
    res.status(500).send('Internal Server Error');
  }
};




exports.updateTreatment = async (req, res) => {
  const treatmentId = req.params.id;
  const { treatment_name, duration, dentist_ids } = req.body;

  try {
    const ids = Array.isArray(dentist_ids)
      ? dentist_ids.map(Number)
      : dentist_ids
        ? [Number(dentist_ids)]
        : [];

    await TreatmentAdminModel.updateTreatment(treatmentId, {
      name: treatment_name,
      duration,
      description: null,
      dentist_ids: ids
    });

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
    await TreatmentAdminModel.deleteTreatment(treatmentId);
      req.flash('success', 'Treatment deleted successfully.');
    res.redirect('/admin/treatments');
    
  } catch (error) {
    console.error('Error deleting treatment:', error);
    req.flash('error', 'Failed to delete treatment.');
    res.redirect('/admin/treatments'); // ✅ fallback redirect
  }
};
// ==================== Notifications Functions ====================

// ฟังก์ชันกรองการแจ้งเตือนตามประเภทผู้ใช้
function filterNotificationsByUserType(notifications, userType) {
  return notifications.filter(notification => {
    // ถ้าเป็น admin ให้แสดงเฉพาะการแจ้งเตือนที่ไม่ใช่สำหรับผู้ป่วย
    if (userType === 'admin') {
      return !isPatientNotification(notification);
    }
    // ถ้าเป็น dentist ให้แสดงเฉพาะการแจ้งเตือนที่เกี่ยวข้องกับทันตแพทย์
    else if (userType === 'dentist') {
      return !isPatientNotification(notification);
    }
    // ถ้าเป็น patient ให้แสดงเฉพาะการแจ้งเตือนสำหรับผู้ป่วย
    else if (userType === 'patient') {
      return isPatientNotification(notification);
    }
    return true;
  });
}

// ตรวจสอบว่าการแจ้งเตือนนี้เป็นสำหรับผู้ป่วยหรือไม่
function isPatientNotification(notification) {
  // ตรวจสอบจาก patient_id ก่อน
  if (notification.patient_id) {
    return true;
  }
  
  // ตรวจสอบจาก type
  if (notification.type && notification.type.includes('_patient')) {
    return true;
  }
  
  // ตรวจสอบจากข้อความ
  const patientKeywords = [
    'คุณสามารถดูรายละเอียดได้ในประวัติการรักษา',
    'ของคุณแล้ว',
    'คุณมีนัดหมาย',
    'การจองของคุณ',
    'นัดหมายของคุณ',
    'การรักษาของคุณ'
  ];
  
  return patientKeywords.some(keyword => 
    notification.message.includes(keyword)
  );
}

// Get all notifications for admin
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 50, offset = 0, unread_only = 'false', userType = 'admin' } = req.query;

    // แปลงเป็น number ทันที
    const limitNum = Number(limit);
    const offsetNum = Number(offset);

    console.log('🔍 Query params:', { limit, offset, unread_only, limitNum, offsetNum, userType });

    let whereClause = '';

    if (unread_only === 'true') {
      whereClause = 'WHERE n.is_read = 0';
    }

    // ใช้โมเดลดึงข้อมูล
    const notifications = await NotificationAdminModel.getAllNotifications(
      unread_only === 'true' ? { is_read: 0 } : {}
    );
    
    // กรองการแจ้งเตือนตามประเภทผู้ใช้
    const filteredNotifications = filterNotificationsByUserType(notifications, userType);
    
    const totalCount = filteredNotifications.length;
    const unreadCount = filteredNotifications.filter(n => !n.is_read).length;

    res.json({
      success: true,
      notifications: filteredNotifications,
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

// API: Get unread notification count
exports.getUnreadNotificationCount = async (req, res) => {
  try {
    const count = await getUnreadNotificationCount();
    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงจำนวนการแจ้งเตือนที่ยังไม่ได้อ่านได้',
      count: 0
    });
  }
};

// Get single notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await NotificationAdminModel.getNotificationById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      notification
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
    await NotificationAdminModel.markAsRead(id);

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
    const result = await NotificationAdminModel.markAllAsRead();
    res.json({
      success: true,
      message: `${result.updatedCount} notifications marked as read`
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
    await NotificationAdminModel.deleteNotification(id);

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
        queue_id = null,
      dentist_id = null, 
      patient_id = null 
    } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'จำเป็นต้องระบุประเภท ชื่อเรื่อง และข้อความ'
      });
    }

    const result = await NotificationAdminModel.createNotification({
      type,
      title,
      message,
      queue_id,
      dentist_id,
      patient_id,
      is_read: 0,
      is_new: 1
    });

    res.json({
      success: true,
      message: 'สร้างการแจ้งเตือนสำเร็จ',
      notification_id: result.notification_id
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือน:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถสร้างการแจ้งเตือนได้',
      details: error.message
    });
  }
};

// Helper function to get unread notification count
async function getUnreadNotificationCount() {
  try {
    return await NotificationAdminModel.getUnreadCount();
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการดึงจำนวนที่ยังไม่อ่าน:', error);
    return 0;
  }
}

// ==================== Utility Functions for Notifications ====================

// Create notification when new appointment is made
async function createAppointmentNotification(appointmentId, patientId, dentistId) {
  try {
    await NotificationAdminModel.createAppointmentNotification(appointmentId, patientId, dentistId);
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนนัดหมาย:', error);
  }
}

// Create notification when appointment is cancelled
async function createCancellationNotification(appointmentId, patientId, dentistId) {
  try {
    await NotificationAdminModel.createCancellationNotification(appointmentId, patientId, dentistId);
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนการยกเลิก:', error);
  }
}

// Create notification when dentist updates schedule
async function createScheduleUpdateNotification(dentistId, date, action) {
  try {
    await NotificationAdminModel.createNotification({
      type: 'schedule_update',
      title: '📅 มีการอัปเดตตารางงาน',
      message: `ทพ.${dentistId} ${action} ตารางงานสำหรับ ${date}`,
      dentist_id: dentistId,
      is_read: 0,
      is_new: 1
    });
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนการอัปเดตตารางงาน:', error);
  }
}

// Export utility functions for use in other controllers
module.exports.notificationUtils = {
  createAppointmentNotification,
  createCancellationNotification,
  createScheduleUpdateNotification,
  getUnreadNotificationCount
};

// Get appointments for a specific date with filtering
exports.getAppointmentsAPI = async (req, res) => {
  try {
    const { 
      date,
      date_from,
      date_to,
      status,
      dentist_id,
      treatment_id,
      search
    } = req.query;
    
    const filters = {};
    
    // Handle date filtering - prioritize date range over single date
    if (date_from || date_to) {
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;
    } else if (date) {
      filters.date = date;
    } else {
      // Default to today if no date specified
      filters.date = new Date().toISOString().split('T')[0];
    }
    
    // Add other filters if provided
    if (status) filters.status = status;
    if (dentist_id) filters.dentist_id = dentist_id;
    if (treatment_id) filters.treatment_id = treatment_id;
    if (search) filters.search = search;
    
    const appointments = await AppointmentAdminModel.getAllAppointments(filters);

    res.json({
      success: true,
      appointments: appointments,
      filters: filters,
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
    const appointment = await AppointmentAdminModel.getAppointmentById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    res.json({
      success: true,
      appointment
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
    const currentAppointment = await AppointmentAdminModel.getAppointmentById(id);

    if (!currentAppointment) {
      console.log('❌ Appointment not found');
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    console.log('✅ Appointment found:', currentAppointment);

    // Update via model to keep SQL out of controller
    console.log('📝 Updating appointment via model...');
    await AppointmentAdminModel.updateAppointment(id, {
      patient_id: currentAppointment.patient_id,
      dentist_id, 
      treatment_id, 
      date: new Date(appointment_datetime).toISOString().split('T')[0],
      time: appointment_datetime,
      status: status || 'pending'
    });

    // Create a simple notification
    try {
      await NotificationAdminModel.createNotification({
        type: 'appointment_updated',
        title: '📝 มีการอัปเดตนัดหมาย',
        message: `อัปเดตนัดหมายสำหรับ ${currentAppointment.patient_name}`,
        patient_id: currentAppointment.patient_id,
        is_read: 0,
        is_new: 1
      });
      console.log('✅ สร้างการแจ้งเตือนสำเร็จ');
    } catch (notificationError) {
      console.log('⚠️ การสร้างการแจ้งเตือนล้มเหลว (แต่ดำเนินการต่อ):', notificationError.message);
    }

    // Get updated appointment data
    const updated = await AppointmentAdminModel.getAppointmentById(currentAppointment.queuedetail_id);

    console.log('✅ Update successful');
    
    res.json({
      success: true,
      message: 'อัปเดตนัดหมายสำเร็จ',
      appointment: updated || {
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
      error: 'ไม่สามารถอัปเดตนัดหมายได้',
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

    // Get dentist schedule for the specified date via model
    const scheduleData = await AppointmentAdminModel.getDentistSchedule(id, date);

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
    const { dentist_id, appointment_datetime, exclude_queue_id } = req.query;

    if (!dentist_id || !appointment_datetime) {
      return res.status(400).json({
        success: false,
        error: 'Dentist ID and appointment datetime are required'
      });
    }

    // Check for conflicts via model
    const conflicts = await AppointmentAdminModel.validateAppointmentTime({
      dentist_id,
      appointment_datetime,
      exclude_queue_id
    });

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
    const validStatuses = ['pending', 'confirm', 'cancel', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'สถานะไม่ถูกต้อง ต้องเป็น pending, confirm, cancel หรือ completed'
      });
    }

    // Get current appointment details for notification
    const appointment = await AppointmentAdminModel.getAppointmentById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบการจองที่ระบุ'
      });
    }
    const oldStatus = appointment.queue_status;

    // Don't update if status is the same
    if (oldStatus === status) {
      return res.status(400).json({
        success: false,
        error: 'สถานะเหมือนเดิม ไม่จำเป็นต้องอัปเดต'
      });
    }

    // Update appointment status via model
    await AppointmentAdminModel.updateAppointmentStatus(id, status);

      // Create notification for the patient
      let notificationTitle = '';
      let notificationMessage = '';
      
      if (status === 'confirm') {
        notificationTitle = 'การจองได้รับการยืนยัน - รอการรักษา';
        notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} เวลา ${new Date(appointment.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} ได้รับการยืนยันแล้ว`;
      } else if (status === 'completed') {
        notificationTitle = 'การรักษาเสร็จสิ้น';
        notificationMessage = `การรักษาของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} เสร็จสิ้นแล้ว`;
      } else if (status === 'cancel') {
        notificationTitle = 'การจองถูกยกเลิก';
        notificationMessage = `การจองของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} ถูกยกเลิก${reason ? ` เหตุผล: ${reason}` : ''}`;
      }

      // Create notification for patient
      let notificationType = '';
      if (status === 'confirm') {
        notificationType = 'appointment_confirmed';
      } else if (status === 'completed') {
        notificationType = 'treatment_completed';
      } else if (status === 'cancel') {
        notificationType = 'appointment_cancelled';
      }
      
      await NotificationAdminModel.createNotification({
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        queue_id: id,
        dentist_id: appointment.dentist_id,
        patient_id: appointment.patient_id,
        is_read: 0,
        is_new: 1
      });

      // Create admin notification for tracking
      let adminNotificationMessage = '';
      if (status === 'confirm') {
        adminNotificationMessage = `ยืนยันการจองสำเร็จ: ${appointment.patient_name} กับ Dr. ${appointment.dentist_name}`;
      } else if (status === 'completed') {
        adminNotificationMessage = `การรักษาเสร็จสิ้น: ${appointment.patient_name} กับ Dr. ${appointment.dentist_name}`;
      } else if (status === 'cancel') {
        adminNotificationMessage = `ยกเลิกการจองสำเร็จ: ${appointment.patient_name} กับ Dr. ${appointment.dentist_name}`;
      }

      await NotificationAdminModel.createNotification({
        type: 'admin_action',
        title: 'การดำเนินการโดยแอดมิน',
        message: adminNotificationMessage,
        queue_id: id,
        dentist_id: appointment.dentist_id,
        patient_id: appointment.patient_id,
        is_read: 0,
        is_new: 1
      });

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
          console.error('เกิดข้อผิดพลาดในการส่งอีเมลแจ้งเตือน:', emailError);
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
          console.error('เกิดข้อผิดพลาดในการส่ง SMS แจ้งเตือน:', smsError);
          // Don't fail the entire operation if SMS fails
        }
      }

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

    // Create appointment via model
    const appointment = await AppointmentAdminModel.createAppointment({
      patient_id,
      treatment_id,
      dentist_id,
      appointment_time,
      notes
    });

    // Create notification
    await createAppointmentNotification(appointment.queue_id, patient_id, dentist_id);

    res.json({
      success: true,
      message: 'Appointment created successfully',
      queue_id: appointment.queue_id
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างนัดหมาย:', error);
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
    
    // Get appointment data before deletion
    const appointment = await AppointmentAdminModel.getAppointmentById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Delete appointment via model
    await AppointmentAdminModel.deleteAppointment(id);

    // Create deletion notification
    await NotificationAdminModel.createNotification({
      type: 'deletion',
      title: 'Appointment Deleted',
      message: `Appointment deleted: ${appointment.patient_name} with Dr. ${appointment.dentist_name}`,
      patient_id: appointment.patient_id,
      is_read: 0,
      is_new: 1
    });

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

    // Compute stats via model
    const stats = await AppointmentAdminModel.getAppointmentStats({ start_date: startDate, end_date: endDate });

    res.json({
      success: true,
      stats: {
        ...stats,
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
    const appointment = await AppointmentAdminModel.getAppointmentById(queueId);
    
    if (appointment) {
      await NotificationAdminModel.createNotification({
        type: 'status_change',
        title: `📝 นัดหมาย${action}`,
        message: `นัดหมายของ ${appointment.patient_name} กับ ทพ.${appointment.dentist_name} ได้รับการ${action}`,
        queue_id: queueId,
        dentist_id: appointment.dentist_id,
        patient_id: appointment.patient_id,
        is_read: 0,
        is_new: 1
      });
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนสถานะ:', error);
  }
}

// Enhanced appointment notification creation
async function createAppointmentNotification(queueId, patientId, dentistId) {
  try {
    await NotificationAdminModel.createAppointmentNotification(queueId, patientId, dentistId);
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนนัดหมาย:', error);
  }
}

// ==================== Dentists API Routes ====================

// API: Get all dentists for the modern interface
exports.getDentistsAPI = async (req, res) => {
  try {
    const dentists = await DentistAdminModel.getDentistsForAPI();

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
    
    const dentist = await DentistAdminModel.getDentistByIdForAPI(id);

    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }
    
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
        await DentistAdminModel.updateDentist(id, { photo: null });
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
    
    // Delete dentist via model
    await DentistAdminModel.deleteDentist(id);
      
      // Create notification for deletion
      await NotificationAdminModel.createNotification({
        type: 'system',
        title: 'Dentist Account Deleted',
        message: `Dentist account has been removed from the system`,
        is_read: 0,
        is_new: 1
      });

      res.json({
        success: true,
        message: `Dentist deleted successfully`
      });

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
    const specialties = await DentistAdminModel.getDentistSpecialties();

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
    const user = await AdminModel.getProfile(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ใช้'
      });
    }

    res.json({
      success: true,
      user_id: user.user_id,
      email: user.email,
      username: user.username || user.email,
      role: user.role_name || 'ผู้ดูแลระบบ',
      role_name: user.role_name,
      fname: '', // ไม่มีในฐานข้อมูล
      lname: '', // ไม่มีในฐานข้อมูล
      full_name: user.username || user.email, // ใช้ username แทน
      last_login: user.last_login,
      created_at: user.created_at,
      status: 'active', // ตั้งค่าคงที่
      dentist_id: null, // ไม่มีในฐานข้อมูล
      patient_id: null, // ไม่มีในฐานข้อมูล
      role_id: user.role_id
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
    const treatments = await TreatmentAdminModel.getTreatmentsForAPI();

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
    
    await TreatmentAdminModel.deleteTreatment(id);
      
      res.json({
        success: true,
        message: 'Treatment deleted successfully'
      });
    
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
    
    const treatment = await TreatmentAdminModel.getTreatmentById(id);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        error: 'Treatment not found'
      });
    }

    res.json({
      success: true,
      treatment: treatment
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
    
    const dentists = await TreatmentAdminModel.getDentistsForTreatment(id);

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

    await TreatmentAdminModel.updateTreatment(id, {
      treatment_name,
      duration: parseInt(duration),
      dentist_ids
    });
      
      res.json({
        success: true,
        message: 'Treatment updated successfully'
      });

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

    const treatment = await TreatmentAdminModel.createTreatment({
      treatment_name: name.trim(),
      duration: parseInt(duration),
      dentist_ids
    });
      
      res.json({
        success: true,
        message: 'Treatment created successfully',
      treatment_id: treatment.treatment_id
      });

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
    const count = await AppointmentAdminModel.getPendingAppointmentsCount();

    res.json({
      success: true,
      pending_count: count
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
    
    const statistics = await ReportAdminModel.getDetailedAppointmentStatistics({
      start_date,
      end_date
    });

    res.json({
      success: true,
      statistics: {
        status_distribution: statistics.statusStats,
        daily_trends: statistics.dailyTrends,
        top_treatments: statistics.topTreatments,
        dentist_performance: statistics.dentistStats,
        date_range: { start_date: start_date || new Date().toISOString().split('T')[0], end_date: end_date || new Date().toISOString().split('T')[0] }
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
    const { queue_ids, status, reason } = req.body;
    
    if (!queue_ids || !Array.isArray(queue_ids) || queue_ids.length === 0) {
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
    for (const queueId of queue_ids) {
      try {
        // Call the single update function
        await updateSingleAppointmentStatus(queueId, status, reason);
        successCount++;
        results.push({ queue_id: queueId, success: true });
      } catch (error) {
        failureCount++;
        results.push({ 
          queue_id: queueId, 
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
        total: queue_ids.length,
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
  const appointment = await AppointmentAdminModel.getAppointmentById(appointmentId);

  if (!appointment) {
    throw new Error(`ไม่พบการจอง ID: ${appointmentId}`);
  }

  // Update status
  await AppointmentAdminModel.updateAppointmentStatus(appointmentId, status);

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
  await NotificationAdminModel.createNotification({
    type: status === 'confirm' ? 'appointment_confirmed' : 'appointment_cancelled',
    title: notificationTitle,
    message: notificationMessage,
    queue_id: appointmentId,
    dentist_id: appointment.dentist_id,
    patient_id: appointment.patient_id,
    is_read: 0,
    is_new: 1
  });

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
    const appointment = await AppointmentAdminModel.getAppointmentById(appointmentId);
    
    if (!appointment) {
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

    // Create appointment via model (includes validation and transaction handling)
    const result = await AppointmentAdminModel.createAppointment({
      patient_id,
      treatment_id,
      dentist_id,
      appointment_time,
      notes
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

      // Create success notification
      try {
      await NotificationAdminModel.createNotification({
        type: 'appointment',
        title: '📝 สร้างนัดหมายใหม่สำเร็จ',
        message: `สร้างนัดหมายใหม่สำหรับ ${result.appointment.patient_name} กับ ทพ.${result.appointment.dentist_name} เรียบร้อยแล้ว`,
        queue_id: result.appointment.id,
        dentist_id: dentist_id,
        patient_id: patient_id,
        is_read: 0,
        is_new: 1
      });
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the entire operation if notification fails
      }

      res.json({
        success: true,
        message: 'Appointment created successfully',
      appointment: result.appointment
    });

  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการสร้างนัดหมาย:', error);
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
    const scheduleData = await AppointmentAdminModel.getDentistScheduleForAPI({
      dentistId: id,
      date: date
    });

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
    
    const treatments = await PatientAdminModel.getPatientTreatmentHistoryForAPI(id);

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
    const dashboardData = await ReportAdminModel.getReportsDashboardData();

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
    
    const result = await ReportAdminModel.getAppointmentStatsAPI({
      period,
      status
    });

    res.json({
      success: true,
      appointments: result.appointments,
      total: result.appointments.length,
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

    const result = await ReportAdminModel.getTreatmentStatsAPI({
      period
    });

    res.json({
      success: true,
      treatments: result.treatments,
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

// API สำหรับรายงาน - สถิติการรักษา
exports.getTreatmentReportStatsAPI = async (req, res) => {
  try {
    const stats = await ReportAdminModel.getTreatmentStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting treatment report stats:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงสถิติการรักษาได้'
    });
  }
};

// API สำหรับรายงาน - สถิติทันตแพทย์
exports.getDoctorReportStatsAPI = async (req, res) => {
  try {
    const stats = await ReportAdminModel.getDentistStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting doctor report stats:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงสถิติทันตแพทย์ได้'
    });
  }
};

// API สำหรับรายงาน - สถิติการนัดหมาย
exports.getAppointmentReportStatsAPI = async (req, res) => {
  try {
    const stats = await ReportAdminModel.getAppointmentStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting appointment report stats:', error);
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถดึงสถิติการนัดหมายได้'
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

    const schedules = await AppointmentAdminModel.getDentistScheduleData({
      dentistId,
      start_date,
      end_date
    });

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
    const rows = await TreatmentAdminModel.getDentistTreatmentMappings();

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
    
    const treatments = await TreatmentAdminModel.getDentistTreatments(id);

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

    const result = await AdminModel.checkIdCardAvailability({ id_card, exclude_dentist_id, exclude_patient_id });

    res.json({
      success: true,
      exists: result.exists,
      valid: true,
      foundIn: result.foundIn,
      message: result.exists ? `ID card already exists in ${result.foundIn}` : 'ID card is available'
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

    const result = await AdminModel.checkEmailAvailabilityEnhanced({ email, exclude_user_id, exclude_dentist_id, exclude_patient_id });

    res.json({
      success: true,
      exists: result.exists,
      valid: true,
      message: result.exists ? 'Email address is already in use' : 'Email is available'
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

    // ตรวจสอบรูปแบบเลขใบประกอบวิชาชีพ (รองรับรูปแบบไทย: ท.บ. 32458)
    const thaiLicensePattern = /^[ท]\.[บปวท]\.\s\d{3,10}$/;
    const oldFormatPattern = /^\d{6,20}$/;
    
    if (!thaiLicensePattern.test(license) && !oldFormatPattern.test(license)) {
      return res.json({
        success: true,
        exists: false,
        valid: false,
        message: 'รูปแบบเลขใบประกอบวิชาชีพไม่ถูกต้อง (เช่น ท.บ. 32458 หรือ ตัวเลข 6-20 หลัก)'
      });
    }

    const result = await DentistAdminModel.checkLicenseAvailability({ license, exclude_dentist_id });

    res.json({
      success: true,
      exists: result.exists,
      valid: true,
      message: result.exists ? 'เลขใบประกอบวิชาชีพนี้มีในระบบแล้ว' : 'เลขใบประกอบวิชาชีพสามารถใช้ได้'
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

    const availableDentists = await DentistAdminModel.getAvailableDentistsForBooking({
      date,
      treatment_id
    });
    
    console.log('✅ Found', availableDentists.length, 'dentists with available slots');

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

    // Get available slots via model
    const result = await AvailableSlotsModel.getAvailableSlotsForAdmin({
      date,
      dentistId,
      treatmentId
    });

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    console.log('✅ Valid slots for admin:', result.validSlots.length);

    res.json({
      success: true,
      slots: result.validSlots,
      date: date,
      dentistId: dentistId,
      treatmentId: treatmentId,
      treatment_duration: result.duration,
      total_slots: result.validSlots.length
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
  try {
    const { patient_id, dentist_id, treatment_id, date, start_time, note } = req.body;

    console.log('📝 Admin booking for patient:', { patient_id, dentist_id, treatment_id, date, start_time });

    if (!patient_id || !dentist_id || !treatment_id || !date || !start_time) {
      return res.status(400).json({ 
        success: false, 
        error: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    const result = await QueueModel.bookAppointmentForPatient({ patient_id, dentist_id, treatment_id, date, start_time, note });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

      res.json({
        success: true,
        message: 'จองนัดหมายสำเร็จ (ยืนยันแล้ว)',
      booking: result.booking
    });

  } catch (error) {
    console.error('❌ Error in bookAppointmentForPatient:', error);
    res.status(500).json({ 
      success: false,
      error: 'เกิดข้อผิดพลาดในการจองนัดหมาย: ' + error.message
    });
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
    
    const result = await ReportAdminModel.getCalendarDataForAdmin({ year, month, treatment_id });
    
    res.json({
      success: true,
      calendar_data: result.calendarData,
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