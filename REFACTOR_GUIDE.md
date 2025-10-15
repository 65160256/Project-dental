# 📘 Refactoring Guide: จาก Controller เดิมเป็น MVC Pattern

## 🎯 เป้าหมาย

แยก **Data Access Logic** และ **Business Logic เชิงข้อมูล** ออกจาก Controller ไปยัง Model เพื่อให้:
- Controller จัดการแค่ HTTP request/response
- Model จัดการ database และ business rules
- โค้ดอ่านง่าย ทดสอบง่าย บำรุงรักษาง่าย

## 🔍 ตัวอย่างการ Refactor

### ตัวอย่างที่ 1: Get Patient List

#### ❌ BEFORE (แบบเดิม - SQL ใน Controller)

```javascript
// controller/admin.controller.js
exports.getPatients = async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let query = `
      SELECT
        p.*,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM patient p
    `;

    const params = [];

    if (search) {
      query += ` WHERE
        p.fname LIKE ? OR
        p.lname LIKE ? OR
        p.phone LIKE ? OR
        p.id_card LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY p.patient_id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [patients] = await db.execute(query, params);

    // Count total
    let countQuery = `SELECT COUNT(*) as total FROM patient`;
    const countParams = [];

    if (search) {
      countQuery += ` WHERE
        fname LIKE ? OR
        lname LIKE ? OR
        phone LIKE ? OR
        id_card LIKE ?
      `;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const [countResult] = await db.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      success: true,
      patients,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
```

#### ✅ AFTER (ใช้ Model)

```javascript
// controller/admin.controller.js
const { PatientModel } = require('../models');

exports.getPatients = async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      search: req.query.search || ''
    };

    // Model จัดการ SQL ทั้งหมด
    const patients = await PatientModel.findAll(options);
    const total = await PatientModel.count(options.search);

    res.json({
      success: true,
      patients,
      total,
      limit: options.limit,
      offset: options.offset
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
};
```

---

### ตัวอย่างที่ 2: Create Patient

#### ❌ BEFORE (แบบเดิม)

```javascript
exports.createPatient = async (req, res) => {
  try {
    const { fname, lname, dob, gender, phone, address, id_card, chronic_disease, allergy_history } = req.body;

    // Validation
    if (!fname || !lname || !phone) {
      return res.status(400).json({
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
      });
    }

    // Check duplicate ID card
    if (id_card) {
      const [existingIdCard] = await db.execute(
        'SELECT * FROM patient WHERE id_card = ?',
        [id_card]
      );
      if (existingIdCard.length > 0) {
        return res.status(400).json({
          error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว'
        });
      }
    }

    // Check duplicate phone
    const [existingPhone] = await db.execute(
      'SELECT * FROM patient WHERE phone = ?',
      [phone]
    );
    if (existingPhone.length > 0) {
      return res.status(400).json({
        error: 'เบอร์โทรศัพท์นี้มีในระบบแล้ว'
      });
    }

    // Insert
    const [result] = await db.execute(
      `INSERT INTO patient
       (fname, lname, dob, gender, phone, address, id_card, chronic_disease, allergy_history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fname, lname, dob || null, gender || null, phone, address || null,
       id_card || null, chronic_disease || null, allergy_history || null]
    );

    res.status(201).json({
      success: true,
      patientId: result.insertId,
      message: 'สร้างข้อมูลผู้ป่วยสำเร็จ'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
```

#### ✅ AFTER (ใช้ Model)

```javascript
const { PatientModel } = require('../models');

exports.createPatient = async (req, res) => {
  try {
    // Model จัดการ validation และ business rules ทั้งหมด
    const result = await PatientModel.create(req.body);

    res.status(201).json({
      success: true,
      patientId: result.patientId,
      message: 'สร้างข้อมูลผู้ป่วยสำเร็จ'
    });
  } catch (error) {
    console.error('Error:', error);
    // Model throw error ที่มี message ชัดเจน
    res.status(400).json({ error: error.message });
  }
};
```

---

### ตัวอย่างที่ 3: Get Treatment History

#### ❌ BEFORE (แบบเดิม)

```javascript
exports.getTreatmentHistoryDetail = async (req, res) => {
  try {
    const userId = req.session.user?.user_id;
    const queueId = req.params.queueId;

    // Get dentist
    const [dentistResult] = await db.execute(
      'SELECT dentist_id FROM dentist WHERE user_id = ?',
      [userId]
    );

    if (dentistResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลทันตแพทย์'
      });
    }

    const dentistId = dentistResult[0].dentist_id;

    // Get treatment history with complex JOIN
    const [treatmentResult] = await db.execute(`
      SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.followUpdate,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        t.treatment_name,
        t.duration,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.dentist_id = ?
    `, [queueId, dentistId]);

    if (treatmentResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลประวัติการรักษา'
      });
    }

    const treatment = treatmentResult[0];

    res.json({
      success: true,
      treatment: {
        ...treatment,
        queue_status: treatment.queue_status === 'confirm' ? 'completed' : treatment.queue_status
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
};
```

#### ✅ AFTER (ใช้ Model)

```javascript
const { DentistModel, TreatmentHistoryModel } = require('../models');

exports.getTreatmentHistoryDetail = async (req, res) => {
  try {
    const userId = req.session.user?.user_id;
    const queueId = req.params.queueId;

    // ใช้ Model ค้นหาทันตแพทย์
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

    // ตรวจสอบสิทธิ์
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
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
};
```

---

### ตัวอย่างที่ 4: Save Treatment History

#### ❌ BEFORE (แบบเดิม)

```javascript
exports.saveAddHistory = async (req, res) => {
  try {
    const { queueId, diagnosis, followUpRecommendation } = req.body;

    // Validation
    if (!diagnosis || !diagnosis.trim()) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลการรักษา'
      });
    }

    if (diagnosis.trim().length < 20) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกรายละเอียดการรักษาอย่างน้อย 20 ตัวอักษร'
      });
    }

    // Get queue info
    const [queueResult] = await db.execute(
      'SELECT * FROM queue WHERE queue_id = ?',
      [queueId]
    );

    if (queueResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลคิว'
      });
    }

    const queue = queueResult[0];
    const queuedetailId = queue.queuedetail_id;

    // Check if history exists
    const [existingHistory] = await db.execute(
      'SELECT * FROM treatmentHistory WHERE queuedetail_id = ?',
      [queuedetailId]
    );

    if (existingHistory.length > 0) {
      // Update
      await db.execute(
        `UPDATE treatmentHistory
         SET diagnosis = ?, followUpdate = ?
         WHERE queuedetail_id = ?`,
        [diagnosis.trim(), followUpRecommendation.trim(), queuedetailId]
      );
    } else {
      // Insert
      await db.execute(
        `INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
         VALUES (?, ?, ?)`,
        [queuedetailId, diagnosis.trim(), followUpRecommendation.trim()]
      );
    }

    // Update queue status
    await db.execute(
      'UPDATE queue SET queue_status = ? WHERE queue_id = ?',
      ['completed', queueId]
    );

    res.json({
      success: true,
      queueId,
      message: 'บันทึกประวัติการรักษาสำเร็จ'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาด'
    });
  }
};
```

#### ✅ AFTER (ใช้ Model)

```javascript
const { QueueModel, TreatmentHistoryModel } = require('../models');

exports.saveAddHistory = async (req, res) => {
  try {
    const { queueId, diagnosis, followUpRecommendation } = req.body;

    // ดึงข้อมูล queue
    const queue = await QueueModel.findById(queueId);
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบข้อมูลคิว'
      });
    }

    // Model จัดการ validation และเลือก create/update อัตโนมัติ
    const historyResult = await TreatmentHistoryModel.createOrUpdate({
      queuedetailId: queue.queuedetail_id,
      diagnosis,
      followUpdate: followUpRecommendation || ''
    });

    // อัปเดตสถานะคิว
    await QueueModel.updateStatus(queueId, 'completed');

    res.json({
      success: true,
      queueId,
      action: historyResult.action, // 'created' หรือ 'updated'
      message: 'บันทึกประวัติการรักษาสำเร็จ'
    });

  } catch (error) {
    console.error('Error:', error);
    // Model throw error message ที่ชัดเจน
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
```

---

## 📋 Checklist สำหรับการ Refactor

เมื่อ refactor Controller แต่ละตัว ให้ตรวจสอบ:

### ✅ Controller ควรมี:
- [ ] การรับ HTTP request (req, res)
- [ ] การเรียกใช้ Model methods
- [ ] การจัดการ HTTP status codes (200, 201, 400, 404, 500)
- [ ] การจัดการ session
- [ ] การ render views
- [ ] try-catch blocks สำหรับ error handling
- [ ] การส่ง JSON response

### ❌ Controller ไม่ควรมี:
- [ ] SQL queries โดยตรง (`db.execute`, `db.query`)
- [ ] Business logic เชิงข้อมูล (validation, duplicate check)
- [ ] Complex data transformations
- [ ] Database transactions
- [ ] Password hashing

### ✅ Model ควรมี:
- [ ] Static methods สำหรับ CRUD
- [ ] SQL queries, JOINs
- [ ] Data validation
- [ ] Business rules
- [ ] Error throwing with clear messages
- [ ] JSDoc comments

### ❌ Model ไม่ควรมี:
- [ ] req, res objects
- [ ] HTTP status codes
- [ ] Session management
- [ ] View rendering logic

---

## 🎯 ลำดับการ Refactor แนะนำ

1. **Models (เสร็จแล้ว ✅)**
   - Patient.model.js
   - Dentist.model.js
   - User.model.js
   - Queue.model.js
   - Treatment.model.js
   - TreatmentHistory.model.js

2. **Authentication Controllers (ขั้นต่อไป)**
   - login.controller.js
   - register.controller.js
   - auth.controller.js

3. **Main Controllers**
   - patient.controller.js (ใหญ่ที่สุด)
   - dentist.controller.js (ใหญ่รอง)
   - admin.controller.js (มาก SQL)

4. **Specialized Controllers**
   - notification.controller.js
   - password-reset.controller.js

---

## 🚀 Benefits After Refactoring

1. **Controller สั้นลง** - จาก 200+ บรรทัด เหลือ 50 บรรทัด
2. **ทดสอบง่าย** - Test Model แยกจาก HTTP
3. **Reusable** - ใช้ Model ซ้ำในหลาย Controller
4. **Maintainable** - แก้ SQL ที่ Model ที่เดียว
5. **Type-safe** - พร้อมเพิ่ม TypeScript
6. **Documentation** - JSDoc + README ชัดเจน
7. **Diagram-ready** - เขียน UML ได้ง่าย

---

## 📝 Next Steps

1. เริ่ม refactor controllers ทีละไฟล์
2. ทดสอบหลังจาก refactor แต่ละไฟล์
3. Commit changes เป็นขั้นเป็นตอน
4. เขียน tests สำหรับ Models
5. สร้าง UML diagrams

คุณพร้อมที่จะเริ่ม refactor controllers แล้วหรือยัง? 🎉
