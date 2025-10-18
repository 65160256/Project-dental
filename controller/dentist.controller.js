// controllers/dentist.controller.js
const db = require('../config/db');

const path = require('path');
const bcrypt = require('bcrypt'); 
const NotificationHelper = require('../utils/notificationHelper');

// helper: แปลง Date เป็น 'YYYY-MM-DD' เพื่อเทียบค่าวันให้แม่น
const toYMD = (d) => {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// helper: จัดรูปแบบวันที่สำหรับแสดงผล
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// helper: จัดรูปแบบเวลาสำหรับแสดงผล
const formatTime = (time) => {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

// Helper function to get status display text
const getStatusDisplayText = (status) => {
  switch (status) {
    case 'completed':
      return 'Recorded';
    case 'pending':
      return 'Not yet filed';
    case 'cancel':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
};

const dentistController = {
  // Dashboard หลัก
 // ✅ REFACTORED: ใช้ Model แทน SQL
getDashboard: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);

    if (!dentist) {
      return res.redirect('/login');
    }

    // ใช้ Model ดึงข้อมูล Dashboard ทั้งหมด
    const dashboardData = await DentistModel.getDashboardData(dentist.dentist_id);

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    const formattedData = {
      dentist,
      ...dashboardData,
      currentDate: new Date().toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth() + 1
    };

    res.render('dentist/dashboard', formattedData);

  } catch (error) {
    console.error('Error in getDashboard:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล Dashboard',
      error
    });
  }
},

  // ✅ REFACTORED: ใช้ Model แทน SQL
getAppointments: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    // ใช้ Model ดึงข้อมูลนัดหมายและสถิติ
    const { appointments, stats } = await QueueModel.findAllWithStats(dentist.dentist_id);

    console.log('Appointments data:', appointments.map(a => ({
      id: a.queue_id,
      status: a.queue_status,
      patient: a.fname + ' ' + a.lname
    })));

    res.render('dentist/appointments', {
      appointments: appointments || [],
      dentist,
      stats,
      currentDate: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Error in getAppointments:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลนัดหมาย',
      error
    });
  }
},

  // ✅ REFACTORED: ใช้ Model แทน SQL
getAppointmentDetail: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const queueId = req.params.id;

      const { DentistModel, QueueModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.redirect('/login');
      }

      // ใช้ Model ดึงข้อมูลนัดหมายพร้อมตรวจสอบสิทธิ์
      const appointment = await QueueModel.findByIdWithDetailsAndAuth(queueId, dentist.dentist_id);

      if (!appointment) {
        return res.status(404).render('error', {
          message: 'ไม่พบข้อมูลนัดหมาย',
          error: { status: 404 }
        });
      }

      res.render('dentist/appointment-detail', { appointment });

    } catch (error) {
      console.error('Error in getAppointmentDetail:', error);
      res.status(500).render('error', {
        message: 'เกิดข้อผิดพลาดในการโหลดรายละเอียดนัดหมาย',
        error
      });
    }
  },

 // ✅ REFACTORED: ใช้ Model แทน SQL
updateAppointmentStatus: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { queueId, status, diagnosis, nextAppointment } = req.body;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model อัปเดตสถานะนัดหมาย (รวมตรวจสอบสิทธิ์)
    const result = await QueueModel.updateAppointmentStatus(queueId, dentist.dentist_id, {
      status,
      diagnosis,
      nextAppointment
    });

    const { oldStatus, appointment } = result;

    // สร้างการแจ้งเตือนตามสถานะใหม่
    if (status === 'confirm' && oldStatus !== 'confirm') {
      await NotificationHelper.createConfirmationNotification(
        queueId,
        appointment.patient_id,
        appointment.dentist_id
      );
    } else if (status === 'cancel' && oldStatus !== 'cancel') {
      await NotificationHelper.createCancellationNotification(
        queueId,
        appointment.patient_id,
        appointment.dentist_id,
        'dentist',
        diagnosis
      );
    } else if (status === 'completed' && oldStatus !== 'completed') {
      await NotificationHelper.createTreatmentRecordNotification(
        queueId,
        appointment.patient_id,
        appointment.dentist_id
      );
    }

    res.json({ success: true, message: 'อัพเดทสถานะนัดหมายเรียบร้อยแล้ว' });

  } catch (error) {
    console.error('Error in updateAppointmentStatus:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการอัพเดทสถานะ'
    });
  }
},

  // ✅ REFACTORED: ใช้ Model แทน SQL - บันทึกตารางงาน - มีการแจ้งเตือน
saveScheduleRange: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate, status, startTime, endTime, note } = req.body;

    console.log('Received schedule save request:', { startDate, endDate, status, startTime, endTime });

    const { DentistModel, DentistScheduleModel } = require('../models');

    // Validation
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุช่วงวันที่'
      });
    }

    if (status === 'working' && (!startTime || !endTime)) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุเวลาทำงาน'
      });
    }

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model บันทึกตารางงาน
    const result = await DentistScheduleModel.saveScheduleRange(
      dentist.dentist_id,
      startDate,
      endDate,
      { status, startTime, endTime, note }
    );

    // สร้างการแจ้งเตือนการเปลี่ยนแปลงตารางงาน
    const dateRangeText = startDate === endDate
      ? `วันที่ ${new Date(startDate).toLocaleDateString('th-TH', {day: '2-digit', month: 'long', year: 'numeric'})}`
      : `${new Date(startDate).toLocaleDateString('th-TH', {day: '2-digit', month: 'long'})} - ${new Date(endDate).toLocaleDateString('th-TH', {day: '2-digit', month: 'long', year: 'numeric'})}`;

    const detailsText = status === 'dayoff'
      ? (note ? `หมายเหตุ: ${note}` : '')
      : `เวลา ${startTime}-${endTime}`;

    await NotificationHelper.createScheduleChangeNotification(
      dentist.dentist_id,
      status === 'dayoff' ? 'dayoff' : 'added',
      dateRangeText,
      detailsText
    );

    const message = status === 'dayoff'
      ? `บันทึกวันหยุดสำเร็จ (${result.insertedDays} วัน${result.skippedSundays > 0 ? `, ข้ามวันอาทิตย์ ${result.skippedSundays} วัน` : ''})`
      : `บันทึกเวลาทำงานสำเร็จ (${result.insertedDays} วัน${result.skippedSundays > 0 ? `, ข้ามวันอาทิตย์ ${result.skippedSundays} วัน` : ''})`;

    res.json({
      success: true,
      message,
      insertedDays: result.insertedDays,
      skippedSundays: result.skippedSundays
    });

  } catch (error) {
    console.error('Error saving schedule range:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกตารางเวลา'
    });
  }
},


// เพิ่มฟังก์ชันแสดงหน้า monthly schedule
// ✅ REFACTORED: ใช้ Model แทน SQL
getMonthlySchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/schedule-monthly', {
      dentist,
      currentDate: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Error in getMonthlySchedule:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าตารางเวลา',
      error
    });
  }
},
// ✅ REFACTORED: ใช้ Model แทน SQL - ลบช่วงวันที่
deleteScheduleRange: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate } = req.body;

    const { DentistModel, DentistScheduleModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ลบตารางเวลา (รวมตรวจสอบนัดหมาย)
    const result = await DentistScheduleModel.deleteScheduleRange(
      dentist.dentist_id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      message: result.message || 'ลบตารางเวลาเรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error deleting schedule range:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการลบตารางเวลา'
    });
  }
},
  // หน้าผู้ป่วย
 // หน้าผู้ป่วย
// ✅ REFACTORED: ใช้ Model แทน SQL
getPatients: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    // ใช้ Model ค้นหาทันตแพทย์
    const { DentistModel, PatientModel } = require('../models');
    const dentist = await DentistModel.findByUserId(userId);

    if (!dentist) {
      return res.redirect('/login');
    }

    // ใช้ Model ดึงข้อมูลผู้ป่วยพร้อมสถิติ
    const patients = await PatientModel.findAllWithStats(dentist.dentist_id);

    res.render('dentist/patients', {
      patients: patients || [],
      dentist,
      currentDate: new Date().toISOString().split('T')[0],
      title: 'All Patients'
    });

  } catch (error) {
    console.error('Error in getPatients:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย',
      error
    });
  }
},

// ฟังก์ชันสำหรับดึงรายละเอียดผู้ป่วย API
// API: ดึงข้อมูลผู้ป่วยพร้อมประวัติการรักษา
// ✅ REFACTORED: ใช้ Model แทน SQL
getPatientDetailAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;

    const { DentistModel, PatientModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ทันตแพทย์สามารถเข้าถึงข้อมูลผู้ป่วยได้ทุกคน

    // ดึงข้อมูลผู้ป่วยพร้อมประวัติการรักษา
    const data = await PatientModel.findByIdWithTreatmentHistory(patientId, dentist.dentist_id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // จัดรูปแบบข้อมูลสำหรับ View (Controller responsibility)
    const formattedTreatmentsByYear = {};
    Object.keys(data.treatmentsByYear).forEach(year => {
      formattedTreatmentsByYear[year] = data.treatmentsByYear[year].map(treatment => ({
        ...treatment,
        formattedDate: new Date(treatment.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formattedTime: new Date(treatment.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        statusText: treatment.queue_status === 'completed' || treatment.queue_status === 'confirm' ?
          'รักษาแล้ว' :
          treatment.queue_status === 'pending' ? 'รอการรักษา' : 'ยกเลิก'
      }));
    });

    res.json({
      success: true,
      patient: {
        ...data.patient,
        formattedDob: data.patient.dob ?
          new Date(data.patient.dob).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : 'ไม่ระบุ',
        formattedCreatedAt: data.patient.created_at ?
          new Date(data.patient.created_at).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : 'ไม่ทราบ'
      },
      treatmentsByYear: formattedTreatmentsByYear,
      stats: data.stats
    });

  } catch (error) {
    console.error('Error in getPatientDetailAPI:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย'
    });
  }
},

// ✅ REFACTORED: ใช้ Model แทน SQL - ค้นหาประวัติการรักษาของผู้ป่วย
searchPatientTreatments: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;
    const { date } = req.query;

    const { DentistModel, PatientModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ใช้ Model ค้นหาประวัติการรักษา
    const treatments = await PatientModel.searchTreatmentsByDate(
      patientId,
      dentist.dentist_id,
      date
    );

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    res.json({
      success: true,
      treatments: treatments.map(t => ({
        ...t,
        formattedDate: new Date(t.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formattedTime: new Date(t.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      }))
    });

  } catch (error) {
    console.error('Error in searchPatientTreatments:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการค้นหา'
    });
  }
},

// ✅ REFACTORED: ใช้ Model แทน SQL - ค้นหาผู้ป่วยแบบละเอียด
searchPatientsAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const {
      q: searchQuery,
      age,
      visits,
      lastVisit,
      sort,
      page = 1,
      limit = 10
    } = req.query;

    const { DentistModel, PatientModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ใช้ Model ค้นหาผู้ป่วยพร้อมฟิลเตอร์
    const result = await PatientModel.searchWithFilters(dentist.dentist_id, {
      searchQuery,
      age,
      visits,
      lastVisit,
      sort,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    res.json({
      success: true,
      patients: result.patients.map(patient => ({
        ...patient,
        formattedLastVisit: patient.last_visit ?
          new Date(patient.last_visit).toLocaleDateString('en-GB') : 'Never',
        status: patient.last_visit &&
          (Date.now() - new Date(patient.last_visit).getTime()) < (90 * 24 * 60 * 60 * 1000) ?
          'active' : 'inactive'
      })),
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error in searchPatientsAPI:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการค้นหาผู้ป่วย'
    });
  }
},


// ✅ REFACTORED: ใช้ Model แทน SQL - ส่งออกข้อมูลผู้ป่วย
exportPatientsData: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { format = 'csv' } = req.query;

    const { DentistModel, PatientModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ใช้ Model ดึงข้อมูลผู้ป่วยสำหรับส่งออก
    const patients = await PatientModel.findAllForExport(dentist.dentist_id);

    if (format === 'csv') {
      // สร้าง CSV
      const csvHeaders = [
        'Patient ID',
        'First Name',
        'Last Name',
        'Phone',
        'Age',
        'Date of Birth',
        'Address',
        'Total Visits',
        'Completed Visits',
        'Cancelled Visits',
        'First Visit',
        'Last Visit',
        'Patient Since'
      ];

      const csvRows = patients.map(p => [
        `P${p.patient_id.toString().padStart(4, '0')}`,
        p.fname,
        p.lname,
        p.phone || '',
        p.age || '',
        p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '',
        p.address || '',
        p.total_visits,
        p.completed_visits,
        p.cancelled_visits,
        p.first_visit ? new Date(p.first_visit).toLocaleDateString('en-GB') : '',
        p.last_visit ? new Date(p.last_visit).toLocaleDateString('en-GB') : '',
        p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : ''
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="patients_${dentist.fname}_${dentist.lname}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // ส่งเป็น JSON
      res.json({
        success: true,
        data: patients,
        exportDate: new Date().toISOString(),
        dentist: `Dr. ${dentist.fname} ${dentist.lname}`,
        totalPatients: patients.length
      });
    }

  } catch (error) {
    console.error('Error in exportPatientsData:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งออกข้อมูล'
    });
  }
},
  // รายละเอียดผู้ป่วย
  // ✅ REFACTORED: ใช้ Model แทน SQL - รายละเอียดผู้ป่วย
  getPatientDetail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.id;

    const { DentistModel, PatientModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) return res.redirect('/login');

    // ใช้ Model ดึงข้อมูลผู้ป่วยพร้อมประวัติการรักษา (รวมตรวจสอบสิทธิ์)
    const patientData = await PatientModel.findByIdWithTreatmentHistory(
      patientId,
      dentist.dentist_id
    );

    if (!patientData) {
      return res.status(404).render('error', {
        message: 'ไม่พบข้อมูลผู้ป่วย',
        error: { status: 404 }
      });
    }

    res.render('dentist/patient-detail', {
      dentist,
      patient: patientData.patient,
      treatmentHistory: patientData.treatmentHistory || []
    });
  } catch (error) {
    console.error('Error in getPatientDetail:', error);

    // Handle permission error
    if (error.message && error.message.includes('ไม่มีสิทธิ์')) {
      return res.status(403).render('error', {
        message: error.message,
        error: { status: 403 }
      });
    }

    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดรายละเอียดผู้ป่วย',
      error
    });
  }
},

  // หน้าตารางเวลา
  // ✅ REFACTORED: ใช้ Model แทน SQL
getSchedule: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const { DentistModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.redirect('/login');
      }

      res.render('dentist/schedule-monthly', {
        dentist,
        currentDate: new Date().toISOString().split('T')[0]
      });

    } catch (error) {
      console.error('Error in getSchedule:', error);
      res.status(500).render('error', {
        message: 'เกิดข้อผิดพลาดในการโหลดตารางเวลา',
        error
      });
    }
  },

// ✅ REFACTORED: ใช้ Model แทน SQL
getEditProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/edit-profile', {
      dentist,
      message: req.query.message || null,
      messageType: req.query.type || 'success'
    });

  } catch (error) {
    console.error('Error in getEditProfile:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าแก้ไขโปรไฟล์',
      error
    });
  }
},
  // ✅ REFACTORED: ใช้ Model แทน SQL
getHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    // ใช้ Model ดึงประวัติการรักษาพร้อมสถิติ
    const { history, stats } = await QueueModel.getTreatmentHistoryWithStats(dentist.dentist_id);

    res.render('dentist/history', {
      dentist,
      treatmentHistory: history,
      patientHistory: history,
      history,
      stats
    });

  } catch (error) {
    console.error('Error in getHistory:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดประวัติ',
      error
    });
  }
},


  // หน้าเพิ่มประวัติการรักษา
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getAddHistoryPage: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId || req.query.queueId;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูลผู้ใช้
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    let appointment = null;

    // ถ้ามี queueId ให้ดึงข้อมูลการจองพร้อมตรวจสอบสิทธิ์
    if (queueId) {
      appointment = await QueueModel.findByIdWithDetails(queueId);

      // ตรวจสอบว่าเป็นของหมอคนนี้หรือไม่
      if (appointment && appointment.dentist_id !== dentist.dentist_id) {
        appointment = null; // ไม่มีสิทธิ์เข้าถึง
      }
    }

    res.render('dentist/add-history', {
      dentist,
      appointment,
      title: 'เพิ่มประวัติการรักษา'
    });

  } catch (error) {
    console.error('Error in getAddHistoryPage:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าเพิ่มประวัติการรักษา',
      error
    });
  }
},

// API to get patient history data  
  // API: ดึงประวัติผู้ป่วยทั้งหมดพร้อมสถิติ
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getPatientHistoryAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'Dentist not found'
      });
    }

    // ใช้ Model ดึงประวัติการรักษาพร้อมสถิติ
    const { history, stats } = await QueueModel.getTreatmentHistoryWithStats(dentist.dentist_id);

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    const formattedHistory = history.map(record => ({
      ...record,
      formattedDate: new Date(record.time).toLocaleDateString('en-GB'),
      formattedTime: new Date(record.time).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      statusText: getStatusDisplayText(record.queue_status)
    }));

    res.json({
      success: true,
      history: formattedHistory,
      stats: {
        totalPatients: stats.uniquePatients,
        totalRecords: stats.total,
        completed: stats.completed,
        pending: stats.pending,
        cancelled: stats.cancelled
      }
    });

  } catch (error) {
    console.error('Error in getPatientHistoryAPI:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติผู้ป่วย'
    });
  }
},

  // API: ดึงประวัติการรักษาของผู้ป่วยคนใดคนหนึ่งแบบละเอียด
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getPatientDetailedHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;

    const { DentistModel, PatientModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ใช้ Model ค้นหาผู้ป่วย
    const patient = await PatientModel.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // ใช้ Model ดึงนัดหมายของผู้ป่วยกับทันตแพทย์คนนี้
    const appointments = await QueueModel.findByPatientId(patientId, {
      limit: 100
    });

    // กรองเฉพาะนัดหมายที่เป็นของทันตแพทย์คนนี้
    const filteredAppointments = appointments.filter(apt =>
      apt.dentist_id === dentist.dentist_id || !apt.dentist_id
    );

    // คำนวณอายุ (Controller responsibility)
    const age = patient.dob ?
      Math.floor((Date.now() - new Date(patient.dob)) / (365.25 * 24 * 60 * 60 * 1000)) :
      null;

    res.json({
      success: true,
      patient: {
        ...patient,
        age
      },
      appointments: filteredAppointments
    });

  } catch (error) {
    console.error('Error in getPatientDetailedHistory:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติผู้ป่วย'
    });
  }
},



  // API: ค้นหาประวัติผู้ป่วยพร้อม filters
  // ✅ REFACTORED: ใช้ Model แทน SQL
  searchPatientHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { query, status, dateFrom, dateTo } = req.query;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ใช้ Model ค้นหาประวัติพร้อม filters
    const searchResult = await QueueModel.searchTreatmentHistory(dentist.dentist_id, {
      query,
      status,
      dateFrom,
      dateTo,
      limit: 100
    });

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    res.json({
      success: true,
      results: searchResult.map(record => ({
        ...record,
        age: record.age || 0,
        formattedDate: new Date(record.time).toLocaleDateString('en-GB'),
        formattedTime: new Date(record.time).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      }))
    });

  } catch (error) {
    console.error('Error in searchPatientHistory:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการค้นหาประวัติผู้ป่วย'
    });
  }
},

  // หน้าโปรไฟล์
 // ✅ REFACTORED: ใช้ Model แทน SQL
getProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ดึงข้อมูลทันตแพทย์พร้อม user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/profile', {
      dentist,
      title: 'My Profile'
    });

  } catch (error) {
    console.error('Error in getProfile:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดโปรไฟล์',
      error
    });
  }
},

  // อัพเดทโปรไฟล์
 // อัพเดทโปรไฟล์
// ✅ REFACTORED: ใช้ Model แทน SQL
updateProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { DentistModel } = require('../models');

    // รับข้อมูลจาก form
    const {
      fname, lname, id_card, license_no, email,
      phone, specialty, address, education, dob,
      license_prefix
    } = req.body;
    
    // Handle new license format (prefix + number)
    const license_number = license_no || '';
    const final_license_no = license_prefix && license_number ? `${license_prefix} ${license_number}` : license_no;

    // จัดการไฟล์รูปภาพ (ถ้ามี)
    const photo = req.file ? req.file.filename : null;

    // เรียกใช้ Model method (จะทำ validation และ update ทั้งหมด)
    const result = await DentistModel.updateProfile(userId, {
      fname, lname, id_card, license_no: final_license_no, email,
      phone, specialty, address, education, dob, photo
    });

    // อัพเดต session ถ้ามีการเปลี่ยน email
    if (req.session.user) {
      req.session.user.email = result.email;
    }

    res.json({
      success: true,
      message: 'อัพเดตโปรไฟล์เรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error in updateProfile:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการอัพเดตโปรไฟล์' 
    });
  }
},

  // เปลี่ยนรหัสผ่าน
  // ✅ REFACTORED: ใช้ Model แทน SQL
  updatePassword: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const { UserModel } = require('../models');

      // Validate matching passwords
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'รหัสผ่านใหม่ไม่ตรงกัน'
        });
      }

      // Use Model to change password (includes validation)
      const result = await UserModel.changePassword(userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: result.message || 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'
      });
    } catch (error) {
      console.error('Error in updatePassword:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'
      });
    }
  },


// ✅ REFACTORED: ใช้ Model แทน SQL
getChangePassword: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ดึงข้อมูลทันตแพทย์
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/change-password', { dentist });

  } catch (error) {
    console.error('Error in getChangePassword:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าเปลี่ยนรหัสผ่าน',
      error
    });
  }
},

// ✅ REFACTORED: ใช้ Model แทน SQL - อัพเดทอีเมล
updateEmail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { newEmail, confirmEmail, password } = req.body;

    console.log('Update email request:', { userId, newEmail, confirmEmail });

    const { UserModel } = require('../models');

    // Validation
    if (!newEmail || !confirmEmail || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({
        success: false,
        error: 'New email addresses do not match'
      });
    }

    // ใช้ Model อัปเดตอีเมล (รวม validation และตรวจสอบรหัสผ่าน)
    const result = await UserModel.updateEmail(userId, newEmail, password);

    console.log('Email updated successfully for user:', userId);

    res.json({
      success: true,
      message: 'Email updated successfully. Please check your inbox for confirmation.',
      email: result.email
    });

  } catch (error) {
    console.error('Error in updateEmail:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการอัพเดทอีเมล'
    });
  }
},

// ดึงการจองล่าสุดของผู้ป่วยกับหมอคนนี้
  // API: ดึงนัดหมายล่าสุดของผู้ป่วย
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getLatestPatientAppointment: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;

    const { DentistModel, PatientModel, QueueModel, TreatmentModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ดึงข้อมูลผู้ป่วย
    const patient = await PatientModel.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // ดึงนัดหมายล่าสุดที่รอรักษา
    let latestAppointments = await QueueModel.findPatientLatestAppointments(
      patientId,
      dentist.dentist_id,
      1
    );

    // กรองเฉพาะ pending/confirm
    let latestAppointment = latestAppointments.find(apt =>
      apt.queue_status === 'pending' || apt.queue_status === 'confirm'
    );

    if (!latestAppointment) {
      // หานัดหมายล่าสุดไม่ว่าสถานะ
      latestAppointments = await QueueModel.findPatientLatestAppointments(
        patientId,
        dentist.dentist_id,
        1
      );

      if (latestAppointments.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No appointments found for this patient'
        });
      }

      return res.json({
        success: true,
        appointment: latestAppointments[0],
        patient,
        isCompleted: true
      });
    }

    // ดึงรายการ treatment สำหรับ dropdown
    const treatments = await TreatmentModel.findAll({ orderBy: 'treatment_name' });

    res.json({
      success: true,
      appointment: latestAppointment,
      patient,
      treatments,
      isCompleted: false
    });

  } catch (error) {
    console.error('Error in getLatestPatientAppointment:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง'
    });
  }
},

// สร้างประวัติการรักษาใหม่
  // API: สร้างประวัติการรักษาใหม่
  // ✅ REFACTORED: ใช้ Model แทน SQL
  createTreatmentHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const {
      patientId,
      treatmentId,
      appointmentDate,
      diagnosis,
      treatmentNotes,
      followUpDate,
      recommendations,
      prescriptions
    } = req.body;

    // Validation
    if (!patientId || !treatmentId || !appointmentDate || !diagnosis) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
      });
    }

    const { DentistModel, PatientModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    // ตรวจสอบว่าผู้ป่วยมีอยู่จริง
    const patient = await PatientModel.findById(patientId);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // สร้าง followUpdate JSON
    const followUpdate = JSON.stringify({
      treatmentNotes: treatmentNotes || '',
      recommendations: recommendations || '',
      prescriptions: prescriptions || '',
      createdAt: new Date().toISOString(),
      dentist: `${dentist.fname} ${dentist.lname}`
    });

    // ใช้ Model สร้างประวัติการรักษาแบบเต็มรูปแบบ
    const result = await QueueModel.createFullTreatmentRecord({
      dentistId: dentist.dentist_id,
      patientId,
      treatmentId,
      appointmentDate,
      diagnosis,
      followUpdate,
      followUpDate: followUpDate || null
    });

    res.json({
      success: true,
      message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
      queueId: result.queueId
    });

  } catch (error) {
    console.error('Error in createTreatmentHistory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา'
    });
  }
},
  // หน้าการรักษา
  // ✅ REFACTORED: ใช้ Model แทน SQL
getTreatments: async (req, res) => {
    try {
      const { TreatmentModel } = require('../models');

      // ใช้ Model ดึงรายการการรักษาทั้งหมด
      const treatments = await TreatmentModel.findAll({ orderBy: 'treatment_name' });

      res.render('dentist/treatments', { treatments });

    } catch (error) {
      console.error('Error in getTreatments:', error);
      res.status(500).render('error', {
        message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลการรักษา',
        error
      });
    }
  },

  // ✅ REFACTORED: ใช้ Model แทน SQL
addTreatment: async (req, res) => {
    try {
      const { treatment_name, duration } = req.body;

      const { TreatmentModel } = require('../models');

      // ใช้ Model สร้างการรักษาใหม่
      await TreatmentModel.create({
        treatmentName: treatment_name,
        duration
      });

      res.json({ success: true, message: 'เพิ่มการรักษาเรียบร้อยแล้ว' });

    } catch (error) {
      console.error('Error in addTreatment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการเพิ่มการรักษา'
      });
    }
  },

  // ✅ REFACTORED: ใช้ Model แทน SQL
updateTreatment: async (req, res) => {
    try {
      const treatmentId = req.params.id;
      const { treatment_name, duration } = req.body;

      const { TreatmentModel } = require('../models');

      // ใช้ Model แก้ไขการรักษา
      await TreatmentModel.update(treatmentId, {
        treatmentName: treatment_name,
        duration
      });

      res.json({ success: true, message: 'แก้ไขการรักษาเรียบร้อยแล้ว' });

    } catch (error) {
      console.error('Error in updateTreatment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการแก้ไขการรักษา'
      });
    }
  },

  // ✅ REFACTORED: ใช้ Model แทน SQL
deleteTreatment: async (req, res) => {
    try {
      const treatmentId = req.params.id;

      const { TreatmentModel } = require('../models');

      // ใช้ Model ลบการรักษา (Model จะตรวจสอบการใช้งานเอง)
      await TreatmentModel.delete(treatmentId);

      res.json({ success: true, message: 'ลบการรักษาเรียบร้อยแล้ว' });

    } catch (error) {
      console.error('Error in deleteTreatment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการลบการรักษา'
      });
    }
  },

  // หน้ารายงาน
  // หน้ารายงาน - สถิติรายเดือนย้อนหลัง 12 เดือน
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getReports: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const { DentistModel, ReportModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.redirect('/login');
      }

      // ใช้ Model ดึงสถิติรายเดือน
      const monthlyStats = await ReportModel.getMonthlyStatistics(dentist.dentist_id);

      res.render('dentist/reports', { monthlyStats });
    } catch (error) {
      console.error('Error in getReports:', error);
      res.status(500).render('error', {
        message: 'เกิดข้อผิดพลาดในการโหลดรายงาน',
        error
      });
    }
  },

  // API: รายงานรายเดือน - ดึงนัดหมายทั้งหมดในเดือนที่ระบุ
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getMonthlyReport: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { year, month } = req.query;

      const { DentistModel, ReportModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.redirect('/login');
      }

      // ใช้ Model ดึงข้อมูลรายเดือน
      const monthlyData = await ReportModel.getMonthlyAppointments(
        dentist.dentist_id,
        year,
        month
      );

      res.json({ success: true, data: monthlyData });
    } catch (error) {
      console.error('Error in getMonthlyReport:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดรายงานรายเดือน' });
    }
  },

  // API: รายงานประวัติผู้ป่วย - ประวัติการรักษาทั้งหมด
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getPatientHistoryReport: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const patientId = req.params.id;

      const { DentistModel, ReportModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ success: false, error: 'Dentist not found' });
      }

      // ใช้ Model ดึงประวัติผู้ป่วย (กรองเฉพาะของหมอคนนี้ที่ Controller)
      const patientHistory = await ReportModel.getPatientTreatmentHistory(patientId);

      // กรองเฉพาะประวัติที่เป็นของทันตแพทย์คนนี้
      const filteredHistory = patientHistory.filter(
        record => record.dentist_id === dentist.dentist_id
      );

      res.json({ success: true, data: filteredHistory });
    } catch (error) {
      console.error('Error in getPatientHistoryReport:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดประวัติผู้ป่วย' });
    }
  },

  // API: ดึงข้อมูลนัดหมายรายวัน
  // API: ดึงนัดหมายตามวันที่
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getAppointmentsAPI: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const date = req.query.date || new Date().toISOString().split('T')[0];

      const { DentistModel, QueueModel } = require('../models');

      // ใช้ Model ค้นหาทันตแพทย์
      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      // ใช้ Model ดึงนัดหมายตามวันที่
      const appointments = await QueueModel.findByDate(dentist.dentist_id, date);

      res.json({ success: true, appointments, date });
    } catch (error) {
      console.error('Error in getAppointmentsAPI:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย' });
    }
  },

  // API: นัดหมายวันนี้
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getTodayAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const { DentistModel, QueueModel } = require('../models');

      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const appointments = await QueueModel.findTodayAppointments(dentist.dentist_id);

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getTodayAppointments:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมายวันนี้' });
    }
  },

  // API: นัดหมายที่กำลังจะมาถึง
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getUpcomingAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const { DentistModel, QueueModel } = require('../models');

      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const appointments = await QueueModel.findUpcomingAppointments(dentist.dentist_id, 10);

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getUpcomingAppointments:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมายที่กำลังจะมาถึง' });
    }
  },

  // API: สถิติ Dashboard
  // API: ดึงสถิติ Dashboard
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getDashboardStats: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ error: 'Dentist not found' });
    }

    // ใช้ Model ดึงสถิติทั้งหมด
    const stats = await QueueModel.getDashboardStats(dentist.dentist_id);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงสถิติ' });
  }
},

  // API: ค้นหาผู้ป่วย
  // ✅ REFACTORED: ใช้ Model แทน SQL
  searchPatients: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { q } = req.query;

      const { DentistModel, PatientModel } = require('../models');

      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const patients = await PatientModel.searchByDentist(dentist.dentist_id, q);

      res.json({ success: true, patients });
    } catch (error) {
      console.error('Error in searchPatients:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการค้นหาผู้ป่วย' });
    }
  },

  // API: ดึงข้อมูลปฏิทิน
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getCalendarData: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const year = req.params.year;
      const month = req.params.month;

      const { DentistModel, QueueModel } = require('../models');

      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const calendarData = await QueueModel.getMonthlyCalendarData(
        dentist.dentist_id,
        year,
        month
      );

      res.json({ success: true, calendarData });
    } catch (error) {
      console.error('Error in getCalendarData:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน' });
    }
  },
  
// ยืนยันนัดหมาย - มีการแจ้งเตือน
// ✅ DISABLED: แพทย์ไม่สามารถยืนยันการจองได้ (ไม่ใช่หน้าที่แพทย์)
confirmAppointment: async (req, res) => {
  try {
    // ปิดการใช้งาน - ไม่ใช่หน้าที่แพทย์
    return res.status(403).json({
      success: false,
      error: 'แพทย์ไม่สามารถยืนยันการจองได้ - กรุณาติดต่อผู้ดูแลระบบ'
    });

    // โค้ดเดิมที่ปิดการใช้งานแล้ว
    /*
    const userId = req.session.user?.user_id || req.session.userId;
    const { queueId } = req.body;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ยืนยันนัดหมาย (รวมตรวจสอบสิทธิ์และ validation)
    const result = await QueueModel.confirmAppointment(queueId, dentist.dentist_id);

    // สร้างการแจ้งเตือนการยืนยัน
    await NotificationHelper.createConfirmationNotification(
      queueId,
      result.queueData.patient_id,
      result.queueData.dentist_id
    );

    res.json({ success: true, message: 'ยืนยันนัดหมายเรียบร้อยแล้ว' });
    */

  } catch (error) {
    console.error('Error in confirmAppointment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาด'
    });
  }
},

  // ทำเครื่องหมายเสร็จสิ้น - มีการแจ้งเตือน
// ✅ REFACTORED: ใช้ Model แทน SQL
completeAppointment: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { queueId, diagnosis, nextAppointment } = req.body;

    const { DentistModel, QueueModel } = require('../models');
    const NotificationHelper = require('../utils/notificationHelper');

    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(403).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const result = await QueueModel.completeAppointment(queueId, dentist.dentist_id, {
      diagnosis,
      nextAppointment
    });

    // สร้างการแจ้งเตือนการบันทึกประวัติการรักษา
    await NotificationHelper.createTreatmentRecordNotification(
      queueId,
      result.appointment.patient_id,
      dentist.dentist_id
    );

    res.json({ success: true, message: 'ทำเครื่องหมายการรักษาเสร็จสิ้นแล้ว' });
  } catch (error) {
    console.error('Error in completeAppointment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการทำเครื่องหมายเสร็จสิ้น'
    });
  }
},
  // API: ดึงข้อมูลนัดหมายล่าสุดของผู้ป่วย
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getPatientLatestAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const patientId = req.params.patientId;

      const { DentistModel, QueueModel } = require('../models');

      const dentist = await DentistModel.findByUserId(userId);
      if (!dentist) {
        return res.status(404).json({ success: false, error: 'Dentist not found' });
      }

      const appointments = await QueueModel.findPatientLatestAppointments(
        patientId,
        dentist.dentist_id,
        5
      );

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getPatientLatestAppointments:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย' });
    }
  },
// API: ดึงรายละเอียดประวัติการรักษาตาม queue_id
// ✅ REFACTORED: ใช้ Model แทน SQL โดยตรง
getTreatmentHistoryDetail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;

    // ใช้ Model ค้นหาทันตแพทย์
    const { DentistModel, TreatmentHistoryModel } = require('../models');
    const dentist = await DentistModel.findByUserId(userId);

    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลทันตแพทย์'
      });
    }

    // ใช้ Model ดึงประวัติการรักษาพร้อมข้อมูลทั้งหมด
    const treatment = await TreatmentHistoryModel.findByQueueIdWithDetails(queueId);

    if (!treatment) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลประวัติการรักษา'
      });
    }

    // ตรวจสอบสิทธิ์: ต้องเป็นทันตแพทย์ที่ดูแลคนไข้คนนี้
    if (treatment.dentist_id !== dentist.dentist_id) {
      return res.status(403).json({
        success: false,
        error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
      });
    }

    res.json({
      success: true,
      treatment
    });

  } catch (error) {
    console.error('Error in getTreatmentHistoryDetail:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการรักษา'
    });
  }
},

// ✅ REFACTORED: ใช้ Model แทน SQL
getTreatmentHistoryPage: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;

    // ใช้ Model ค้นหาทันตแพทย์พร้อมข้อมูล user
    const { DentistModel } = require('../models');
    const dentist = await DentistModel.findByIdWithUser(
      (await DentistModel.findByUserId(userId))?.dentist_id
    );

    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/treatment-history-detail', {
      dentist,
      queueId,
      title: 'Treatment History Detail'
    });
  } catch (error) {
    console.error('Error in getTreatmentHistoryPage:', error);
    res.status(500).render('error', {
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าประวัติการรักษา',
      error
    });
  }
},
  // API: เพิ่มประวัติการรักษา
  // API: เพิ่มประวัติการรักษาให้กับนัดหมายที่มีอยู่
  // ✅ REFACTORED: ใช้ Model แทน SQL
  addTreatmentHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { queueId, patientId, diagnosis, nextAppointment } = req.body;

    // Validation
    if (!queueId || !diagnosis || !diagnosis.trim()) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
      });
    }

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ทำเครื่องหมายนัดหมายเสร็จสิ้นพร้อมบันทึกประวัติการรักษา
    const result = await QueueModel.completeAppointmentWithHistory(
      queueId,
      dentist.dentist_id,
      { diagnosis, nextAppointment }
    );

    res.json({
      success: true,
      message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
      queueId: result.queueId
    });

  } catch (error) {
    console.error('Error in addTreatmentHistory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา'
    });
  }
},

  // API: ดึงนัดหมายของผู้ป่วยสำหรับเพิ่มประวัติ
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getAppointmentForHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { patientId } = req.params;

    const { DentistModel, QueueModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ดึงนัดหมายล่าสุดของผู้ป่วย (เฉพาะรอรักษา)
    const allAppointments = await QueueModel.findPatientLatestAppointments(
      patientId,
      dentist.dentist_id,
      5
    );

    // กรองเฉพาะ pending/confirm
    const appointments = allAppointments.filter(apt =>
      apt.queue_status === 'pending' || apt.queue_status === 'confirm'
    );

    // จัดรูปแบบวันที่สำหรับ View (Controller responsibility)
    res.json({
      success: true,
      appointments: appointments.map(apt => ({
        ...apt,
        formattedDate: new Date(apt.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formattedTime: new Date(apt.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        statusText: apt.queue_status === 'confirm' ? 'เสร็จสิ้น' :
                   apt.queue_status === 'pending' ? 'รอการรักษา' : 'ยกเลิก'
      }))
    });

  } catch (error) {
    console.error('Error in getAppointmentForHistory:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง'
    });
  }
},
  // ฟังก์ชัน API อื่นๆ ที่เหลือ (สำหรับให้ครบตาม routes)
  // API: บันทึกตารางเวลา
// ✅ REFACTORED: ใช้ Model แทน SQL - บันทึกตารางวันเดียว
saveSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date, day, status, startTime, endTime, note } = req.body;

    const { DentistModel, DentistScheduleModel } = require('../models');

    // Validation
    if (!date || !status) {
      return res.status(400).json({
        success: false,
        error: 'ข้อมูลไม่ครบถ้วน'
      });
    }

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model บันทึกตารางวันเดียว
    const result = await DentistScheduleModel.saveDaySchedule(
      dentist.dentist_id,
      date,
      { status, startTime, endTime, note }
    );

    res.json({
      success: true,
      message: result.message || (status === 'dayoff' ? 'บันทึกวันหยุดเรียบร้อยแล้ว' : 'บันทึกตารางเวลาเรียบร้อยแล้ว')
    });

  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกตารางเวลา'
    });
  }
},

 // ✅ REFACTORED: ใช้ Model แทน SQL - โหลดตารางเวลา
loadSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate } = req.query;

    const { DentistModel, DentistScheduleModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ดึงตารางเวลา
    const schedules = await DentistScheduleModel.loadScheduleRange(
      dentist.dentist_id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      schedules
    });

  } catch (error) {
    console.error('Error loading schedule:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการโหลดตารางเวลา'
    });
  }
},

 // ✅ REFACTORED: ใช้ Model แทน SQL - ลบตารางเวลา
deleteSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date, hour } = req.body;

    const { DentistModel, DentistScheduleModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ลบตารางเวลา (รวมตรวจสอบนัดหมาย)
    const result = await DentistScheduleModel.deleteScheduleByDateAndHour(
      dentist.dentist_id,
      date,
      hour
    );

    res.json({
      success: true,
      message: result.message || 'ลบตารางเวลาเรียบร้อยแล้ว'
    });

  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการลบตารางเวลา'
    });
  }
},

 // ✅ REFACTORED: ใช้ Model แทน SQL - ดึงช่วงเวลาว่าง
getAvailableSlots: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date } = req.query;

    const { DentistModel, DentistScheduleModel } = require('../models');

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุวันที่'
      });
    }

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ดึงช่วงเวลาว่าง
    const availableSlots = await DentistScheduleModel.getAvailableSlots(
      dentist.dentist_id,
      date
    );

    res.json({
      success: true,
      availableSlots: availableSlots || []
    });

  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงช่วงเวลาว่าง'
    });
  }
},

// API: ดึงข้อมูล appointment พร้อมรายละเอียดผู้ป่วยสำหรับเพิ่มประวัติ
  // API: ดึงข้อมูล appointment พร้อมรายละเอียดผู้ป่วยสำหรับเพิ่มประวัติ
  // ✅ REFACTORED: ใช้ Model แทน SQL
  getAppointmentForAddHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;

    const { DentistModel, QueueModel, TreatmentModel } = require('../models');

    // ใช้ Model ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    // ใช้ Model ดึงข้อมูล appointment พร้อมตรวจสอบสิทธิ์
    const appointmentData = await QueueModel.findByIdWithDetails(queueId);

    if (!appointmentData || appointmentData.dentist_id !== dentist.dentist_id) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลการจองหรือไม่มีสิทธิ์เข้าถึง'
      });
    }

    // คำนวณอายุ (Controller responsibility)
    const age = appointmentData.patient_dob ?
      Math.floor((Date.now() - new Date(appointmentData.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000)) :
      null;

    // ใช้ Model ดึงรายการ treatments
    const treatments = await TreatmentModel.findAll({ orderBy: 'treatment_name' });

    // ใช้ Model ดึงรายการทันตแพทย์
    const dentists = await DentistModel.findAll({ orderBy: 'fname' });

    res.json({
      success: true,
      appointment: {
        ...appointmentData,
        age
      },
      treatments,
      dentists
    });

  } catch (error) {
    console.error('Error in getAppointmentForAddHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' 
    });
  }
},


  // หน้าตารางงานรายเดือน
  // ✅ REFACTORED: ใช้ Model แทน SQL
  showScheduleMonthly: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const { DentistModel } = require('../models');

    // ใช้ Model ดึงข้อมูลทันตแพทย์พร้อมข้อมูล user
    const dentist = await DentistModel.findByUserIdWithFullInfo(userId);

    if (!dentist) {
      return res.redirect('/login');
    }

    res.render('dentist/schedule-monthly', {
      title: 'ตารางงาน',
      dentist
    });

  } catch (error) {
    console.error('Error in showScheduleMonthly:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
},

// บันทึกประวัติการรักษา - มีการแจ้งเตือน
// ✅ REFACTORED: ใช้ Model แทน SQL และ transaction
saveAddHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const {
      queueId,
      diagnosis,
      followUpRecommendation,
      chemicalAllergy
    } = req.body;

    // Basic validation
    if (!queueId || !diagnosis || !diagnosis.trim()) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
      });
    }

    // ใช้ Models
    const { DentistModel, QueueModel, TreatmentHistoryModel } = require('../models');

    // ค้นหาทันตแพทย์
    const dentist = await DentistModel.findByUserId(userId);
    if (!dentist) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลทันตแพทย์'
      });
    }

    // ดึงข้อมูลคิว
    const queue = await QueueModel.findById(queueId);
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลคิว'
      });
    }

    // ตรวจสอบสิทธิ์
    if (queue.dentist_id !== dentist.dentist_id) {
      return res.status(403).json({
        success: false,
        error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลการจองนี้'
      });
    }

    // Model จัดการ validation และเลือก create/update อัตโนมัติ
    const historyResult = await TreatmentHistoryModel.createOrUpdate({
      queuedetailId: queue.queuedetail_id,
      diagnosis,
      followUpdate: followUpRecommendation || '',
      chemicalAllergy: chemicalAllergy || ''
    });

    // อัปเดตสถานะคิว
    await QueueModel.updateStatus(queueId, 'completed');

    // สร้างการแจ้งเตือนการบันทึกประวัติการรักษา
    await NotificationHelper.createTreatmentRecordNotification(
      queueId,
      queue.patient_id,
      dentist.dentist_id
    );

    res.json({
      success: true,
      message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
      queueId,
      action: historyResult.action // 'created' หรือ 'updated'
    });

  } catch (error) {
    console.error('Error in saveAddHistory:', error);
    // Model throw error message ที่ชัดเจน
    res.status(400).json({
      success: false,
      error: error.message || 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา'
    });
  }
},
  getAvailableDentists: async (req, res) => {
    res.json({ success: true, dentists: [] });
  },

  getNotifications: async (req, res) => {
    res.json({ success: true, notifications: [] });
  },

  exportAppointments: async (req, res) => {
    res.json({ success: true, data: [] });
  },

  exportPatients: async (req, res) => {
    res.json({ success: true, data: [] });
  }
};



module.exports = dentistController;
