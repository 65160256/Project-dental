# SQL Query Analysis Report - Controller Files

## Executive Summary
This report analyzes SQL queries found in controller files to support refactoring efforts following MVC principles. The goal is to move database operations from controllers to model files.

---

## 1. notification.controller.js
**Location:** `D:\dentist\controller\notification.controller.js`
**Status:** Contains direct SQL queries that need to be moved to Notification model

### SQL Operations Found:

#### Admin Notifications (Lines 33-52)
```sql
SELECT n.*, p.fname as patient_fname, p.lname as patient_lname, p.phone as patient_phone,
       d.fname as dentist_fname, d.lname as dentist_lname, d.specialty as dentist_specialty,
       q.time as appointment_time, t.treatment_name
FROM notifications n
LEFT JOIN patient p ON n.patient_id = p.patient_id
LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
LEFT JOIN queue q ON n.appointment_id = q.queue_id
LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
WHERE [dynamic conditions]
ORDER BY n.created_at DESC
LIMIT ? OFFSET ?
```
**Purpose:** Retrieve admin notifications with joined data
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getAdminNotificationsWithPagination(limit, offset, filters)`

#### Get Unread Count (Lines 55-59)
```sql
SELECT COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
FROM notifications
```
**Purpose:** Get total and unread notification counts
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getNotificationCounts()`

#### Get Dentist by User ID (Lines 97-100)
```sql
SELECT dentist_id FROM dentist WHERE user_id = ?
```
**Purpose:** Find dentist ID from user ID
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.findByUserId(userId)`

#### Dentist Notifications (Lines 138-146)
```sql
SELECT n.*, p.fname AS patient_fname, p.lname AS patient_lname, p.phone AS patient_phone,
       q.time AS appointment_time, t.treatment_name
FROM notifications n
LEFT JOIN patient p ON n.patient_id = p.patient_id
LEFT JOIN queue q ON n.appointment_id = q.queue_id
LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
WHERE n.dentist_id = ? [AND n.is_read = 0]
ORDER BY n.created_at DESC
LIMIT ? OFFSET ?
```
**Purpose:** Get dentist-specific notifications
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getDentistNotifications(dentistId, filters)`

#### Get Patient by User ID (Lines 181-184)
```sql
SELECT patient_id FROM patient WHERE user_id = ?
```
**Purpose:** Find patient ID from user ID
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByUserId(userId)`

#### Patient Notifications (Lines 225-233)
```sql
SELECT n.*, CONCAT(d.fname, ' ', d.lname) as dentist_name, d.specialty as dentist_specialty,
       q.time as appointment_time, q.queue_status, t.treatment_name
FROM notifications n
LEFT JOIN dentist d ON n.dentist_id = d.dentist_id
LEFT JOIN queue q ON n.appointment_id = q.queue_id
LEFT JOIN treatment t ON q.treatment_id = t.treatment_id
WHERE n.patient_id = ?
ORDER BY n.created_at DESC
LIMIT ? OFFSET ?
```
**Purpose:** Get patient-specific notifications
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getPatientNotifications(patientId, filters)`

#### Mark as Read (Lines 263-267)
```sql
UPDATE notifications
SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP
WHERE id = ?
```
**Purpose:** Mark single notification as read
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.markAsRead(notificationId)`

#### Mark All as Read (Lines 319-323)
```sql
UPDATE notifications
SET is_read = 1, is_new = 0, updated_at = CURRENT_TIMESTAMP
WHERE [dentist_id = ? OR patient_id = ?]
```
**Purpose:** Mark all notifications as read for specific user
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.markAllAsRead(userType, userId)`

#### Delete Notification (Lines 344-347)
```sql
DELETE FROM notifications WHERE id = ?
```
**Purpose:** Delete a notification
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.deleteById(id)`

#### Get Unread Count (Lines 402-404)
```sql
SELECT COUNT(*) as count FROM notifications WHERE [conditions]
```
**Purpose:** Get unread notification count
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getUnreadCount(userType, userId)`

---

## 2. register.controller.js
**Location:** `D:\dentist\controller\register.controller.js`
**Status:** ✅ ALREADY REFACTORED - Uses RegisterModel

### Model Integration Found:
- ✅ Uses `RegisterModel.checkDuplicates()` (Line 145-148)
- ✅ Uses `RegisterModel.registerPatientWithTransaction()` (Line 180-184)
- ✅ Uses `RegisterModel.checkEmailExists()` (Line 220)
- ✅ Uses `RegisterModel.checkIdCardExists()` (Line 249)
- ✅ Uses `RegisterModel.getTotalPatientsCount()` (Line 268)
- ✅ Uses `RegisterModel.getRecentPatients()` (Line 269)

**Status:** This controller is already properly refactored and follows MVC principles.

---

## 3. password-reset.controller.js
**Location:** `D:\dentist\controller\password-reset.controller.js`
**Status:** ✅ ALREADY REFACTORED - Uses PasswordResetModel

### Model Integration Found:
- ✅ Uses `PasswordResetModel.getUserByEmail()` (Lines 31, 209)
- ✅ Uses `PasswordResetModel.deleteTokensByEmail()` (Lines 43, 219)
- ✅ Uses `PasswordResetModel.createPasswordResetToken()` (Lines 50-55, 226-231)
- ✅ Uses `PasswordResetModel.validateToken()` (Line 95)
- ✅ Uses `PasswordResetModel.getTokenWithUser()` (Line 156)
- ✅ Uses `PasswordResetModel.resetPasswordWithToken()` (Lines 169-173, 332-336)
- ✅ Uses `PasswordResetModel.validateTokenForApi()` (Line 266)
- ✅ Uses `PasswordResetModel.getTokenForApiReset()` (Line 319)
- ✅ Uses `PasswordResetModel.cleanupExpiredTokens()` (Line 359)
- ✅ Uses `PasswordResetModel.getActiveTokensCount()` (Line 370)
- ✅ Uses `PasswordResetModel.getPasswordResetStats()` (Line 379)

**Status:** This controller is already properly refactored and follows MVC principles.

---

## 4. login.controller.js
**Location:** `D:\dentist\controller\login.controller.js`
**Status:** ✅ ALREADY REFACTORED - Uses LoginModel

### Model Integration Found:
- ✅ Uses `LoginModel.getUserByEmail()` (Line 17)
- ✅ Uses `LoginModel.updateLastLogin()` (Line 50)
- ✅ Uses `LoginModel.getDentistByUserId()` (Line 59)
- ✅ Uses `LoginModel.getPatientByUserId()` (Line 69)
- ✅ Uses `LoginModel.getUserById()` (Line 116)
- ✅ Uses `LoginModel.getUserDataForApi()` (Line 203)
- ✅ Uses `LoginModel.getProfileByRole()` (Line 210)

**Status:** This controller is already properly refactored and follows MVC principles.

---

## 5. admin.slots.controller.js
**Location:** `D:\dentist\controller\admin.slots.controller.js`
**Status:** Contains direct SQL queries that need to be moved to AvailableSlots model

### SQL Operations Found:

#### Call Stored Procedure (Lines 18, 44)
```sql
CALL generate_available_slots(?, ?)
```
**Purpose:** Generate available slots for date range
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.generateSlotsForDateRange(startDate, endDate)`

#### Get Slots Statistics (Lines 65-76)
```sql
SELECT COUNT(*) as total_slots,
       COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
       COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
       COUNT(DISTINCT dentist_id) as total_dentists,
       COUNT(DISTINCT date) as total_days,
       MIN(date) as earliest_date,
       MAX(date) as latest_date
FROM available_slots
WHERE date >= CURDATE()
```
**Purpose:** Get overall slot statistics
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getOverallStatistics()`

#### Slots by Dentist (Lines 78-91)
```sql
SELECT d.dentist_id, CONCAT(d.fname, ' ', d.lname) as dentist_name, d.specialty,
       COUNT(s.slot_id) as total_slots,
       COUNT(CASE WHEN s.is_available = 1 THEN 1 END) as available_slots,
       COUNT(CASE WHEN s.is_available = 0 THEN 1 END) as booked_slots
FROM dentist d
LEFT JOIN available_slots s ON d.dentist_id = s.dentist_id AND s.date >= CURDATE()
WHERE d.user_id IS NOT NULL
GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
ORDER BY d.fname, d.lname
```
**Purpose:** Get slot statistics grouped by dentist
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getStatisticsByDentist()`

#### Slots by Date (Lines 93-105)
```sql
SELECT date, COUNT(*) as total_slots,
       COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
       COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
       COUNT(DISTINCT dentist_id) as dentists_working
FROM available_slots
WHERE date >= CURDATE() AND date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
GROUP BY date
ORDER BY date
```
**Purpose:** Get slot statistics for next 7 days
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getStatisticsByDate(days = 7)`

#### Cleanup Old Slots (Lines 126-129)
```sql
DELETE FROM available_slots WHERE date < CURDATE()
```
**Purpose:** Delete past date slots
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.cleanupPastSlots()`

#### Get Dentist Slots (Lines 158-190)
```sql
SELECT s.slot_id, s.date, s.start_time, s.end_time, s.is_available, s.treatment_id,
       t.treatment_name,
       CASE
         WHEN EXISTS (SELECT 1 FROM queue q WHERE ...) THEN 'booked'
         WHEN s.is_available = 1 THEN 'available'
         ELSE 'unavailable'
       END as status,
       q.queue_id, CONCAT(p.fname, ' ', p.lname) as patient_name
FROM available_slots s
LEFT JOIN treatment t ON s.treatment_id = t.treatment_id
LEFT JOIN queue q ON ...
LEFT JOIN patient p ON q.patient_id = p.patient_id
WHERE s.dentist_id = ? AND s.date = ?
ORDER BY s.start_time
```
**Purpose:** Get detailed slots for specific dentist and date
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getDentistSlotsWithDetails(dentistId, date)`

#### Check Slot Exists (Lines 220-223)
```sql
SELECT slot_id FROM available_slots
WHERE dentist_id = ? AND date = ? AND start_time = ?
```
**Purpose:** Check if slot already exists
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.slotExists(dentistId, date, startTime)`

#### Create Slot (Lines 232-235)
```sql
INSERT INTO available_slots (dentist_id, date, start_time, end_time, is_available)
VALUES (?, ?, ?, ?, 1)
```
**Purpose:** Create new slot manually
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.createSlot(slotData)`

#### Get Slot for Deletion Check (Lines 257-265)
```sql
SELECT s.*, q.queue_id
FROM available_slots s
LEFT JOIN queue q ON ...
WHERE s.slot_id = ?
```
**Purpose:** Get slot with booking status
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getSlotWithBookingStatus(slotId)`

#### Delete Slot (Line 281)
```sql
DELETE FROM available_slots WHERE slot_id = ?
```
**Purpose:** Delete a slot
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.deleteById(slotId)`

#### Update Slot Availability (Lines 303-307)
```sql
UPDATE available_slots
SET is_available = ?, updated_at = NOW()
WHERE slot_id = ?
```
**Purpose:** Toggle slot availability
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.updateAvailability(slotId, isAvailable)`

---

## 6. admin.controller.js
**Location:** `D:\dentist\controller\admin.controller.js`
**Status:** Contains extensive SQL queries (5410 lines) - NEEDS REFACTORING

### SQL Operations Found (Sample - First 1500 lines):

#### Get User Profile (Lines 13-18)
```sql
SELECT u.email, u.username, u.last_login, r.rname
FROM user u
JOIN role r ON u.role_id = r.role_id
WHERE u.user_id = ?
```
**Purpose:** Get admin profile information
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.getProfileWithRole(userId)`

#### Get User Password (Line 52)
```sql
SELECT password FROM user WHERE user_id = ?
```
**Purpose:** Get user password for verification
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.getPasswordHash(userId)`

#### Update Password (Line 69)
```sql
UPDATE user SET password = ? WHERE user_id = ?
```
**Purpose:** Update user password
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.updatePassword(userId, hashedPassword)`

#### Get Dashboard Schedule Data (Lines 92-114)
```sql
SELECT ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note,
       d.fname, d.lname, d.specialty,
       COUNT(q.queue_id) as appointment_count
FROM dentist_schedule ds
JOIN dentist d ON ds.dentist_id = d.dentist_id
LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
  AND DATE(q.time) = ds.schedule_date
  AND HOUR(q.time) = ds.hour
  AND q.queue_status IN ('pending', 'confirm')
WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY
  AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY
GROUP BY [all fields]
ORDER BY ds.schedule_date, ds.hour
```
**Purpose:** Get dentist schedules for dashboard calendar
**Recommended Model:** `models/DentistSchedule.model.js`
**Suggested Method:** `DentistSchedule.getDashboardScheduleData()`

#### Get Appointments by Date (Lines 413-428)
```sql
SELECT qd.date AS time_start, CONCAT(p.fname, ' ', p.lname) AS name,
       t.treatment_name AS treatment, d.fname AS dentist,
       p.phone, q.queue_status AS status
FROM queuedetail qd
JOIN patient p ON qd.patient_id = p.patient_id
JOIN treatment t ON qd.treatment_id = t.treatment_id
JOIN dentist d ON qd.dentist_id = d.dentist_id
JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
WHERE DATE(qd.date) = ?
ORDER BY qd.date DESC
```
**Purpose:** Get appointments for specific date
**Recommended Model:** `models/Queue.model.js`
**Suggested Method:** `Queue.getAppointmentsByDate(date)`

#### Check Duplicate Email (Line 551)
```sql
SELECT COUNT(*) as count FROM user WHERE email = ?
```
**Purpose:** Check if email exists
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.emailExists(email)`

#### Create User (Lines 577-580)
```sql
INSERT INTO user (email, password, role_id) VALUES (?, ?, 2)
```
**Purpose:** Create new user account for dentist
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.createUser(email, password, roleId)`

#### Create Dentist (Lines 625-629)
```sql
INSERT INTO dentist (user_id, fname, lname, dob, id_card, specialty, education, address, phone, photo)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
**Purpose:** Create dentist profile
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.create(dentistData)`

#### Get Dentist with User (Lines 690-693, 731-736)
```sql
SELECT d.*, u.email FROM dentist d
JOIN user u ON d.user_id = u.user_id
WHERE d.dentist_id = ?
```
**Purpose:** Get dentist profile with email
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.findByIdWithUser(dentistId)`

#### Check Duplicate ID Card (Lines 792-795)
```sql
SELECT COUNT(*) as count FROM dentist WHERE id_card = ? AND dentist_id != ?
```
**Purpose:** Check duplicate ID card when editing
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.idCardExistsExcept(idCard, dentistId)`

#### Check Duplicate License (Lines 813-816)
```sql
SELECT COUNT(*) as count FROM dentist WHERE license_no = ? AND dentist_id != ?
```
**Purpose:** Check duplicate license number
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.licenseExistsExcept(licenseNo, dentistId)`

#### Update User Table (Line 856)
```sql
UPDATE user SET [email/password] WHERE user_id = ?
```
**Purpose:** Update user account info
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.updateFields(userId, fields)`

#### Update Dentist (Lines 883-888)
```sql
UPDATE dentist SET
  fname = ?, lname = ?, dob = ?, id_card = ?, license_no = ?,
  specialty = ?, education = ?, address = ?, phone = ?, photo = ?
WHERE dentist_id = ?
```
**Purpose:** Update dentist profile
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.update(dentistId, dentistData)`

#### Delete Dentist (Line 924)
```sql
DELETE FROM dentist WHERE dentist_id = ?
```
**Purpose:** Delete dentist record
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.deleteById(dentistId)`

#### Get All Patients (Lines 943-946)
```sql
SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
FROM patient
```
**Purpose:** Get simple patient list
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.getAllBasicInfo()`

#### Get Patients with Stats (Lines 957-975)
```sql
SELECT p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address, p.id_card,
       u.email, u.last_login,
       MAX(q.time) as last_visit,
       COUNT(DISTINCT q.queue_id) as total_appointments
FROM patient p
LEFT JOIN user u ON p.user_id = u.user_id
LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
GROUP BY [patient fields]
ORDER BY p.fname, p.lname
```
**Purpose:** Get patients with appointment statistics
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.getAllWithStats()`

#### Get Patient by ID (Lines 1015-1027)
```sql
SELECT p.*, u.email, u.last_login,
       COUNT(DISTINCT q.queue_id) as total_appointments,
       MAX(q.time) as last_visit
FROM patient p
LEFT JOIN user u ON p.user_id = u.user_id
LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm', 'pending')
WHERE p.patient_id = ?
GROUP BY p.patient_id
```
**Purpose:** Get single patient with stats
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByIdWithStats(patientId)`

#### Delete Patient (Complex Transaction, Lines 1076-1124)
```sql
START TRANSACTION
UPDATE queue SET queue_status = 'cancel' WHERE patient_id = ? AND queue_status IN ('pending', 'confirm')
DELETE FROM treatmentHistory WHERE queuedetail_id IN (SELECT ...)
DELETE FROM queuedetail WHERE patient_id = ?
DELETE FROM patient WHERE patient_id = ?
DELETE FROM user WHERE user_id = ?
INSERT INTO notifications ...
COMMIT
```
**Purpose:** Delete patient with all related records
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.deleteWithRelatedRecords(patientId)`

#### Check Email Exists (Line 1163)
```sql
SELECT COUNT(*) as count FROM user WHERE email = ?
```
**Purpose:** Check email before creating patient
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.emailExists(email)`

#### Create Patient (Transaction, Lines 1173-1213)
```sql
START TRANSACTION
INSERT INTO user (email, password, role_id) VALUES (?, ?, 3)
INSERT INTO patient (user_id, fname, lname, dob, id_card, phone, address, gender, chronic_disease, allergy_history)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
INSERT INTO notifications ...
COMMIT
```
**Purpose:** Create patient with user account
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.createWithUser(userData, patientData)`

#### Get Unread Notification Count (Lines 1247-1250)
```sql
SELECT COUNT(*) as count FROM notifications WHERE is_read = 0
```
**Purpose:** Get unread notifications count
**Recommended Model:** `models/Notification.model.js`
**Suggested Method:** `Notification.getUnreadCount()`

#### Get Patient for Edit (Lines 1261-1266)
```sql
SELECT p.*, u.email
FROM patient p
JOIN user u ON p.user_id = u.user_id
WHERE p.patient_id = ?
```
**Purpose:** Get patient with email for editing
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByIdWithUser(patientId)`

#### Update Patient (Lines 1289-1293)
```sql
UPDATE patient
SET fname = ?, lname = ?, dob = ?, phone = ?, address = ?
WHERE patient_id = ?
```
**Purpose:** Update patient basic info
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.updateBasicInfo(patientId, data)`

#### View Patient (Lines 1308-1313)
```sql
SELECT p.*, u.email
FROM patient p
JOIN user u ON p.user_id = u.user_id
WHERE p.patient_id = ?
```
**Purpose:** View patient details
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByIdWithUser(patientId)`

#### Delete Patient (Simple, Lines 1332-1335)
```sql
DELETE FROM queue WHERE patient_id = ?
DELETE FROM patient WHERE patient_id = ?
```
**Purpose:** Delete patient (simpler version)
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.deleteById(patientId)`

#### Update Patient API (Complex Transaction, Lines 1354-1486)
```sql
START TRANSACTION
-- Check email duplicate
SELECT COUNT(*) as count FROM user WHERE email = ? AND user_id != ?
-- Update user table
UPDATE user SET [email/password] WHERE user_id = ?
-- Update patient table
UPDATE patient SET [various fields] WHERE patient_id = ?
-- Create notification
INSERT INTO notifications ...
COMMIT
```
**Purpose:** Update patient via API
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.updateWithUser(patientId, userData, patientData)`

---

## 7. dentist.controller.js
**Location:** `D:\dentist\controller\dentist.controller.js`
**Status:** PARTIALLY REFACTORED - Some methods use models, others still have SQL

### Already Refactored Methods (Use Models):
- ✅ `getDashboard` - Uses `DentistModel.findByUserIdWithFullInfo()` and `DentistModel.getDashboardData()` (Lines 53-92)
- ✅ `getAppointments` - Uses `DentistModel.findByUserId()` and `QueueModel.findAllWithStats()` (Lines 96-131)
- ✅ `getAppointmentDetail` - Uses `DentistModel.findByUserId()` and `QueueModel.findByIdWithDetailsAndAuth()` (Lines 134-166)
- ✅ `updateAppointmentStatus` - Uses `DentistModel.findByUserId()` and `QueueModel.updateAppointmentStatus()` (Lines 169-223)
- ✅ `getMonthlySchedule` - Uses `DentistModel.findByUserIdWithFullInfo()` (Lines 367-391)
- ✅ `getPatients` - Uses `DentistModel.findByUserId()` and `PatientModel.findAllWithStats()` (Lines 447-476)
- ✅ `getPatientDetailAPI` - Uses `DentistModel.findByUserId()`, `PatientModel.hasVisitedDentist()` (Lines 481-500)

### Still Need Refactoring (Direct SQL):

#### Save Schedule Range (Lines 247-362)
```sql
SELECT dentist_id FROM dentist WHERE user_id = ?
START TRANSACTION
DELETE FROM dentist_schedule WHERE dentist_id = ? AND schedule_date BETWEEN ? AND ?
INSERT INTO dentist_schedule (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
COMMIT
```
**Purpose:** Save dentist schedule for date range
**Recommended Model:** `models/DentistSchedule.model.js`
**Suggested Method:** `DentistSchedule.saveScheduleRange(dentistId, scheduleData)`

#### Delete Schedule Range (Lines 393-443)
```sql
SELECT dentist_id FROM dentist WHERE user_id = ?
SELECT COUNT(*) as count FROM queue WHERE dentist_id = ? AND DATE(time) BETWEEN ? AND ? AND queue_status IN ('pending', 'confirm')
DELETE FROM dentist_schedule WHERE dentist_id = ? AND schedule_date BETWEEN ? AND ?
```
**Purpose:** Delete schedule range with validation
**Recommended Model:** `models/DentistSchedule.model.js`
**Suggested Method:** `DentistSchedule.deleteScheduleRangeWithValidation(dentistId, startDate, endDate)`

---

## 8. patient.controller.js
**Location:** `D:\dentist\controller\patient.controller.js`
**Status:** Contains SQL queries - NEEDS REFACTORING

### SQL Operations Found (First 500 lines):

#### Forgot Password - Find User (Lines 16-19)
```sql
SELECT * FROM user u
JOIN patient p ON u.user_id = p.user_id
WHERE u.email = ? AND u.role_id = 3
```
**Purpose:** Find patient by email
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByEmailWithUser(email)`

#### Reset Password (Line 62)
```sql
UPDATE user SET password = ? WHERE email = ? AND role_id = 3
```
**Purpose:** Update patient password
**Recommended Model:** `models/User.model.js`
**Suggested Method:** `User.resetPasswordByEmail(email, hashedPassword, roleId)`

#### Get Patient Dashboard (Lines 76-122)
```sql
-- Get patient info
SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?

-- Get next appointment
SELECT q.queue_id, q.time, t.treatment_name, CONCAT(d.fname, ' ', d.lname) AS dentist, q.queue_status
FROM queue q
JOIN treatment t ON q.treatment_id = t.treatment_id
JOIN dentist d ON q.dentist_id = d.dentist_id
WHERE q.patient_id = ? AND q.time > NOW() AND q.queue_status IN ('pending', 'confirm')
ORDER BY q.time ASC LIMIT 1

-- Get appointments history
SELECT q.time, CONCAT(p.fname, ' ', p.lname) AS name, t.treatment_name, CONCAT(d.fname, ' ', d.lname) AS dentist, q.queue_status
FROM queue q
JOIN patient p ON q.patient_id = p.patient_id
JOIN treatment t ON q.treatment_id = t.treatment_id
JOIN dentist d ON q.dentist_id = d.dentist_id
WHERE q.patient_id = ? ORDER BY q.time DESC LIMIT 5

-- Get treatment history
SELECT th.diagnosis, th.followUpdate, t.treatment_name, CONCAT(d.fname, ' ', d.lname) AS dentist
FROM treatmentHistory th
JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
JOIN treatment t ON qd.treatment_id = t.treatment_id
JOIN dentist d ON qd.dentist_id = d.dentist_id
WHERE qd.patient_id = ?
ORDER BY th.tmh_id DESC LIMIT 1

-- Get today's dentists
SELECT DISTINCT CONCAT(d.fname, ' ', d.lname) AS name, d.photo, d.specialty
FROM dentist d
JOIN available_slots s ON d.dentist_id = s.dentist_id
WHERE s.date = CURDATE() AND s.is_available = 1
```
**Purpose:** Get all dashboard data
**Recommended Model:** `models/Patient.model.js`, `models/Queue.model.js`, `models/TreatmentHistory.model.js`, `models/Dentist.model.js`
**Suggested Methods:**
- `Patient.getDashboardData(patientId)`
- `Queue.getNextAppointment(patientId)`
- `Queue.getRecentAppointments(patientId, limit)`
- `TreatmentHistory.getLatestForPatient(patientId)`
- `Dentist.getTodayAvailable()`

#### Get Patient for Booking (Lines 170-176)
```sql
SELECT p.*, u.email FROM patient p
JOIN user u ON p.user_id = u.user_id
WHERE p.user_id = ?
```
**Purpose:** Get patient info for booking
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.findByUserIdWithEmail(userId)`

#### Get Treatments (Line 178)
```sql
SELECT * FROM treatment ORDER BY treatment_name
```
**Purpose:** Get all treatments
**Recommended Model:** `models/Treatment.model.js`
**Suggested Method:** `Treatment.getAll()`

#### Get Available Dentists (Lines 231-277)
```sql
SELECT d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.education,
       CASE WHEN d.photo IS NULL OR d.photo = '' THEN 'default-doctor.png' ELSE d.photo END as photo,
       COUNT(DISTINCT s.slot_id) as total_slots,
       COUNT(DISTINCT CASE
         WHEN s.is_available = 1 AND NOT EXISTS (
           SELECT 1 FROM queue q WHERE q.dentist_id = s.dentist_id
           AND DATE(q.time) = s.date AND TIME(q.time) = s.start_time
           AND q.queue_status IN ('pending', 'confirm')
         ) THEN s.slot_id
       END) as available_slots
FROM dentist d
INNER JOIN available_slots s ON d.dentist_id = s.dentist_id
WHERE s.date = ? AND d.user_id IS NOT NULL
[AND treatment filter if provided]
GROUP BY [dentist fields]
HAVING available_slots > 0
ORDER BY d.fname, d.lname
```
**Purpose:** Find dentists with available slots
**Recommended Model:** `models/Dentist.model.js`
**Suggested Method:** `Dentist.getAvailableForDate(date, treatmentId)`

#### Get Dentist Treatments (Lines 285-291)
```sql
SELECT t.treatment_id, t.treatment_name, t.duration
FROM dentist_treatment dt
JOIN treatment t ON dt.treatment_id = t.treatment_id
WHERE dt.dentist_id = ?
ORDER BY t.treatment_name
```
**Purpose:** Get treatments for specific dentist
**Recommended Model:** `models/DentistTreatment.model.js`
**Suggested Method:** `DentistTreatment.getTreatmentsForDentist(dentistId)`

#### Get Treatment Duration (Lines 328-331)
```sql
SELECT duration FROM treatment WHERE treatment_id = ?
```
**Purpose:** Get treatment duration
**Recommended Model:** `models/Treatment.model.js`
**Suggested Method:** `Treatment.getDuration(treatmentId)`

#### Get Available Time Slots (Lines 344-363)
```sql
SELECT s.slot_id, s.start_time, s.end_time,
       TIME_FORMAT(s.start_time, '%H:%i') as formatted_start_time,
       TIME_FORMAT(s.end_time, '%H:%i') as formatted_end_time
FROM available_slots s
WHERE s.dentist_id = ? AND s.date = ? AND s.is_available = 1
AND NOT EXISTS (
  SELECT 1 FROM queue q
  WHERE q.dentist_id = s.dentist_id
  AND DATE(q.time) = s.date
  AND TIME(q.time) = s.start_time
  AND q.queue_status IN ('pending', 'confirm')
)
ORDER BY s.start_time
```
**Purpose:** Get available time slots
**Recommended Model:** `models/AvailableSlots.model.js`
**Suggested Method:** `AvailableSlots.getAvailableForDentistAndDate(dentistId, date)`

#### Get Patient ID (Lines 461-463)
```sql
SELECT patient_id, fname, lname FROM patient WHERE user_id = ?
```
**Purpose:** Get patient ID from user ID
**Recommended Model:** `models/Patient.model.js`
**Suggested Method:** `Patient.getBasicInfoByUserId(userId)`

#### Get Treatment Duration for Booking (Lines 475-478)
```sql
SELECT duration FROM treatment WHERE treatment_id = ?
```
**Purpose:** Get treatment duration for booking
**Recommended Model:** `models/Treatment.model.js`
**Suggested Method:** `Treatment.getDuration(treatmentId)`

---

## Common Patterns Identified

### 1. **User Authentication & Profile**
- Get user by ID/email with role
- Update user password
- Check email exists
- Multiple controllers need these operations

**Recommended Central Model:** `models/User.model.js`
**Key Methods Needed:**
- `User.findById(userId)`
- `User.findByEmail(email)`
- `User.getProfileWithRole(userId)`
- `User.emailExists(email)`
- `User.emailExistsExcept(email, userId)`
- `User.updatePassword(userId, hashedPassword)`
- `User.createUser(userData)`
- `User.deleteById(userId)`

### 2. **Dentist Operations**
- Find dentist by user_id
- Get dentist with user/email
- Check duplicates (id_card, license_no)
- CRUD operations

**Recommended Model:** `models/Dentist.model.js` (Already exists but needs enhancement)
**Key Methods Needed:**
- `Dentist.findByUserId(userId)` ✅
- `Dentist.findByIdWithUser(dentistId)`
- `Dentist.idCardExistsExcept(idCard, dentistId)`
- `Dentist.licenseExistsExcept(licenseNo, dentistId)`
- `Dentist.create(dentistData)`
- `Dentist.update(dentistId, dentistData)`
- `Dentist.deleteById(dentistId)`
- `Dentist.getAvailableForDate(date, treatmentId)`
- `Dentist.getTodayAvailable()`

### 3. **Patient Operations**
- Find patient by user_id
- Get patient with user/email
- Get patient with stats (appointments, last visit)
- CRUD with transactions

**Recommended Model:** `models/Patient.model.js` (Already exists)
**Key Methods Needed:**
- `Patient.findByUserId(userId)`
- `Patient.findByIdWithUser(patientId)`
- `Patient.findByIdWithStats(patientId)`
- `Patient.getAllWithStats()`
- `Patient.createWithUser(userData, patientData)`
- `Patient.updateWithUser(patientId, userData, patientData)`
- `Patient.deleteWithRelatedRecords(patientId)`
- `Patient.getDashboardData(patientId)`

### 4. **Queue/Appointment Operations**
- Get appointments with filters
- Get appointment details with joins
- Update appointment status
- Check appointment conflicts

**Recommended Model:** `models/Queue.model.js` (Already exists)
**Key Methods Needed:**
- `Queue.findAllWithStats(dentistId)`
- `Queue.findByIdWithDetailsAndAuth(queueId, dentistId)`
- `Queue.updateAppointmentStatus(queueId, dentistId, statusData)`
- `Queue.getAppointmentsByDate(date)`
- `Queue.getNextAppointment(patientId)`
- `Queue.getRecentAppointments(patientId, limit)`
- `Queue.checkConflicts(dentistId, dateRange)`

### 5. **Available Slots Operations**
- Generate slots (stored procedure)
- Get slots with statistics
- Check availability
- Update availability

**Recommended Model:** `models/AvailableSlots.model.js` (Already exists)
**Key Methods Needed:**
- `AvailableSlots.generateSlotsForDateRange(startDate, endDate)`
- `AvailableSlots.getOverallStatistics()`
- `AvailableSlots.getStatisticsByDentist()`
- `AvailableSlots.getStatisticsByDate(days)`
- `AvailableSlots.getDentistSlotsWithDetails(dentistId, date)`
- `AvailableSlots.getAvailableForDentistAndDate(dentistId, date)`
- `AvailableSlots.slotExists(dentistId, date, startTime)`
- `AvailableSlots.createSlot(slotData)`
- `AvailableSlots.updateAvailability(slotId, isAvailable)`
- `AvailableSlots.cleanupPastSlots()`

### 6. **Dentist Schedule Operations**
- Save schedule range with transaction
- Delete schedule with validation
- Get dashboard schedule data

**Recommended Model:** `models/DentistSchedule.model.js` (Already exists)
**Key Methods Needed:**
- `DentistSchedule.getDashboardScheduleData()`
- `DentistSchedule.saveScheduleRange(dentistId, scheduleData)`
- `DentistSchedule.deleteScheduleRangeWithValidation(dentistId, startDate, endDate)`

### 7. **Notification Operations**
- Get notifications by user type with joins
- Mark as read (single/all)
- Get unread counts
- Delete notifications

**Recommended Model:** `models/Notification.model.js` (Already exists)
**Key Methods Needed:**
- `Notification.getAdminNotificationsWithPagination(limit, offset, filters)`
- `Notification.getDentistNotifications(dentistId, filters)`
- `Notification.getPatientNotifications(patientId, filters)`
- `Notification.getNotificationCounts()`
- `Notification.getUnreadCount(userType, userId)`
- `Notification.markAsRead(notificationId)`
- `Notification.markAllAsRead(userType, userId)`
- `Notification.deleteById(id)`

### 8. **Treatment Operations**
- Get all treatments
- Get treatment duration
- Get treatments for dentist

**Recommended Model:** `models/Treatment.model.js` (Already exists)
**Key Methods Needed:**
- `Treatment.getAll()`
- `Treatment.getDuration(treatmentId)`

### 9. **Dentist-Treatment Relationship**
- Get treatments offered by dentist

**Recommended Model:** `models/DentistTreatment.model.js` (Already exists)
**Key Methods Needed:**
- `DentistTreatment.getTreatmentsForDentist(dentistId)`

### 10. **Treatment History**
- Get latest treatment for patient

**Recommended Model:** `models/TreatmentHistory.model.js` (Already exists)
**Key Methods Needed:**
- `TreatmentHistory.getLatestForPatient(patientId)`

---

## Refactoring Priority

### Priority 1 - HIGH (Controllers with most SQL queries)
1. **admin.controller.js** - 5410 lines, extensive SQL
2. **patient.controller.js** - 2661 lines, many queries
3. **dentist.controller.js** - 3034 lines, partially refactored
4. **notification.controller.js** - All queries need models

### Priority 2 - MEDIUM
5. **admin.slots.controller.js** - Focused on slots management

### Priority 3 - LOW (Already Refactored) ✅
6. **register.controller.js** - Already uses RegisterModel
7. **password-reset.controller.js** - Already uses PasswordResetModel
8. **login.controller.js** - Already uses LoginModel

---

## Recommended Next Steps

1. **Create Base User Model** if not exists with common operations
2. **Enhance Existing Models** with missing methods identified above
3. **Refactor notification.controller.js** completely (clear scope, single entity)
4. **Refactor admin.slots.controller.js** (focused functionality)
5. **Refactor admin.controller.js** in sections:
   - User/Auth operations
   - Dentist CRUD operations
   - Patient CRUD operations
   - Dashboard/Schedule operations
6. **Refactor patient.controller.js** in sections:
   - Dashboard operations
   - Booking operations
   - Profile operations
7. **Complete dentist.controller.js refactoring** (finish remaining SQL queries)

---

## Code Quality Notes

### Good Practices Found:
- ✅ Some controllers already properly refactored (register, login, password-reset)
- ✅ Transaction usage in critical operations
- ✅ Parameterized queries (preventing SQL injection)
- ✅ Consistent error handling patterns
- ✅ Notification helper for centralized notification creation

### Areas for Improvement:
- ❌ Mixed refactoring state (some use models, some don't)
- ❌ Large controller files (admin: 5410 lines)
- ❌ Business logic mixed with data access
- ❌ Duplicate query patterns across controllers
- ❌ Complex nested queries in controllers

---

## Estimated Effort

### Per Controller:
- **notification.controller.js**: 2-3 days
- **admin.slots.controller.js**: 1-2 days
- **admin.controller.js**: 5-7 days (large, complex)
- **patient.controller.js**: 3-4 days
- **dentist.controller.js**: 2-3 days (complete remaining)

### Total Estimated Time: 13-19 days

---

## Model Files Status

### Already Exist (in D:\dentist\models\):
✅ AvailableSlots.model.js
✅ Dentist.model.js
✅ DentistSchedule.model.js
✅ DentistTreatment.model.js
✅ Notification.model.js
✅ Patient.model.js
✅ Queue.model.js
✅ QueueDetail.model.js
✅ Treatment.model.js
✅ TreatmentHistory.model.js
✅ User.model.js
✅ index.js (central export)

### Need to Create/Enhance:
- All models exist but need enhancement with missing methods

---

## Testing Recommendations

1. **Unit Tests** for each model method
2. **Integration Tests** for refactored controller endpoints
3. **Regression Tests** to ensure existing functionality preserved
4. **Performance Tests** for database operations

---

## Documentation Recommendations

1. Update API documentation for each refactored endpoint
2. Document model methods with JSDoc
3. Create data flow diagrams showing model relationships
4. Update developer guide with new MVC structure

---

*Report Generated: 2025*
*Analysis Version: 1.0*
*Scope: All controller files in D:\dentist\controller\*
