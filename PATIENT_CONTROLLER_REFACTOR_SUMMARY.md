# Patient Controller Refactoring Summary

## Overview
This document summarizes the refactoring work to move SQL queries from `patient.controller.js` to appropriate model files, following MVC principles.

## Completed Work

### 1. Patient.model.js - Added Methods
Location: `D:\dentist\models\Patient.model.js`

#### New Methods Added:
1. **getDashboardData(userId)** - Lines 806-882
   - Retrieves all dashboard data in one method call
   - Includes: patient info, next appointment, appointment history, treatment history, working dentists
   - Replaces: Multiple queries in `exports.getDashboard` (lines 71-152 in controller)

2. **getProfileData(userId)** - Lines 889-941
   - Retrieves patient profile with formatted data
   - Handles gender translation and date formatting
   - Replaces: Queries in `exports.getProfile` (lines 2105-2170 in controller)

3. **updateProfileWithEmail(userId, profileData)** - Lines 949-1044
   - Updates patient profile and user email in a transaction
   - Validates email, ID card, and phone formats
   - Checks for duplicates
   - Replaces: Complex transaction in `exports.updateProfile` (lines 2232-2358 in controller)

4. **findByUserIdWithEmail(userId)** - Lines 1051-1057
   - Simple query to get patient with email
   - Used by multiple controller functions

5. **findForBooking(userId)** - Lines 1064-1066
   - Alias for findByUserIdWithEmail for semantic clarity

6. **getBasicProfile(userId)** - Lines 1073-1079
   - Returns basic profile data for API endpoints
   - Replaces: Query in `exports.getMyProfile` (lines 2499-2527 in controller)

7. **getAppointmentsWithDetails(patientId)** - Lines 1086-1117
   - Retrieves all appointments with full details
   - Includes cancellation and modification flags
   - Replaces: Query in `exports.getMyAppointments` (lines 1593-1651 in controller)

8. **getUpcomingAppointments(patientId)** - Lines 1124-1151
   - Gets only upcoming appointments
   - Includes 24-hour cancellation check
   - Replaces: Query in `exports.getMyUpcomingAppointments` (lines 837-892 in controller)

### 2. AvailableSlots.model.js - Added Methods
Location: `D:\dentist\models\AvailableSlots.model.js`

#### New Methods Added:
1. **getAvailableDentistsForBooking(date, treatmentId)** - Lines 674-725
   - Gets dentists with available slots for a specific date
   - Optionally filters by treatment
   - Replaces: Complex query in `exports.getAvailableDentistsForBooking` (lines 196-310 in controller)

2. **getAvailableTimeSlotsForBooking(date, dentistId, treatmentId)** - Lines 734-771
   - Retrieves available time slots for booking
   - Returns slots with treatment duration
   - Replaces: Query in `exports.getAvailableTimeSlots` (lines 314-430 in controller)

3. **getCalendarDataForMonth(year, month, treatmentId)** - Lines 780-864
   - Gets calendar data for monthly view
   - Groups by date with dentist availability
   - Replaces: Complex query in `exports.getCalendarData` (lines 713-834 in controller)

4. **getConsecutiveSlots(dentistId, date, startTime, requiredSlots)** - Lines 874-914
   - Finds consecutive available slots for booking
   - Validates slot continuity
   - Used in booking process

5. **markSlotsAsBooked(slotIds, treatmentId)** - Lines 922-938
   - Marks multiple slots as booked
   - Used after successful booking

6. **releaseSlotsAfterCancellation(dentistId, date, startTime, duration)** - Lines 948-968
   - Releases slots back to available state
   - Used when appointments are cancelled

## Remaining Work

### 3. Queue.model.js - Methods to Add

```javascript
/**
 * จองนัดหมายพร้อมจัดการ slots และ queuedetail
 * @param {Object} bookingData - { patientId, dentistId, treatmentId, date, startTime, note }
 * @param {Object} connection - Database connection for transaction
 * @returns {Promise<Object>} { queueId, queueDetailId, booking }
 */
static async createBookingWithSlots(bookingData, connection)

/**
 * ยกเลิกนัดหมายพร้อมตรวจสอบ 24-hour rule
 * @param {number} queueId
 * @param {number} patientId
 * @param {string} reason - optional
 * @returns {Promise<Object>} { success, appointment }
 */
static async cancelAppointmentByPatient(queueId, patientId, reason)

/**
 * ดึงรายละเอียดนัดหมายพร้อมตรวจสอบสิทธิ์ของผู้ป่วย
 * @param {number} queueId
 * @param {number} patientId
 * @returns {Promise<Object|null>}
 */
static async findByIdWithPatientAuth(queueId, patientId)

/**
 * ดึงประวัติการรักษาของผู้ป่วยตามปี
 * @param {number} patientId
 * @param {number} year - optional
 * @returns {Promise<Object>} { treatments, treatmentsByYear, availableYears }
 */
static async getTreatmentHistoryByYear(patientId, year)

/**
 * ดึงรายละเอียดประวัติการรักษาเฉพาะรายการ
 * @param {number} queueId
 * @param {number} patientId
 * @returns {Promise<Object|null>}
 */
static async getTreatmentHistoryDetails(queueId, patientId)
```

### 4. Dentist.model.js - Methods to Add

```javascript
/**
 * ดึงรายการทันตแพทย์พร้อมการรักษาที่ทำได้
 * @param {string} searchQuery - optional
 * @returns {Promise<Object>} { dentists, dentistsBySpecialty, specialties }
 */
static async getAllWithTreatments(searchQuery)

/**
 * ดึงข้อมูล Profile ทันตแพทย์สำหรับผู้ป่วยดู
 * @param {number} dentistId
 * @returns {Promise<Object|null>} { dentist, treatments, upcoming_slots }
 */
static async getPublicProfile(dentistId)

/**
 * ดึงความพร้อมของทันตแพทย์สำหรับหน้าจอง
 * @param {number} dentistId
 * @param {string} date - optional, defaults to next 3 days
 * @returns {Promise<Array>} available slots
 */
static async getAvailabilityForBooking(dentistId, date)

/**
 * ดึงรายการทันตแพทย์พร้อมจำนวน slots ที่ว่างในสัปดาห์นี้
 * @param {string} searchQuery - optional
 * @returns {Promise<Array>}
 */
static async getAllWithWeeklyAvailability(searchQuery)
```

### 5. Treatment.model.js - Methods to Add

```javascript
/**
 * ดึงรายการการรักษาทั้งหมดสำหรับ API
 * @returns {Promise<Array>}
 */
static async getAllForAPI()

/**
 * ดึงการรักษาที่ทันตแพทย์คนนี้ทำได้
 * @param {number} dentistId
 * @returns {Promise<Array>}
 */
static async findByDentistId(dentistId)
```

### 6. User.model.js - No Additional Methods Needed
The existing `changePassword()` and `updateEmail()` methods in User.model.js are sufficient.

## Controller Refactoring Guide

### Step-by-Step Process

#### Example 1: Refactoring `getDashboard`

**Before:**
```javascript
exports.getDashboard = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  try {
    // Multiple SQL queries...
    const [patientRows] = await db.execute('SELECT...');
    const [nextAppointmentRows] = await db.execute('SELECT...');
    const [appointmentsRows] = await db.execute('SELECT...');
    // ... more queries

    res.render('patient/patient-dashboard', {
      patient, nextAppointment, appointments, treatmentHistory, dentists, currentDate
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard data');
  }
};
```

**After:**
```javascript
const PatientModel = require('../models/Patient.model');

exports.getDashboard = async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  try {
    const dashboardData = await PatientModel.getDashboardData(userId);

    if (!dashboardData) {
      return res.redirect('/login');
    }

    res.render('patient/patient-dashboard', dashboardData);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching dashboard data');
  }
};
```

#### Example 2: Refactoring `getAvailableDentistsForBooking`

**Before:**
```javascript
exports.getAvailableDentistsForBooking = async (req, res) => {
  try {
    const { date, treatment_id } = req.query;
    // Validation...

    // Complex SQL query with JOINs and subqueries
    let query = `SELECT d.dentist_id, d.fname, d.lname, ...`;
    const [availableDentists] = await db.execute(query, queryParams);

    // More queries for treatments
    for (let dentist of availableDentists) {
      const [treatments] = await db.execute(...);
      dentist.treatments = treatments;
    }

    res.json({ success: true, dentists: availableDentists });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
```

**After:**
```javascript
const AvailableSlotsModel = require('../models/AvailableSlots.model');
const DentistTreatmentModel = require('../models/DentistTreatment.model');

exports.getAvailableDentistsForBooking = async (req, res) => {
  try {
    const { date, treatment_id } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกวันที่' });
    }

    // Validation logic (24-hour rule, Sunday check)...

    const availableDentists = await AvailableSlotsModel.getAvailableDentistsForBooking(
      date,
      treatment_id
    );

    // Get treatments for each dentist
    for (let dentist of availableDentists) {
      dentist.treatments = await DentistTreatmentModel.findByDentistId(dentist.dentist_id);
    }

    res.json({
      success: true,
      dentists: availableDentists,
      date: date,
      total_available: availableDentists.length
    });
  } catch (error) {
    console.error('Error in getAvailableDentistsForBooking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
```

#### Example 3: Refactoring Password Reset

**Before:**
```javascript
exports.handleForgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await db.execute(
      'SELECT * FROM user u JOIN patient p ON u.user_id = p.user_id WHERE u.email = ? AND u.role_id = 3',
      [email]
    );
    if (rows.length === 0) return res.send('Email not found...');

    // Send email logic...
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};
```

**After:**
```javascript
const UserModel = require('../models/User.model');
const PatientModel = require('../models/Patient.model');

exports.handleForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await UserModel.findByEmail(email);

    if (!user || user.role !== 3) {
      return res.send('Email not found or not a patient account.');
    }

    const patient = await PatientModel.findByUserId(user.user_id);
    if (!patient) {
      return res.send('Patient profile not found.');
    }

    // Send email logic...
    const resetToken = Math.random().toString(36).substring(2);
    // ... rest of email logic
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};
```

## Methods That Use Model Methods from Other Models

Some methods in models can call other models. For example:

```javascript
// In AvailableSlots.model.js
static async getAvailableTimeSlotsForBooking(date, dentistId, treatmentId) {
  // Get treatment duration from Treatment model
  const [treatmentData] = await db.execute(
    'SELECT duration FROM treatment WHERE treatment_id = ?',
    [treatmentId]
  );

  // This could be refactored to:
  const TreatmentModel = require('./Treatment.model');
  const treatment = await TreatmentModel.findById(treatmentId);
  const duration = treatment.duration;

  // ... rest of method
}
```

## Validation Logic Location

Keep validation logic in the controller when it involves:
- Session/authentication checks
- Business rules specific to the request (24-hour cancellation rule)
- Request parameter validation
- Date/time validation

Move validation to models when it involves:
- Database constraints (duplicate checks)
- Data format validation (email, phone, ID card)
- Referential integrity checks

## Transaction Handling

For operations that need transactions (like booking appointments):

```javascript
// In Queue.model.js
static async createBookingWithSlots(bookingData, connection) {
  // Use passed connection for all queries
  await connection.execute(`INSERT INTO queuedetail...`);
  await connection.execute(`INSERT INTO queue...`);
  await connection.execute(`UPDATE available_slots...`);
  return { queueId, queueDetailId };
}

// In controller
exports.bookAppointmentWithSchedule = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validation...

    const booking = await QueueModel.createBookingWithSlots(bookingData, connection);

    await connection.commit();
    res.json({ success: true, booking });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) connection.release();
  }
};
```

## Testing Checklist

After refactoring each controller function:

1. [ ] Test the original functionality works
2. [ ] Check error handling is preserved
3. [ ] Verify response format remains the same
4. [ ] Test edge cases (empty results, invalid inputs)
5. [ ] Ensure transactions commit/rollback correctly
6. [ ] Check that related pages/APIs still work

## Benefits of This Refactoring

1. **Separation of Concerns**: Database logic is in models, business logic in controllers
2. **Reusability**: Model methods can be used by multiple controllers
3. **Testability**: Models can be unit tested independently
4. **Maintainability**: Changes to queries only need to happen in one place
5. **Type Safety**: JSDoc comments provide better IDE support
6. **Readability**: Controllers become much more readable and focus on HTTP handling

## Next Steps

1. Complete the remaining model methods (Queue, Dentist, Treatment)
2. Refactor the controller functions one by one
3. Test each refactored function thoroughly
4. Update any related API documentation
5. Consider adding unit tests for model methods

## Files Modified

- `D:\dentist\models\Patient.model.js` - 8 new methods added
- `D:\dentist\models\AvailableSlots.model.js` - 6 new methods added
- `D:\dentist\controller\patient.controller.js` - To be refactored to use model methods

## Estimated Remaining Work

- **Queue.model.js**: ~5 new methods (2-3 hours)
- **Dentist.model.js**: ~4 new methods (2 hours)
- **Treatment.model.js**: ~2 new methods (30 minutes)
- **Controller refactoring**: ~40 functions to update (6-8 hours)
- **Testing**: 4-6 hours

**Total Estimated Time**: 15-20 hours

## Notes

- All model methods include JSDoc comments for better documentation
- Model methods throw errors that controllers should catch
- Transaction handling is done in controllers, not models (except when connection is passed)
- Keep the same error messages and response formats for API compatibility
- The patient.controller.js file is ~2,660 lines; after refactoring it should be around 1,500-1,800 lines
