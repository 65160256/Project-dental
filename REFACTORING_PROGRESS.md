# Admin Controller Refactoring Progress

## วัตถุประสงค์
แยก SQL queries ทั้งหมดออกจาก `admin.controller.js` และ `dentist.controller.js` ไปใส่ใน Models ตามหลัก MVC

## สถานะปัจจุบัน

### Controllers ที่ต้อง Refactor
- ✅ `notification.controller.js` - เสร็จแล้ว (ไม่มี SQL)
- ✅ `admin.slots.controller.js` - เสร็จแล้ว (ไม่มี SQL)
- ⚠️ `admin.controller.js` - **206 SQL queries** (5,371 lines)
- ⚠️ `dentist.controller.js` - **84 SQL queries** (3,034 lines)

### Models ที่พร้อมใช้งาน (Updated)
- ✅ User.model.js - เพิ่ม `updatePassword()`, `findByIdWithRole()`, `isEmailTaken()`
- ✅ Patient.model.js
- ✅ Dentist.model.js
- ✅ Treatment.model.js
- ✅ Queue.model.js - ครบถ้วนมาก (30+ methods)
- ✅ QueueDetail.model.js - เพิ่ม `getAppointmentsByDate()`
- ✅ TreatmentHistory.model.js
- ✅ AvailableSlots.model.js
- ✅ DentistSchedule.model.js - เพิ่ม `getScheduleWithAppointments()`
- ✅ DentistTreatment.model.js
- ✅ Notification.model.js

---

## แผนการ Refactor: admin.controller.js

### Module 1: Authentication & Profile ✅
**Functions:** 2 functions, 3 SQL queries
- `getProfile()` - แสดงโปรไฟล์ admin
- `changePassword()` - เปลี่ยนรหัสผ่าน

**Refactoring:**
```javascript
// เดิม: db.execute('SELECT ... FROM user JOIN role ...')
// ใหม่: UserModel.findByIdWithRole(userId)

// เดิม: db.execute('SELECT password FROM user ...')
// ใหม่: UserModel.findById(userId)

// เดิม: db.execute('UPDATE user SET password ...')
// ใหม่: UserModel.updatePassword(userId, hashedPassword)
```

### Module 2: Dashboard & Schedule
**Functions:** 3 functions, ~50 SQL queries
- `getDashboard()` - แสดง calendar พร้อม schedule และ appointments
- `getScheduleAPI()` - API สำหรับ FullCalendar
- `viewAppointments()` - แสดงรายการนัดตามวัน
- `ajaxAppointments()` - AJAX เปลี่ยนวันที่
- `renderWeekCalendar()` - render calendar bar

**Refactoring:**
```javascript
// เดิม: db.execute('SELECT ... FROM dentist_schedule JOIN dentist LEFT JOIN queue ...')
// ใหม่: DentistScheduleModel.getScheduleWithAppointments({ startDate, endDate })

// เดิม: db.execute('SELECT ... FROM queuedetail JOIN patient JOIN treatment ...')
// ใหม่: QueueDetailModel.getAppointmentsByDate(date)
```

### Module 3: Dentist Management
**Functions:** ~10 functions, ~40 SQL queries
- `viewDentists()` - หน้ารายการทันตแพทย์
- `addDentist()` - เพิ่มทันตแพทย์ (with transaction)
- `editDentist()` - แก้ไขข้อมูล
- `deleteDentist()` - ลบทันตแพทย์
- `getDentistsAPI()` - API ดึงรายการ
- `getDentistByIdAPI()` - API ดึงข้อมูลเดียว
- `deleteDentistAPI()` - API ลบ
- `checkLicenseAvailability()` - เช็ค license ซ้ำ

**Required Model Methods (ต้องเพิ่ม):**
```javascript
// DentistModel
- findAllWithDetails({ limit, offset, search })
- checkLicenseDuplicate(license, excludeId)
- deleteWithUser(dentist_id) // ลบ dentist + user พร้อมกัน

// UserModel
- createForDentist({ email, password }) // สร้าง user role=dentist

// DentistTreatmentModel
- assignTreatments(dentist_id, treatment_ids[])
- removeTreatments(dentist_id)

// DentistScheduleModel
- deleteByDentist(dentist_id)
```

### Module 4: Patient Management
**Functions:** ~12 functions, ~35 SQL queries
- `getPatients()` - หน้ารายการผู้ป่วย
- `getPatientsAPI()` - API ดึงรายการ
- `getPatientByIdAPI()` - API ดึงข้อมูลเดียว
- `addPatient()` - เพิ่มผู้ป่วย (with transaction)
- `editPatient()` - แก้ไขข้อมูล
- `deletePatient()` - ลบผู้ป่วย
- `updatePatientAPI()` - API อัพเดท
- `checkPatientEmailAvailability()` - เช็คอีเมลซ้ำ
- `viewPatient()` - ดูรายละเอียดผู้ป่วย
- `viewPatientTreatmentHistory()` - ประวัติการรักษา

**Required Model Methods (ต้องเพิ่ม):**
```javascript
// PatientModel
- findAllWithPagination({ limit, offset, search })
- deleteWithUser(patient_id) // ลบ patient + user + queues

// TreatmentHistoryModel
- findByPatientId(patient_id, options)
```

### Module 5: Treatment Management
**Functions:** 8 functions, ~25 SQL queries
- `listTreatments()` - รายการการรักษา
- `viewTreatment()` - ดูรายละเอียด
- `addTreatment()` - เพิ่มการรักษา
- `updateTreatment()` - แก้ไข
- `deleteTreatment()` - ลบ
- `getTreatmentsAPI()` - API ดึงรายการ
- `getTreatmentByIdAPI()` - API ดึงเดียว
- `getTreatmentDentistsAPI()` - ดึงหมอที่ทำได้

**Required Model Methods (ต้องเพิ่ม):**
```javascript
// TreatmentModel
- findAllWithDentists()
- findByIdWithDentists(treatment_id)
- deleteWithDependencies(treatment_id) // ลบพร้อม dentist_treatments
```

### Module 6: Appointment Management (สำคัญที่สุด!)
**Functions:** ~15 functions, ~80 SQL queries
- `getAppointmentsAPI()` - ดึงรายการนัดหมาย
- `getAppointmentById()` - ดึงนัดเดียว
- `createAppointment()` - สร้างนัดหมาย
- `updateAppointment()` - อัพเดทนัดหมาย
- `updateAppointmentStatus()` - เปลี่ยนสถานะ
- `deleteAppointment()` - ลบนัดหมาย
- `bookAppointmentForPatient()` - **Critical Function** - จองนัดให้ผู้ป่วย (with transaction)
- `createAppointmentAPI()` - API สร้างนัด
- `getDentistScheduleAPI()` - ดึงตารางหมอ
- `getAvailableDentistsForAdmin()` - ดึงหมอที่ว่าง
- `getAvailableSlotsForAdmin()` - ดึง slots ว่าง
- `validateAppointmentTime()` - ตรวจสอบเวลา

**การ Refactor ที่สำคัญ:**

#### bookAppointmentForPatient() - ฟังก์ชันที่ซับซ้อนที่สุด
```javascript
// เดิม: มี transaction ซับซ้อน + SQL หลายตัว
connection = await db.getConnection();
await connection.beginTransaction();
// ... SQL queries มากมาย ...
await connection.commit();

// ใหม่: แยกเป็น model methods
const treatment = await TreatmentModel.findById(treatment_id);
const availableSlots = await AvailableSlotsModel.getAvailableSlotsForBooking({
  dentist_id, date, start_time, requiredSlots
});
const queueDetail = await QueueDetailModel.create({ ... });
const queue = await QueueModel.create({ ... });
await AvailableSlotsModel.markSlotsAsBooked(slots, treatment_id);
await NotificationModel.createAppointmentNotification({ ... });
```

**Required Model Methods:**
```javascript
// AvailableSlotsModel
- getAvailableSlotsForBooking({ dentist_id, date, start_time, count })
- markSlotsAsBooked(slot_ids[], treatment_id)
- releaseSlots(slot_ids[])

// QueueModel
- createWithTransaction(queueData, connection)
- getAppointmentDetails(queue_id)

// NotificationModel
- createAppointmentNotification({ dentist_id, patient_id, details })
- createStatusChangeNotification({ queue_id, new_status })
```

### Module 7: Reports & Statistics
**Functions:** ~8 functions, ~40 SQL queries
- `getAppointmentStats()` - สถิติ appointments
- `getAppointmentStatistics()` - สถิติแยกตามสถานะ
- `bulkUpdateAppointmentStatus()` - อัพเดทหลายรายการ
- `getPendingAppointmentsCount()` - นับ pending
- `getReportsDashboard()` - dashboard รายงาน
- `getAppointmentStatsAPI()` - API สถิติ
- `getTreatmentStatsAPI()` - สถิติการรักษา
- `getDentistScheduleData()` - ข้อมูลตารางหมอ

**Required Model Methods:**
```javascript
// QueueModel (เพิ่ม)
- getStatsByStatus({ startDate, endDate })
- getPendingCount()
- getTodayCount()
- getMonthlyRevenue()

// TreatmentModel (เพิ่ม)
- getTreatmentStatistics({ startDate, endDate })
- getPopularTreatments(limit)

// DentistModel (เพิ่ม)
- getDentistStatistics()
```

---

## แผนการ Refactor: dentist.controller.js (84 queries)

### Modules ใน dentist.controller.js
1. **Profile & Auth** - 5 queries
2. **Dashboard** - 15 queries
3. **Appointments** - 30 queries
4. **Patients** - 15 queries
5. **Treatment History** - 19 queries

จะทำหลังจาก admin.controller.js เสร็จ

---

## Timeline การทำงาน

### Phase 1: เพิ่ม Methods ใน Models (1-2 ชม.)
- ✅ UserModel - เสร็จแล้ว
- ✅ DentistScheduleModel - เสร็จแล้ว
- ✅ QueueDetailModel - เสร็จแล้ว
- ⏳ DentistModel - ต้องเพิ่ม ~5 methods
- ⏳ PatientModel - ต้องเพิ่ม ~5 methods
- ⏳ TreatmentModel - ต้องเพิ่ม ~5 methods
- ⏳ AvailableSlotsModel - ต้องเพิ่ม ~3 methods

### Phase 2: Refactor Controllers (3-4 ชม.)
- ✅ Module 1: Authentication & Profile (30 นาที)
- ⏳ Module 2: Dashboard & Schedule (45 นาที)
- ⏳ Module 3: Dentist Management (1 ชม.)
- ⏳ Module 4: Patient Management (1 ชม.)
- ⏳ Module 5: Treatment Management (30 นาที)
- ⏳ Module 6: Appointment Management (2 ชม.) **สำคัญที่สุด**
- ⏳ Module 7: Reports & Statistics (1 ชม.)

### Phase 3: Test & Verify (1 ชม.)
- Verify ไม่มี SQL ใน controllers
- Test critical functions
- Fix bugs ถ้ามี

---

## Progress Tracking

**Completed:**
- ✅ เพิ่ม methods ใน UserModel
- ✅ เพิ่ม methods ใน DentistScheduleModel
- ✅ เพิ่ม methods ใน QueueDetailModel
- ✅ สร้างเอกสาร CRITICAL_BUSINESS_FLOWS.md
- ✅ สร้างเอกสาร SEQUENCE_DIAGRAM_FLOWS.md

**In Progress:**
- 🔄 Module 1: Authentication & Profile refactoring

**Next Steps:**
1. เพิ่ม methods ที่ขาดใน DentistModel, PatientModel, TreatmentModel
2. Refactor แต่ละ module ตามลำดับ
3. Test และ verify

---

## วิธีการทดสอบ

หลัง refactor แต่ละ module:
```bash
# 1. ตรวจสอบว่าไม่มี SQL ใน controller
grep -n "db\.execute\|db\.query\|connection\.execute\|connection\.query" controller/admin.controller.js

# 2. Test แต่ละ endpoint ด้วย Postman/Thunder Client

# 3. ตรวจสอบ console ว่ามี error หรือไม่
```

---

## หมายเหตุ

- **Transaction Handling**: ฟังก์ชันที่ใช้ transaction ต้องระวังให้ดี (bookAppointmentForPatient, addDentist, deletePatient)
- **Error Handling**: ต้องเก็บ try-catch และ error messages เหมือนเดิม
- **API Response Format**: ต้องเก็บ format เดิม (success, error, data)
- **Validation**: ต้องเก็บ validation logic เดิมทั้งหมด

---

Generated: 2025-10-14
Last Updated: 2025-10-14
Status: In Progress - Module 1
