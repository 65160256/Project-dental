# Model Layer Documentation

## 📋 Overview

Model Layer คือ **Data Access Layer** ที่จัดการทุกอย่างเกี่ยวกับข้อมูลและฐานข้อมูล ตามหลักการ MVC Pattern ที่ถูกต้อง

## 🎯 หน้าที่ของ Model Layer

### ✅ Model ควรทำ:
1. **CRUD Operations** - สร้าง, อ่าน, อัปเดต, ลบข้อมูล
2. **Data Validation** - ตรวจสอบความถูกต้องของข้อมูล
3. **Business Logic** - กฎทางธุรกิจที่เกี่ยวข้องกับข้อมูล
4. **Data Integrity** - รักษาความสมบูรณ์ของข้อมูล
5. **Database Queries** - SQL queries, JOINs, transactions
6. **Domain Rules** - กฎเฉพาะของโดเมน (เช่น ห้ามซ้ำ, ความสัมพันธ์ของข้อมูล)

### ❌ Model ไม่ควรทำ:
1. ❌ จัดการ HTTP request/response
2. ❌ รู้จัก status code (200, 404, 500)
3. ❌ จัดการ session
4. ❌ Render views
5. ❌ จัดการ routing
6. ❌ Authentication/Authorization logic

## 📁 โครงสร้าง Models

```
models/
├── index.js                    # Central export
├── Patient.model.js            # ผู้ป่วย
├── Dentist.model.js            # ทันตแพทย์
├── User.model.js               # ผู้ใช้ระบบ
├── Queue.model.js              # คิวนัดหมาย
├── Treatment.model.js          # ประเภทการรักษา
└── TreatmentHistory.model.js  # ประวัติการรักษา
```

## 📖 Model APIs

### 1. Patient.model.js

จัดการข้อมูลผู้ป่วย

**Methods:**
- `create(patientData)` - สร้างผู้ป่วยใหม่
- `findById(patientId)` - ค้นหาด้วย ID
- `findByUserId(userId)` - ค้นหาด้วย user_id
- `findByIdCard(idCard)` - ค้นหาด้วยเลขบัตรประชาชน
- `findByPhone(phone)` - ค้นหาด้วยเบอร์โทร
- `findAll(options)` - ดึงรายการทั้งหมด (พร้อม pagination, search)
- `count(search)` - นับจำนวน
- `update(patientId, updateData)` - อัปเดตข้อมูล
- `delete(patientId)` - ลบผู้ป่วย
- `findByIdWithUser(patientId)` - ดึงข้อมูลพร้อม user

**Business Rules:**
- ✓ เลขบัตรประชาชนต้องไม่ซ้ำ
- ✓ เบอร์โทรต้องไม่ซ้ำ
- ✓ ต้องมีชื่อ, นามสกุล, เบอร์โทร
- ✓ ไม่สามารถลบผู้ป่วยที่มีประวัติการนัดหมายได้

### 2. Dentist.model.js

จัดการข้อมูลทันตแพทย์

**Methods:**
- `create(dentistData)` - สร้างทันตแพทย์ใหม่
- `findById(dentistId)` - ค้นหาด้วย ID
- `findByUserId(userId)` - ค้นหาด้วย user_id
- `findByLicenseNumber(licenseNumber)` - ค้นหาด้วยเลขใบอนุญาต
- `findAll(options)` - ดึงรายการทั้งหมด
- `count(search)` - นับจำนวน
- `update(dentistId, updateData)` - อัปเดตข้อมูล
- `delete(dentistId)` - ลบทันตแพทย์
- `findByIdWithUser(dentistId)` - ดึงข้อมูลพร้อม user
- `getStatistics(dentistId)` - ดึงสถิติ

**Business Rules:**
- ✓ เลขใบอนุญาตต้องไม่ซ้ำ
- ✓ แต่ละ user_id มีโปรไฟล์ทันตแพทย์ได้แค่ 1 โปรไฟล์
- ✓ ต้องมีชื่อ, นามสกุล
- ✓ ไม่สามารถลบทันตแพทย์ที่มีประวัติการนัดหมายได้

### 3. User.model.js

จัดการข้อมูลผู้ใช้ระบบและ authentication

**Methods:**
- `create(userData)` - สร้าง user ใหม่
- `findById(userId)` - ค้นหาด้วย ID
- `findByEmail(email)` - ค้นหาด้วยอีเมล
- `findByUsername(username)` - ค้นหาด้วย username
- `authenticate(email, password)` - ตรวจสอบการ login
- `changePassword(userId, currentPassword, newPassword)` - เปลี่ยนรหัสผ่าน
- `resetPassword(userId, newPassword)` - รีเซ็ตรหัสผ่าน
- `update(userId, updateData)` - อัปเดตข้อมูล
- `delete(userId)` - ลบ user
- `findByRole(role, options)` - ค้นหาตาม role
- `count(role)` - นับจำนวน

**Business Rules:**
- ✓ อีเมลต้องไม่ซ้ำและต้องเป็นรูปแบบที่ถูกต้อง
- ✓ Username ต้องไม่ซ้ำ (ถ้ามี)
- ✓ รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร
- ✓ รหัสผ่านถูก hash ด้วย bcrypt
- ✓ Role ต้องเป็น 1 (admin), 2 (dentist), หรือ 3 (patient)
- ✓ ไม่สามารถลบ user ที่มีโปรไฟล์ผูกอยู่ได้

### 4. Queue.model.js

จัดการคิวนัดหมาย

**Methods:**
- `create(queueData)` - สร้างคิวนัดหมายใหม่
- `checkDentistConflict(dentistId, appointmentTime, treatmentId, excludeQueueId)` - ตรวจสอบความขัดแย้งเวลา
- `findByIdWithDetails(queueId)` - ค้นหาพร้อมข้อมูลทั้งหมด
- `findById(queueId)` - ค้นหาข้อมูลพื้นฐาน
- `findByPatientId(patientId, options)` - ดึงคิวของผู้ป่วย
- `findByDentistId(dentistId, options)` - ดึงคิวของทันตแพทย์
- `findAll(options)` - ดึงคิวทั้งหมด (admin)
- `updateStatus(queueId, status)` - อัปเดตสถานะ
- `cancel(queueId)` - ยกเลิกคิว
- `count(filters)` - นับจำนวน
- `delete(queueId)` - ลบคิว

**Business Rules:**
- ✓ ต้องมีข้อมูลครบ (queuedetailId, patientId, treatmentId, dentistId, time)
- ✓ ทันตแพทย์ไม่สามารถมีนัดหมายซ้อนทับกันได้
- ✓ คำนวณเวลาสิ้นสุดตาม duration ของการรักษา
- ✓ สถานะต้องเป็น: pending, confirmed, completed, cancelled
- ✓ ไม่สามารถยกเลิกคิวที่เสร็จสิ้นแล้ว

### 5. Treatment.model.js

จัดการประเภทการรักษา

**Methods:**
- `create(treatmentData)` - สร้างการรักษาใหม่
- `findById(treatmentId)` - ค้นหาด้วย ID
- `findByName(treatmentName)` - ค้นหาด้วยชื่อ
- `findAll(options)` - ดึงรายการทั้งหมด
- `findAllActive()` - ดึงรายการที่ active
- `count(search)` - นับจำนวน
- `update(treatmentId, updateData)` - อัปเดตข้อมูล
- `delete(treatmentId)` - ลบการรักษา
- `getUsageStatistics(treatmentId)` - ดึงสถิติการใช้งาน
- `findPopular(limit)` - ดึงการรักษาที่ได้รับความนิยม

**Business Rules:**
- ✓ ชื่อการรักษาต้องไม่ซ้ำ
- ✓ ต้องมีชื่อและระยะเวลา
- ✓ ระยะเวลาต้องมากกว่า 0 นาที
- ✓ ราคาต้องไม่ติดลบ
- ✓ ไม่สามารถลบการรักษาที่มีการใช้งานในนัดหมายได้

### 6. TreatmentHistory.model.js

จัดการประวัติการรักษา

**Methods:**
- `create(historyData)` - สร้างประวัติการรักษาใหม่
- `findById(historyId)` - ค้นหาด้วย ID
- `findByQueueDetailId(queuedetailId)` - ค้นหาด้วย queuedetail_id
- `findByQueueIdWithDetails(queueId)` - ค้นหาพร้อมข้อมูลทั้งหมด
- `findByPatientId(patientId, options)` - ดึงประวัติของผู้ป่วย
- `findByDentistId(dentistId, options)` - ดึงประวัติของทันตแพทย์
- `update(queuedetailId, updateData)` - อัปเดตประวัติ
- `createOrUpdate(historyData)` - สร้างหรืออัปเดต
- `delete(historyId)` - ลบประวัติ
- `deleteByQueueDetailId(queuedetailId)` - ลบด้วย queuedetail_id
- `count(filters)` - นับจำนวน
- `getStatistics(filters)` - ดึงสถิติ

**Business Rules:**
- ✓ ต้องมี queuedetailId และ diagnosis
- ✓ diagnosis ต้องมีอย่างน้อย 20 ตัวอักษร
- ✓ แต่ละ queuedetail_id มีประวัติการรักษาได้แค่ 1 รายการ
- ✓ `createOrUpdate()` จะตรวจสอบและเลือกทำ create หรือ update อัตโนมัติ

## 🔄 วิธีใช้งาน Models

### ตัวอย่างที่ 1: สร้างผู้ป่วยใหม่ (Controller)

```javascript
const { PatientModel } = require('../models');

// ❌ แบบเดิม (SQL ใน Controller)
exports.createPatient = async (req, res) => {
  try {
    const { fname, lname, phone, id_card } = req.body;

    // SQL ยาวเยอะ validation เยอะใน controller
    const [existing] = await db.execute('SELECT * FROM patient WHERE id_card = ?', [id_card]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'ID card exists' });
    }

    const [result] = await db.execute(
      'INSERT INTO patient (fname, lname, phone, id_card) VALUES (?, ?, ?, ?)',
      [fname, lname, phone, id_card]
    );

    res.json({ success: true, patientId: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ แบบใหม่ (ใช้ Model)
exports.createPatient = async (req, res) => {
  try {
    const result = await PatientModel.create(req.body);
    res.json(result);
  } catch (error) {
    // Model จะ throw error พร้อม message ที่ชัดเจน
    res.status(400).json({ error: error.message });
  }
};
```

### ตัวอย่างที่ 2: ดึงรายการคิวนัดหมาย

```javascript
const { QueueModel } = require('../models');

// ✅ ใน Controller
exports.getDentistAppointments = async (req, res) => {
  try {
    const dentistId = req.dentist.dentist_id;
    const { date, status } = req.query;

    // Model จัดการ SQL และ business logic
    const appointments = await QueueModel.findByDentistId(dentistId, {
      date,
      status,
      limit: 50,
      offset: 0
    });

    res.json({ success: true, appointments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

### ตัวอย่างที่ 3: Authentication

```javascript
const { UserModel } = require('../models');

// ✅ ใน Controller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Model จัดการ authentication logic
    const result = await UserModel.authenticate(email, password);

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    // เก็บ session
    req.session.user = result.user;
    res.json({ success: true, user: result.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

## 🎨 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│                    (Browser / Mobile)                        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP Request
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         ROUTES                              │
│              (Routing, Middleware, Auth)                    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONTROLLERS                            │
│  • รับ HTTP request                                         │
│  • เรียกใช้ Models                                          │
│  • จัดการ response (status code, JSON)                     │
│  • จัดการ session                                           │
│  • Render views                                             │
│  ❌ ไม่มี SQL                                              │
│  ❌ ไม่มี business logic เชิงข้อมูล                        │
└────────────────────────────┬────────────────────────────────┘
                             │ เรียกใช้
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         MODELS                              │
│  • CRUD operations                                          │
│  • SQL queries, JOINs, transactions                         │
│  • Data validation                                          │
│  • Business logic เชิงข้อมูล                               │
│  • Domain rules                                             │
│  ✅ throw Error เมื่อมีปัญหา                                │
│  ✅ return ข้อมูลที่สะอาดพร้อมใช้                           │
│  ❌ ไม่รู้จัก HTTP / status code                           │
└────────────────────────────┬────────────────────────────────┘
                             │ Query
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE                              │
│                        (MySQL)                              │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Error Handling Pattern

Models ใช้ **throw Error** เมื่อเจอปัญหา Controllers จับ error และแปลงเป็น HTTP response:

```javascript
// ใน Model
static async create(patientData) {
  // Validate
  if (!fname || !lname) {
    throw new Error('กรุณากรอกชื่อและนามสกุล'); // ❌ ข้อมูลไม่ครบ
  }

  // Check duplicate
  const existing = await this.findByIdCard(id_card);
  if (existing) {
    throw new Error('เลขบัตรประชาชนนี้มีในระบบแล้ว'); // ❌ ซ้ำ
  }

  // Success
  return { patientId: 123, success: true }; // ✅ สำเร็จ
}

// ใน Controller
try {
  const result = await PatientModel.create(req.body);
  res.status(201).json(result); // ✅ 201 Created
} catch (error) {
  res.status(400).json({ error: error.message }); // ❌ 400 Bad Request
}
```

## ✅ Benefits

1. **Code Reusability** - ใช้ Model ซ้ำได้ในหลาย Controller
2. **Testability** - ทดสอบ Model แยกได้โดยไม่ต้องจำลอง HTTP
3. **Maintainability** - แก้ไข logic ที่ Model ได้ที่เดียว
4. **Separation of Concerns** - แยกหน้าที่ชัดเจน
5. **Easy to Document** - เขียน API docs ง่าย
6. **Type Safety** - เพิ่ม TypeScript ได้ง่าย
7. **Database Abstraction** - เปลี่ยน database ได้ง่าย

## 🚀 Next Steps

1. ✅ สร้าง Models ทั้งหมด (เสร็จแล้ว)
2. ⏳ Refactor Controllers ให้ใช้ Models
3. ⏳ ลบ SQL ออกจาก Controllers
4. ⏳ เพิ่ม Unit Tests สำหรับ Models
5. ⏳ เพิ่ม JSDoc comments
6. ⏳ สร้าง UML Class Diagrams

## 📝 Notes

- ทุก Model method เป็น `static` เพราะไม่ต้องการ instance
- ใช้ `async/await` ทั้งหมด
- Error messages เป็นภาษาไทยเพื่อให้ผู้ใช้เข้าใจง่าย
- ทุก Model รับ options object สำหรับ pagination และ filters
- Password ถูก hash ด้วย bcrypt (salt rounds = 10)
- ทุก Model ตรวจสอบ business rules ก่อน execute query
