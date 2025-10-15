# Sequence Diagram Flows - Dentist Clinic System

## 1. 📅 Book Appointment Flow (Priority 1)

### Overview
Flow สำหรับ Admin จองนัดหมายให้ผู้ป่วย รวมถึงการตรวจสอบ slots และการสร้าง queue

### Actors
- **Admin**: ผู้ดูแลระบบที่ทำการจอง
- **System**: Backend Controller + Model
- **Database**: MySQL

### Sequence Flow

```
Admin → Controller: POST /admin/book-appointment
                   { patient_id, dentist_id, treatment_id, date, start_time }

Controller → Validator: Validate input data
Controller → Validator: Check if Sunday (clinic closed)

Controller → Treatment.model: getTreatmentById(treatment_id)
Treatment.model → DB: SELECT duration FROM treatment WHERE treatment_id = ?
DB → Treatment.model: Return treatment data
Treatment.model → Controller: { duration: 60 }

Controller → Controller: Calculate required slots (duration / 30)

Controller → DB: BEGIN TRANSACTION

Controller → AvailableSlots.model: getAvailableSlots(dentist_id, date, start_time)
AvailableSlots.model → DB: SELECT slot_id, start_time, end_time
                            FROM available_slots
                            WHERE dentist_id = ? AND date = ?
                            AND start_time >= ? AND is_available = 1
DB → AvailableSlots.model: Return slots array
AvailableSlots.model → Controller: slots[]

Controller → Queue.model: checkExistingBookings(dentist_id, date, slots)
Queue.model → DB: SELECT queue_id FROM queue
                  WHERE dentist_id = ? AND time = ?
                  AND queue_status IN ('pending', 'confirm')
DB → Queue.model: Return bookings
Queue.model → Controller: existingBookings[]

Controller → Controller: Filter available slots (remove booked)
Controller → Controller: Validate slots continuity
Controller → Controller: Check if enough slots available

alt: Slots not available
    Controller → Admin: 400 Error "ช่วงเวลานี้ไม่เพียงพอ"
    Controller → DB: ROLLBACK
end

Controller → QueueDetail.model: createQueueDetail(patient_id, treatment_id, dentist_id, date)
QueueDetail.model → DB: INSERT INTO queuedetail
                        (patient_id, treatment_id, dentist_id, date, created_at)
DB → QueueDetail.model: Return insertId
QueueDetail.model → Controller: queuedetail_id

Controller → Queue.model: createQueue(queuedetail_id, patient_id, treatment_id,
                                      dentist_id, datetime, 'confirm')
Queue.model → DB: INSERT INTO queue
                  (queuedetail_id, patient_id, treatment_id, dentist_id,
                   time, queue_status)
DB → Queue.model: Return insertId (queue_id)
Queue.model → Controller: queue_id

Controller → AvailableSlots.model: updateSlotsAsBooked(slots[], treatment_id)
AvailableSlots.model → DB: UPDATE available_slots
                            SET treatment_id = ?, is_available = 0
                            WHERE slot_id IN (?)
DB → AvailableSlots.model: Success

Controller → Queue.model: getBookingDetails(queue_id)
Queue.model → DB: SELECT q.*, p.fname, p.lname, d.fname, d.lname, t.treatment_name
                  FROM queue q
                  JOIN patient p ON q.patient_id = p.patient_id
                  JOIN dentist d ON q.dentist_id = d.dentist_id
                  JOIN treatment t ON q.treatment_id = t.treatment_id
                  WHERE q.queue_id = ?
DB → Queue.model: Return booking details
Queue.model → Controller: bookingDetails{}

Controller → Notification.model: createAppointmentNotification(dentist_id,
                                                                patient_id,
                                                                bookingDetails)
Notification.model → DB: INSERT INTO notifications (for dentist)
Notification.model → DB: INSERT INTO notifications (for patient)

Controller → DB: COMMIT

Controller → Admin: 200 Success { queue_id, booking_details, message }
```

---

## 2. 🔄 Update Appointment Status Flow

### Overview
Flow สำหรับการเปลี่ยนสถานะนัดหมาย (pending → confirm → completed หรือ cancel)

### Sequence Flow

```
Admin/Dentist → Controller: PUT /admin/appointment/:id/status
                           { status: 'completed' | 'cancel' | 'confirm' }

Controller → Queue.model: getQueueById(queue_id)
Queue.model → DB: SELECT * FROM queue WHERE queue_id = ?
DB → Queue.model: Return queue data
Queue.model → Controller: queueData

Controller → Controller: Validate status transition

Controller → DB: BEGIN TRANSACTION

Controller → Queue.model: updateStatus(queue_id, new_status)
Queue.model → DB: UPDATE queue SET queue_status = ? WHERE queue_id = ?

alt: Status = 'cancel'
    Controller → AvailableSlots.model: releaseSlots(dentist_id, date, time)
    AvailableSlots.model → DB: UPDATE available_slots
                                SET is_available = 1, treatment_id = NULL
                                WHERE dentist_id = ? AND date = ? AND start_time = ?
end

Controller → Notification.model: createStatusChangeNotification(queue_id, new_status)
Notification.model → DB: INSERT INTO notifications

Controller → DB: COMMIT

Controller → User: 200 Success { message: 'อัพเดทสถานะสำเร็จ' }
```

---

## 3. 📝 Complete Treatment & Record History Flow

### Overview
Flow การบันทึกประวัติการรักษาเมื่อจบการนัดหมาย

### Sequence Flow

```
Dentist → Controller: POST /dentist/complete-treatment
                     { queue_id, note, prescribed_medication }

Controller → Queue.model: getQueueById(queue_id)
Queue.model → DB: SELECT * FROM queue WHERE queue_id = ?

Controller → Controller: Verify queue belongs to dentist
Controller → Controller: Verify queue status = 'confirm'

Controller → DB: BEGIN TRANSACTION

Controller → Queue.model: updateStatus(queue_id, 'completed')

Controller → TreatmentHistory.model: create({
                                        queue_id,
                                        patient_id,
                                        dentist_id,
                                        treatment_id,
                                        treatment_date,
                                        note,
                                        prescribed_medication
                                      })
TreatmentHistory.model → DB: INSERT INTO treatment_history

Controller → Notification.model: createCompletionNotification(patient_id, treatment_name)

Controller → DB: COMMIT

Controller → Dentist: 200 Success { message: 'บันทึกการรักษาสำเร็จ' }
```

---

## 4. 👤 Patient Registration Flow

### Overview
Flow การลงทะเบียนผู้ป่วยใหม่

### Sequence Flow

```
Admin → Controller: POST /admin/patient/add
                   { id_card, email, password, fname, lname, phone, address }

Controller → Patient.model: checkEmailExists(email)
Patient.model → DB: SELECT user_id FROM users WHERE username = ?

alt: Email exists
    Controller → Admin: 400 Error "อีเมลนี้ถูกใช้แล้ว"
end

Controller → Patient.model: checkIdCardExists(id_card)
Patient.model → DB: SELECT patient_id FROM patient WHERE id_card = ?

alt: ID Card exists
    Controller → Admin: 400 Error "เลขบัตรประชาชนซ้ำ"
end

Controller → DB: BEGIN TRANSACTION

Controller → User.model: create({ username: email, password, role: 'patient' })
User.model → DB: INSERT INTO users (username, password, role)
DB → User.model: Return user_id

Controller → Patient.model: create({
                                user_id,
                                id_card,
                                fname,
                                lname,
                                phone,
                                address
                              })
Patient.model → DB: INSERT INTO patient (...)
DB → Patient.model: Return patient_id

Controller → DB: COMMIT

Controller → Admin: 200 Success { patient_id, message: 'เพิ่มผู้ป่วยสำเร็จ' }
```

---

## 5. 👨‍⚕️ Dentist Registration Flow

### Overview
Flow การลงทะเบียนทันตแพทย์ พร้อมข้อมูล specialties และ schedule

### Sequence Flow

```
Admin → Controller: POST /admin/dentist/add
                   {
                     email, password, fname, lname,
                     license_no, specialty,
                     treatment_ids[],
                     schedule: { monday: {...}, tuesday: {...}, ... }
                   }

Controller → Dentist.model: checkLicenseExists(license_no)
Controller → User.model: checkEmailExists(email)

alt: Duplicate found
    Controller → Admin: 400 Error
end

Controller → DB: BEGIN TRANSACTION

Controller → User.model: create({ username: email, password, role: 'dentist' })
User.model → DB: INSERT INTO users
DB → User.model: user_id

Controller → Dentist.model: create({ user_id, license_no, fname, lname, specialty })
Dentist.model → DB: INSERT INTO dentist
DB → Dentist.model: dentist_id

Controller → DentistTreatment.model: assignTreatments(dentist_id, treatment_ids[])
DentistTreatment.model → DB: INSERT INTO dentist_treatments (multiple)

Controller → DentistSchedule.model: createSchedule(dentist_id, schedule)
DentistSchedule.model → DB: INSERT INTO dentist_schedules (7 rows for each day)

Controller → AvailableSlots.model: generateInitialSlots(dentist_id, schedule)
AvailableSlots.model → DB: INSERT INTO available_slots (bulk)

Controller → DB: COMMIT

Controller → Admin: 200 Success { dentist_id }
```

---

## 6. 📊 Dashboard Statistics Flow

### Overview
Flow การดึงสถิติสำหรับแสดงใน Dashboard

### Sequence Flow

```
Admin → Controller: GET /admin/dashboard

Controller → Queue.model: getTodayAppointmentsCount()
Queue.model → DB: SELECT COUNT(*) FROM queue WHERE DATE(time) = CURDATE()

Controller → Queue.model: getPendingAppointmentsCount()
Queue.model → DB: SELECT COUNT(*) FROM queue WHERE queue_status = 'pending'

Controller → Dentist.model: getTotalCount()
Dentist.model → DB: SELECT COUNT(*) FROM dentist

Controller → Patient.model: getTotalCount()
Patient.model → DB: SELECT COUNT(*) FROM patient

Controller → Treatment.model: getTotalCount()
Treatment.model → DB: SELECT COUNT(*) FROM treatment

Controller → Queue.model: getMonthlyRevenue()
Queue.model → DB: SELECT SUM(t.price) FROM queue q
                  JOIN treatment t ON q.treatment_id = t.treatment_id
                  WHERE MONTH(q.time) = MONTH(CURDATE())
                  AND q.queue_status = 'completed'

Controller → AvailableSlots.model: getSlotsUtilization()
AvailableSlots.model → DB: SELECT
                            COUNT(CASE WHEN is_available = 0 THEN 1 END) as used,
                            COUNT(*) as total
                            FROM available_slots
                            WHERE date >= CURDATE()

Controller → Admin: 200 Success {
                      today_appointments,
                      pending_appointments,
                      total_dentists,
                      total_patients,
                      total_treatments,
                      monthly_revenue,
                      slots_utilization
                    }
```

---

## 7. 🔍 Get Available Dentists & Slots Flow

### Overview
Flow สำหรับค้นหาทันตแพทย์และช่วงเวลาที่ว่าง (ใช้ตอนจอง)

### Sequence Flow

```
Admin → Controller: GET /admin/available-dentists?treatment_id=1&date=2025-10-15

Controller → DentistTreatment.model: getDentistsByTreatment(treatment_id)
DentistTreatment.model → DB: SELECT d.* FROM dentist d
                              JOIN dentist_treatments dt ON d.dentist_id = dt.dentist_id
                              WHERE dt.treatment_id = ?

Controller → Dentist.model: enrichWithSchedule(dentists[], date)
Dentist.model → DB: SELECT * FROM dentist_schedules
                    WHERE dentist_id IN (?) AND day_of_week = ?

loop: For each dentist
    Controller → AvailableSlots.model: getAvailableSlots(dentist_id, date)
    AvailableSlots.model → DB: SELECT * FROM available_slots
                                WHERE dentist_id = ? AND date = ?
                                AND is_available = 1
end

Controller → Admin: 200 Success {
                      dentists: [
                        {
                          dentist_id,
                          name,
                          specialty,
                          available_slots: [...]
                        },
                        ...
                      ]
                    }
```

---

## SQL Queries Summary per Flow

### Flow 1: Book Appointment
- **Reads**: 5 queries (treatment, slots, existing bookings, booking details)
- **Writes**: 4 queries (queuedetail INSERT, queue INSERT, slots UPDATE, notifications INSERT)
- **Transaction**: YES (Critical)

### Flow 2: Update Status
- **Reads**: 1 query (queue data)
- **Writes**: 2-3 queries (queue UPDATE, optional slots UPDATE, notification INSERT)
- **Transaction**: YES

### Flow 3: Complete Treatment
- **Reads**: 1 query (queue data)
- **Writes**: 3 queries (queue UPDATE, treatment_history INSERT, notification INSERT)
- **Transaction**: YES

### Flow 4: Patient Registration
- **Reads**: 2 queries (email check, id_card check)
- **Writes**: 2 queries (users INSERT, patient INSERT)
- **Transaction**: YES

### Flow 5: Dentist Registration
- **Reads**: 2 queries (license check, email check)
- **Writes**: 4+ queries (users, dentist, dentist_treatments, dentist_schedules, available_slots)
- **Transaction**: YES

### Flow 6: Dashboard
- **Reads**: 7+ queries (various COUNT and SUM)
- **Writes**: 0
- **Transaction**: NO

### Flow 7: Available Dentists
- **Reads**: 3+ queries (dentists, schedules, slots)
- **Writes**: 0
- **Transaction**: NO

---

## Models to Create (Priority Order)

### ✅ Already Created
1. User.model.js
2. Patient.model.js
3. Dentist.model.js
4. Treatment.model.js
5. TreatmentHistory.model.js
6. AvailableSlots.model.js
7. DentistSchedule.model.js
8. DentistTreatment.model.js
9. Notification.model.js

### ⚠️ Need to Create
1. **Queue.model.js** (HIGH PRIORITY)
   - createQueue()
   - getQueueById()
   - updateStatus()
   - checkExistingBookings()
   - getBookingDetails()
   - getTodayAppointmentsCount()
   - getPendingAppointmentsCount()
   - getMonthlyRevenue()

2. **QueueDetail.model.js** (HIGH PRIORITY)
   - createQueueDetail()
   - getByQueueId()

---

## Next Action Items

1. ✅ วิเคราะห์และจัดทำ sequence diagrams
2. 🔨 สร้าง Queue.model.js และ QueueDetail.model.js
3. 🔨 Refactor `bookAppointmentForPatient` ใน admin.controller.js
4. 🔨 Refactor `updateAppointmentStatus`
5. ✅ Test และ validate

---

Generated: 2025-10-14
For: Sequence Diagram Planning & SQL Extraction
