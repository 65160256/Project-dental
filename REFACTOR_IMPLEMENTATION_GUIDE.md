# Refactor Implementation Guide
**สถานะ: Models สร้างเสร็จแล้ว - พร้อม refactor controllers**

## สรุปการทำงาน

### Phase 1: สร้าง Models ใหม่ (เสร็จสิ้น)

ได้สร้าง Models ใหม่ทั้งหมดแล้ว:

1. **QueueDetail.model.js** - จัดการ queuedetail table
   - `create()`, `findById()`, `findByQueueId()`, `findByPatientId()`
   - `findByDentistId()`, `findByDate()`, `update()`, `delete()`
   - `findByIdWithHistory()`, `count()`

2. **Notification.model.js** - จัดการการแจ้งเตือน
   - `create()`, `findById()`, `findByUserId()`
   - `markAsRead()`, `markAllAsRead()`, `deleteOld()`
   - `count()`, `findUnreadByUserId()`, `findLatestByUserId()`
   - `findByType()`, `findByRelatedId()`, `createBulk()`

3. **DentistSchedule.model.js** - จัดการตารางเวลาทันตแพทย์ (มีอยู่แล้ว - อัปเดต)
   - `create()`, `findById()`, `findByDentistAndDate()`
   - `findByDateRange()`, `deleteByDateRange()`, `update()`, `delete()`
   - `findAllWithAppointments()`, `hasScheduleOnDate()`
   - `isTimeSlotAvailable()`, `getAvailableSlots()`, `createBulk()`

4. **AvailableSlots.model.js** - จัดการช่วงเวลาว่าง
   - `create()`, `findById()`, `findByDate()`, `findByDentistAndDate()`
   - `markAsBooked()`, `markAsAvailable()`, `updateStatus()`
   - `deleteOld()`, `getStatistics()`, `isAvailable()`, `createBulk()`

5. **DentistTreatment.model.js** - จัดการความสัมพันธ์ทันตแพทย์-การรักษา
   - `create()`, `exists()`, `findByDentistId()`, `findByTreatmentId()`
   - `delete()`, `deleteAllByDentist()`, `updateDentistTreatments()`
   - `findAvailableDentistsByTreatment()`, `getTreatmentStatsByDentist()`
   - `findRecommendedDentists()`

### Phase 2: อัปเดต models/index.js (เสร็จสิ้น)

เพิ่ม exports สำหรับ Models ใหม่ทั้งหมด

---

## Phase 3: Refactor Controllers

### หลักการ Refactor

```javascript
// ❌ BEFORE (SQL ใน controller)
exports.getPatients = async (req, res) => {
  const [patients] = await db.execute('SELECT * FROM patient WHERE...');
  res.json({ patients });
};

// ✅ AFTER (ใช้ Model)
const { PatientModel } = require('../models');
exports.getPatients = async (req, res) => {
  try {
    const patients = await PatientModel.findAll({
      search: req.query.search,
      limit: req.query.limit
    });
    res.json({ patients });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
```

---

## การ Refactor แต่ละไฟล์

### 1. admin.controller.js (5410 lines - 203 SQL queries)

#### Functions ที่ต้อง refactor:

##### Profile & Auth
```javascript
// getProfile - ใช้ UserModel.findById()
exports.getProfile = async (req, res) => {
  const { UserModel } = require('../models');
  try {
    const user = await UserModel.findByIdWithRole(req.session.userId);
    if (!user) return res.redirect('/login');
    res.render('admin/profile/admin-profile', { user });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

// changePassword - ใช้ UserModel.updatePassword()
exports.changePassword = async (req, res) => {
  const { UserModel } = require('../models');
  try {
    await UserModel.updatePassword(
      req.session.userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    req.session.destroy(() => {
      res.json({ success: true, message: 'Password changed successfully' });
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
```

##### Dashboard
```javascript
// getDashboard - ใช้ DentistScheduleModel.findAllWithAppointments()
exports.getDashboard = async (req, res) => {
  const { DentistScheduleModel } = require('../models');
  try {
    const scheduleData = await DentistScheduleModel.findAllWithAppointments({
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    });

    // จัดรูปแบบข้อมูลสำหรับ FullCalendar (View logic)
    const events = formatScheduleDataForCalendar(scheduleData);
    res.render('admin-dashboard', { events: JSON.stringify(events) });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.render('admin-dashboard', { events: JSON.stringify([]) });
  }
};

// getScheduleAPI - ใช้ DentistScheduleModel.findAllWithAppointments()
exports.getScheduleAPI = async (req, res) => {
  const { DentistScheduleModel } = require('../models');
  try {
    const { start, end } = req.query;
    const scheduleData = await DentistScheduleModel.findAllWithAppointments({
      startDate: start,
      endDate: end
    });

    const events = formatScheduleDataForCalendar(scheduleData);
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'ไม่สามารถโหลดข้อมูลตารางเวลาได้'
    });
  }
};
```

##### Appointments
```javascript
// viewAppointments - ใช้ QueueDetailModel.findByDate()
exports.viewAppointments = async (req, res) => {
  const { QueueDetailModel } = require('../models');
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    const appointments = await QueueDetailModel.findByDate(selectedDate);

    res.render('admin/appointment/admin-appointments', {
      appointments,
      weekOffset: parseInt(req.query.weekOffset) || 0,
      selectedDate
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
```

##### Dentists Management
```javascript
// getDentistsAPI - ใช้ DentistModel.findAllWithStats()
exports.getDentistsAPI = async (req, res) => {
  const { DentistModel } = require('../models');
  try {
    const dentists = await DentistModel.findAllWithStats();
    res.json({ success: true, dentists });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// getDentistDetailAPI - ใช้ DentistModel.findByIdWithFullInfo()
exports.getDentistDetailAPI = async (req, res) => {
  const { DentistModel } = require('../models');
  try {
    const dentist = await DentistModel.findByIdWithFullInfo(req.params.id);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }
    res.json({ success: true, dentist });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// createDentist - ใช้ DentistModel.create() และ UserModel.create()
exports.createDentist = async (req, res) => {
  const { DentistModel, UserModel } = require('../models');
  try {
    // สร้าง User account ก่อน
    const user = await UserModel.create({
      email: req.body.email,
      username: req.body.username,
      password: req.body.password,
      roleId: 2 // dentist role
    });

    // สร้างข้อมูล Dentist
    const dentist = await DentistModel.create({
      fname: req.body.fname,
      lname: req.body.lname,
      specialty: req.body.specialty,
      licenseNumber: req.body.license_number,
      userId: user.userId
    });

    res.json({ success: true, dentist });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
```

##### Patients Management
```javascript
// getPatientsAPI - ใช้ PatientModel.findAll()
exports.getPatientsAPI = async (req, res) => {
  const { PatientModel } = require('../models');
  try {
    const patients = await PatientModel.findAll({
      search: req.query.search,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    });

    const total = await PatientModel.count(req.query.search);

    res.json({ success: true, patients, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// createPatient - ใช้ PatientModel.create()
exports.createPatient = async (req, res) => {
  const { PatientModel } = require('../models');
  try {
    const patient = await PatientModel.create({
      fname: req.body.fname,
      lname: req.body.lname,
      dob: req.body.dob,
      gender: req.body.gender,
      phone: req.body.phone,
      address: req.body.address,
      id_card: req.body.id_card,
      chronic_disease: req.body.chronic_disease,
      allergy_history: req.body.allergy_history
    });

    res.json({ success: true, patient });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
```

##### Treatments Management
```javascript
// getTreatmentsAPI - ใช้ TreatmentModel.findAll()
exports.getTreatmentsAPI = async (req, res) => {
  const { TreatmentModel } = require('../models');
  try {
    const treatments = await TreatmentModel.findAll({
      search: req.query.search
    });
    res.json({ success: true, treatments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

### 2. dentist.controller.js (บางส่วน refactor แล้ว - ดู line 52-500)

Functions ที่ยังต้อง refactor:

```javascript
// saveScheduleRange - ใช้ DentistScheduleModel.deleteByDateRange() และ createBulk()
saveScheduleRange: async (req, res) => {
  const { DentistModel, DentistScheduleModel, NotificationModel } = require('../models');
  try {
    const dentist = await DentistModel.findByUserId(req.session.userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const { startDate, endDate, status, startTime, endTime, note } = req.body;

    // ลบตารางเวลาเก่า
    await DentistScheduleModel.deleteByDateRange(dentist.dentist_id, startDate, endDate);

    // สร้างตารางเวลาใหม่
    const schedules = generateScheduleArray(
      dentist.dentist_id,
      startDate,
      endDate,
      status,
      startTime,
      endTime,
      note
    );

    const result = await DentistScheduleModel.createBulk(schedules);

    // สร้างการแจ้งเตือน
    await NotificationModel.create({
      userId: dentist.user_id,
      title: 'อัปเดตตารางเวลา',
      message: `บันทึกตารางเวลาสำเร็จ ${result.insertedCount} วัน`,
      type: 'success'
    });

    res.json({ success: true, message: 'บันทึกตารางเวลาสำเร็จ', ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
},

// deleteScheduleRange - ใช้ DentistScheduleModel.deleteByDateRange()
deleteScheduleRange: async (req, res) => {
  const { DentistModel, DentistScheduleModel } = require('../models');
  try {
    const dentist = await DentistModel.findByUserId(req.session.userId);
    if (!dentist) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const { startDate, endDate } = req.body;
    const result = await DentistScheduleModel.deleteByDateRange(
      dentist.dentist_id,
      startDate,
      endDate
    );

    res.json({ success: true, message: 'ลบตารางเวลาเรียบร้อยแล้ว' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}
```

---

### 3. patient.controller.js

ต้องอ่านไฟล์เพื่อดู SQL queries ที่ใช้ แล้ว refactor ให้ใช้ Models

---

### 4. notification.controller.js

```javascript
// getNotifications - ใช้ NotificationModel.findByUserId()
exports.getNotifications = async (req, res) => {
  const { NotificationModel } = require('../models');
  try {
    const notifications = await NotificationModel.findByUserId(
      req.session.userId,
      {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      }
    );

    const unreadCount = await NotificationModel.count(req.session.userId, true);

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// markAsRead - ใช้ NotificationModel.markAsRead()
exports.markAsRead = async (req, res) => {
  const { NotificationModel } = require('../models');
  try {
    await NotificationModel.markAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// markAllAsRead - ใช้ NotificationModel.markAllAsRead()
exports.markAllAsRead = async (req, res) => {
  const { NotificationModel } = require('../models');
  try {
    await NotificationModel.markAllAsRead(req.session.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
```

---

### 5. admin.slots.controller.js

```javascript
// getAvailableSlots - ใช้ AvailableSlotsModel.findByDate()
exports.getAvailableSlots = async (req, res) => {
  const { AvailableSlotsModel } = require('../models');
  try {
    const { date, dentistId, status } = req.query;

    let slots;
    if (dentistId) {
      slots = await AvailableSlotsModel.findByDentistAndDate(dentistId, date, status);
    } else {
      slots = await AvailableSlotsModel.findByDate(date, status);
    }

    res.json({ success: true, slots });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// createSlots - ใช้ AvailableSlotsModel.createBulk()
exports.createSlots = async (req, res) => {
  const { AvailableSlotsModel } = require('../models');
  try {
    const slots = req.body.slots; // Array of slot data
    const result = await AvailableSlotsModel.createBulk(slots);

    res.json({ success: true, insertedCount: result.insertedCount });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
```

---

## Helper Functions ที่อาจต้องสร้าง

```javascript
// helpers/scheduleHelper.js
function generateScheduleArray(dentistId, startDate, endDate, status, startTime, endTime, note) {
  const schedules = [];
  const currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();

    // ข้ามวันอาทิตย์
    if (dayOfWeek !== 0) {
      const scheduleDate = currentDate.toISOString().split('T')[0];

      if (status === 'dayoff') {
        schedules.push({
          dentistId,
          scheduleDate,
          dayOfWeek,
          hour: 0,
          status: 'dayoff',
          startTime: '00:00:00',
          endTime: '23:59:59',
          note: note || 'วันหยุดพิเศษ'
        });
      } else {
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = parseInt(endTime.split(':')[0]);

        for (let hour = startHour; hour < endHour; hour++) {
          schedules.push({
            dentistId,
            scheduleDate,
            dayOfWeek,
            hour,
            status: 'working',
            startTime: `${hour.toString().padStart(2, '0')}:00:00`,
            endTime: `${(hour + 1).toString().padStart(2, '0')}:00:00`,
            note: note || ''
          });
        }
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return schedules;
}

// helpers/calendarHelper.js
function formatScheduleDataForCalendar(scheduleData) {
  const events = [];
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

  // สร้าง events สำหรับ FullCalendar
  Object.keys(groupedSchedules).forEach(date => {
    Object.keys(groupedSchedules[date]).forEach(dentistKey => {
      const dentistData = groupedSchedules[date][dentistKey];

      // จัดกลุ่มช่วงเวลาทำงานที่ต่อเนื่องกัน
      const workingBlocks = groupSchedulesIntoBlocks(dentistData.schedules);

      workingBlocks.forEach(block => {
        events.push(createCalendarEvent(date, dentistData, block));
      });
    });
  });

  return events;
}

function groupSchedulesIntoBlocks(schedules) {
  schedules.sort((a, b) => a.hour - b.hour);

  const blocks = [];
  let currentBlock = null;

  schedules.forEach(schedule => {
    if (schedule.status === 'dayoff') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
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
          appointmentCount: schedule.appointment_count || 0
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
    blocks.push(currentBlock);
  }

  return blocks;
}

function createCalendarEvent(date, dentistData, block) {
  if (block.type === 'dayoff') {
    return {
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
    };
  } else {
    const startTime = block.start.substring(0, 5);
    const endTime = block.end.substring(0, 5);
    const appointmentText = block.hasAppointments
      ? ` (${block.appointmentCount} นัดหมาย)`
      : '';

    return {
      title: `ทพ. ${dentistData.dentist}\n${startTime}-${endTime}${appointmentText}`,
      start: date,
      color: block.hasAppointments ? '#fce4ec' : '#e8f5e8',
      textColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
      borderColor: block.hasAppointments ? '#c2185b' : '#2e7d32',
      extendedProps: {
        type: 'working',
        dentist: dentistData.dentist,
        specialty: dentistData.specialty,
        startTime,
        endTime,
        hasAppointments: block.hasAppointments,
        appointmentCount: block.appointmentCount
      }
    };
  }
}

module.exports = {
  generateScheduleArray,
  formatScheduleDataForCalendar
};
```

---

## สรุปผลประโยชน์

### 1. Separation of Concerns
- Controllers จัดการเฉพาะ HTTP logic (requests, responses, status codes, sessions)
- Models จัดการ business logic และ database operations
- มีความชัดเจนว่า responsibility ของแต่ละชั้นคืออะไร

### 2. Reusability
- สามารถใช้ Models ในหลาย controllers ได้
- ลด code duplication อย่างมาก
- เพิ่ม methods ใหม่ใน Model แทนที่จะคัดลอก SQL

### 3. Testability
- สามารถ test Models แยกจาก Controllers ได้
- Mock Models สำหรับ unit test Controllers ได้ง่าย
- Validate business logic ใน Models โดยตรง

### 4. Maintainability
- แก้ไข SQL query ที่เดียวใน Model แล้วมีผลทั้งระบบ
- เพิ่ม features ใหม่โดยไม่ต้องแตะ controllers มาก
- Debug ง่ายขึ้นเพราะแยก concerns ชัดเจน

### 5. Error Handling
- Models throw Error พร้อม message ที่ชัดเจน
- Controllers แปลง Error เป็น HTTP response ที่เหมาะสม
- Consistent error handling ทั้งระบบ

---

## ขั้นตอนการทำงานต่อ

### สำหรับนักพัฒนา:

1. **อ่าน guide นี้ให้เข้าใจ** - เข้าใจรูปแบบการ refactor

2. **เริ่มจาก controller เล็กๆ** - เช่น notification.controller.js ที่มี SQL น้อย

3. **Refactor ทีละ function** - ไม่ต้องเขียนทั้งไฟล์ใหม่ในครั้งเดียว
   - เลือก function หนึ่ง
   - แทนที่ SQL queries ด้วย Model methods
   - ทดสอบว่าทำงานถูกต้อง
   - ทำ function ถัดไป

4. **ใช้ตัวอย่างจาก guide นี้** - คัดลอกและปรับแต่งตามความเหมาะสม

5. **ทดสอบระหว่างทาง** - อย่ารอจนเสร็จทั้งไฟล์ค่อยทดสอบ

6. **สร้าง helper functions** - ถ้าพบว่ามี logic ซับซ้อนที่ซ้ำกัน

7. **Document การเปลี่ยนแปลง** - เขียน JSDoc comments สำหรับ functions ที่แก้ไข

### ลำดับความสำคัญในการ refactor:

1. **notification.controller.js** - น้อยที่สุด ทำได้ง่าย
2. **admin.slots.controller.js** - ขนาดกลาง มี SQL ไม่มาก
3. **patient.controller.js** - ขนาดกลาง
4. **dentist.controller.js** - ใหญ่ แต่ refactor บางส่วนแล้ว
5. **admin.controller.js** - ใหญ่ที่สุด แบ่งทำเป็นส่วนๆ

---

## Checklist การทำงาน

### Models (เสร็จสิ้น)
- [x] QueueDetail.model.js
- [x] Notification.model.js
- [x] DentistSchedule.model.js
- [x] AvailableSlots.model.js
- [x] DentistTreatment.model.js
- [x] อัปเดต models/index.js

### Controllers (รอดำเนินการ)
- [ ] notification.controller.js
- [ ] admin.slots.controller.js
- [ ] patient.controller.js
- [ ] dentist.controller.js (เหลือบางส่วน)
- [ ] admin.controller.js

### Helpers (ถ้าจำเป็น)
- [ ] scheduleHelper.js - จัดการตารางเวลา
- [ ] calendarHelper.js - จัดรูปแบบข้อมูล calendar
- [ ] validationHelper.js - validate ข้อมูล input

---

## ตัวอย่าง Error Handling Pattern

```javascript
// ใน Controller
exports.someFunction = async (req, res) => {
  const { SomeModel } = require('../models');

  try {
    // Business logic - Model จะ throw Error ถ้ามีปัญหา
    const result = await SomeModel.someMethod(req.body);

    // Success response
    res.json({ success: true, data: result });

  } catch (error) {
    console.error('Error in someFunction:', error);

    // แปลง error เป็น HTTP response ที่เหมาะสม
    const statusCode = error.message.includes('ไม่พบ') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
};
```

---

## สรุป

การ refactor นี้จะทำให้โค้ดมีคุณภาพสูงขึ้นอย่างมาก โดย:

1. **แยก SQL ออกจาก Controllers สมบูรณ์**
2. **สร้าง Models ที่ reusable และ maintainable**
3. **Controllers มีหน้าที่ชัดเจน - จัดการ HTTP เท่านั้น**
4. **ระบบทำงานเหมือนเดิม - ไม่มีการเปลี่ยน behavior**
5. **พร้อมสำหรับการพัฒนาต่อในอนาคต**

ทุกอย่างถูกออกแบบมาให้ทำงานทีละขั้นตอน โดยไม่ทำให้ระบบเดิมเสีย!
