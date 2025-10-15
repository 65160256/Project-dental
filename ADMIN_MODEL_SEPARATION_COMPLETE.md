# การแยก Model ออกจาก Admin Controller - เสร็จสิ้น

## สรุปการทำงาน

ได้ทำการแยก model ออกจาก `admin.controller.js` เรียบร้อยแล้ว โดยสร้าง models ใหม่สำหรับจัดการข้อมูลต่างๆ และย้าย SQL queries ออกจาก controller ตามหลักการที่ดี

## Models ที่สร้างใหม่

### 1. AdminModel (`models/Admin.model.js`)
- **หน้าที่**: จัดการข้อมูล admin (profile, password, dashboard)
- **ฟังก์ชันหลัก**:
  - `getProfile(userId)` - ดึงข้อมูล profile ของ admin
  - `getCurrentPassword(userId)` - ตรวจสอบรหัสผ่านปัจจุบัน
  - `updatePassword(userId, newPassword)` - อัปเดตรหัสผ่านใหม่
  - `getDashboardData(start, end)` - ดึงข้อมูล dashboard
  - `getScheduleData(start, end)` - ดึงข้อมูล schedule สำหรับ API
  - `getAppointmentsByDate(date)` - ดึงข้อมูลนัดหมายตามวันที่
  - `getAllAppointments(date)` - ดึงข้อมูลนัดหมายทั้งหมด

### 2. DentistAdminModel (`models/DentistAdmin.model.js`)
- **หน้าที่**: จัดการข้อมูลทันตแพทย์สำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAllDentists()` - ดึงรายการทันตแพทย์ทั้งหมด
  - `getDentistById(dentistId)` - ดึงข้อมูลทันตแพทย์ตาม ID
  - `checkEmailExists(email, excludeUserId)` - ตรวจสอบอีเมลซ้ำ
  - `checkIdCardExists(idCard, excludeDentistId)` - ตรวจสอบเลขบัตรประชาชนซ้ำ
  - `checkLicenseExists(licenseNo, excludeDentistId)` - ตรวจสอบเลขใบอนุญาตซ้ำ
  - `createDentist(dentistData)` - สร้างทันตแพทย์ใหม่
  - `updateDentist(dentistId, updateData)` - อัปเดตข้อมูลทันตแพทย์
  - `deleteDentist(dentistId)` - ลบทันตแพทย์
  - `getDentistsForAPI()` - ดึงข้อมูลทันตแพทย์สำหรับ API
  - `getDentistSpecialties()` - ดึงข้อมูลสาขาวิชาเฉพาะ
  - `getAvailableDentists(date, time)` - ดึงข้อมูลทันตแพทย์ที่ว่าง

### 3. PatientAdminModel (`models/PatientAdmin.model.js`)
- **หน้าที่**: จัดการข้อมูลผู้ป่วยสำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAllPatients()` - ดึงรายการผู้ป่วยทั้งหมด
  - `getAllPatientsWithDetails()` - ดึงรายการผู้ป่วยพร้อมข้อมูลเพิ่มเติม
  - `getPatientById(patientId)` - ดึงข้อมูลผู้ป่วยตาม ID
  - `checkEmailExists(email)` - ตรวจสอบอีเมลซ้ำ
  - `checkIdCardExists(idCard, excludePatientId)` - ตรวจสอบเลขบัตรประชาชนซ้ำ
  - `createPatient(patientData)` - สร้างผู้ป่วยใหม่
  - `updatePatient(patientId, updateData)` - อัปเดตข้อมูลผู้ป่วย
  - `deletePatient(patientId)` - ลบผู้ป่วย
  - `getPatientTreatmentHistory(patientId)` - ดึงประวัติการรักษา
  - `getTreatmentDetails(patientId, queueId)` - ดึงรายละเอียดการรักษา
  - `checkEmailAvailability(email)` - ตรวจสอบความพร้อมใช้งานของอีเมล
  - `checkIdCardAvailability(idCard, excludePatientId)` - ตรวจสอบความพร้อมใช้งานของเลขบัตรประชาชน

### 4. TreatmentAdminModel (`models/TreatmentAdmin.model.js`)
- **หน้าที่**: จัดการข้อมูลการรักษาสำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAllTreatments()` - ดึงรายการการรักษาทั้งหมด
  - `getTreatmentById(treatmentId)` - ดึงข้อมูลการรักษาตาม ID
  - `createTreatment(treatmentData)` - สร้างการรักษาใหม่
  - `updateTreatment(treatmentId, updateData)` - อัปเดตข้อมูลการรักษา
  - `deleteTreatment(treatmentId)` - ลบการรักษา
  - `getAvailableDentists()` - ดึงรายการทันตแพทย์ที่สามารถทำการรักษาได้
  - `getTreatmentsForAPI()` - ดึงรายการการรักษาสำหรับ API
  - `getDentistsForTreatment(treatmentId)` - ดึงรายการทันตแพทย์ที่สามารถทำการรักษาเฉพาะ
  - `getDentistTreatments(dentistId)` - ดึงข้อมูลการรักษาของทันตแพทย์
  - `getDentistTreatmentMappings()` - ดึงข้อมูลการรักษาของทันตแพทย์ทั้งหมด

### 5. AppointmentAdminModel (`models/AppointmentAdmin.model.js`)
- **หน้าที่**: จัดการข้อมูลนัดหมายสำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAllAppointments(filters)` - ดึงรายการนัดหมายทั้งหมด
  - `getAppointmentById(appointmentId)` - ดึงข้อมูลนัดหมายตาม ID
  - `createAppointment(appointmentData)` - สร้างนัดหมายใหม่
  - `updateAppointment(appointmentId, updateData)` - อัปเดตข้อมูลนัดหมาย
  - `updateAppointmentStatus(appointmentId, status)` - อัปเดตสถานะนัดหมาย
  - `deleteAppointment(appointmentId)` - ลบนัดหมาย
  - `validateAppointmentTime(date, time, dentistId, excludeAppointmentId)` - ตรวจสอบความพร้อมใช้งานของเวลานัดหมาย
  - `getAppointmentStats(filters)` - ดึงข้อมูลสถิติการนัดหมาย
  - `getPendingAppointmentsCount()` - ดึงข้อมูลนัดหมายที่รอดำเนินการ
  - `bulkUpdateAppointmentStatus(appointmentIds, status)` - อัปเดตสถานะนัดหมายหลายรายการ
  - `getDentistSchedule(dentistId, date)` - ดึงข้อมูลตารางเวลาของทันตแพทย์
  - `getCalendarData(startDate, endDate)` - ดึงข้อมูลนัดหมายสำหรับปฏิทิน

### 6. NotificationAdminModel (`models/NotificationAdmin.model.js`)
- **หน้าที่**: จัดการการแจ้งเตือนสำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAllNotifications(filters)` - ดึงรายการการแจ้งเตือนทั้งหมด
  - `getNotificationById(notificationId)` - ดึงข้อมูลการแจ้งเตือนตาม ID
  - `createNotification(notificationData)` - สร้างการแจ้งเตือนใหม่
  - `updateNotification(notificationId, updateData)` - อัปเดตข้อมูลการแจ้งเตือน
  - `markAsRead(notificationId)` - กำหนดสถานะการอ่าน
  - `markAllAsRead()` - กำหนดสถานะการอ่านทั้งหมด
  - `deleteNotification(notificationId)` - ลบการแจ้งเตือน
  - `getUnreadCount()` - ดึงจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
  - `getNewCount()` - ดึงจำนวนการแจ้งเตือนใหม่
  - `createAppointmentNotification(appointmentData)` - สร้างการแจ้งเตือนสำหรับนัดหมาย
  - `createCancellationNotification(appointmentData)` - สร้างการแจ้งเตือนสำหรับการยกเลิกนัดหมาย
  - `createConfirmationNotification(appointmentData)` - สร้างการแจ้งเตือนสำหรับการยืนยันนัดหมาย
  - `createReminderNotification(appointmentData)` - สร้างการแจ้งเตือนสำหรับการแจ้งเตือนล่วงหน้า
  - `createWelcomeNotification(userData)` - สร้างการแจ้งเตือนสำหรับการสร้างบัญชีผู้ใช้
  - `getPatientNotifications(patientId, filters)` - ดึงการแจ้งเตือนสำหรับผู้ป่วย
  - `deleteOldNotifications(daysOld)` - ลบการแจ้งเตือนเก่า

### 7. ReportAdminModel (`models/ReportAdmin.model.js`)
- **หน้าที่**: จัดการรายงานและสถิติสำหรับ admin
- **ฟังก์ชันหลัก**:
  - `getAppointmentStats(filters)` - ดึงข้อมูลสถิติการนัดหมาย
  - `getTreatmentStats(filters)` - ดึงข้อมูลสถิติการรักษา
  - `getDentistStats(filters)` - ดึงข้อมูลสถิติทันตแพทย์
  - `getPatientStats(filters)` - ดึงข้อมูลสถิติผู้ป่วย
  - `getMonthlyStats(year)` - ดึงข้อมูลสถิติรายเดือน
  - `getDailyStats(startDate, endDate)` - ดึงข้อมูลสถิติรายวัน
  - `getHourlyStats(date)` - ดึงข้อมูลสถิติรายชั่วโมง
  - `getPopularTreatments(filters)` - ดึงข้อมูลสถิติการรักษาที่ได้รับความนิยม
  - `getSystemUsageStats(filters)` - ดึงข้อมูลสถิติการใช้งานระบบ
  - `getCancellationStats(filters)` - ดึงข้อมูลสถิติการยกเลิกนัดหมาย
  - `getDentistPerformanceStats(filters)` - ดึงข้อมูลสถิติประสิทธิภาพทันตแพทย์
  - `getSpecialtyStats(filters)` - ดึงข้อมูลสถิติการรักษาตามสาขาวิชาเฉพาะ
  - `getTimeBasedStats(startDate, endDate)` - ดึงข้อมูลสถิติการใช้งานระบบตามช่วงเวลา

## การอัปเดต Controller

### admin.controller.js
ได้อัปเดตฟังก์ชันต่างๆ ให้ใช้ models แทน SQL queries โดยตรง:

1. **getProfile** - ใช้ `AdminModel.getProfile()`
2. **changePassword** - ใช้ `AdminModel.getCurrentPassword()` และ `AdminModel.updatePassword()`
3. **getDashboard** - ใช้ `AdminModel.getDashboardData()`
4. **getScheduleAPI** - ใช้ `AdminModel.getScheduleData()`
5. **viewAppointments** - ใช้ `AdminModel.getAppointmentsByDate()`
6. **ajaxAppointments** - ใช้ `AdminModel.getAllAppointments()`
7. **addDentist** - ใช้ `DentistAdminModel.checkEmailExists()` และ `DentistAdminModel.createDentist()`
8. **viewDentist** - ใช้ `DentistAdminModel.getDentistById()`
9. **editDentistForm** - ใช้ `DentistAdminModel.getDentistById()`

## การอัปเดต Models Index

### models/index.js
ได้เพิ่ม exports สำหรับ models ใหม่ทั้งหมด:
- AdminModel
- DentistAdminModel
- PatientAdminModel
- TreatmentAdminModel
- AppointmentAdminModel
- NotificationAdminModel
- ReportAdminModel

## ประโยชน์ที่ได้รับ

1. **แยกความรับผิดชอบ**: Controller จัดการ HTTP requests/responses, Model จัดการข้อมูลและ business logic
2. **ลดการซ้ำซ้อน**: SQL queries ถูกจัดกลุ่มใน models ที่เหมาะสม
3. **ง่ายต่อการบำรุงรักษา**: การแก้ไข business logic ทำได้ในที่เดียว
4. **ง่ายต่อการทดสอบ**: สามารถทดสอบ models แยกจาก controllers
5. **เพิ่มความยืดหยุ่น**: สามารถเปลี่ยน database หรือ ORM ได้โดยไม่กระทบ controllers
6. **ตามหลักการ SOLID**: Single Responsibility Principle และ Dependency Inversion Principle

## สถานะการทำงาน

✅ **เสร็จสิ้นทั้งหมด** - การแยก model ออกจาก admin controller เสร็จสิ้นเรียบร้อยแล้ว

- สร้าง Admin Models ทั้งหมด 7 ไฟล์
- อัปเดต admin.controller.js ให้ใช้ models
- อัปเดต models/index.js เพื่อ export models ใหม่
- ไม่มี linter errors
- ตามหลักการที่ดีของ software architecture

