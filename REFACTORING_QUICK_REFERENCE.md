# SQL to Model Refactoring - Quick Reference Guide

## Quick Start

This guide helps you quickly refactor SQL queries from controllers to models.

---

## Before & After Examples

### Example 1: Simple SELECT

**BEFORE (Controller):**
```javascript
// ❌ Direct SQL in controller
exports.getDentist = async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM dentist WHERE dentist_id = ?',
    [req.params.id]
  );
  res.json({ dentist: rows[0] });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller uses model
const { Dentist } = require('../models');

exports.getDentist = async (req, res) => {
  const dentist = await Dentist.findById(req.params.id);
  res.json({ dentist });
};

// ✅ Model (models/Dentist.model.js)
static async findById(dentistId) {
  const [rows] = await db.execute(
    'SELECT * FROM dentist WHERE dentist_id = ?',
    [dentistId]
  );
  return rows[0] || null;
}
```

---

### Example 2: SELECT with JOIN

**BEFORE (Controller):**
```javascript
// ❌ Complex query in controller
exports.getDentistWithUser = async (req, res) => {
  const [rows] = await db.execute(`
    SELECT d.*, u.email, u.username
    FROM dentist d
    JOIN user u ON d.user_id = u.user_id
    WHERE d.dentist_id = ?
  `, [req.params.id]);

  res.json({ dentist: rows[0] });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Dentist } = require('../models');

exports.getDentistWithUser = async (req, res) => {
  const dentist = await Dentist.findByIdWithUser(req.params.id);
  res.json({ dentist });
};

// ✅ Model
static async findByIdWithUser(dentistId) {
  const [rows] = await db.execute(`
    SELECT d.*, u.email, u.username
    FROM dentist d
    JOIN user u ON d.user_id = u.user_id
    WHERE d.dentist_id = ?
  `, [dentistId]);

  return rows[0] || null;
}
```

---

### Example 3: INSERT

**BEFORE (Controller):**
```javascript
// ❌ Insert in controller
exports.createDentist = async (req, res) => {
  const { fname, lname, specialty, user_id } = req.body;

  const [result] = await db.execute(`
    INSERT INTO dentist (fname, lname, specialty, user_id)
    VALUES (?, ?, ?, ?)
  `, [fname, lname, specialty, user_id]);

  res.json({ dentist_id: result.insertId });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Dentist } = require('../models');

exports.createDentist = async (req, res) => {
  const dentist = await Dentist.create(req.body);
  res.json({ dentist_id: dentist.dentist_id });
};

// ✅ Model
static async create(dentistData) {
  const { fname, lname, specialty, user_id } = dentistData;

  const [result] = await db.execute(`
    INSERT INTO dentist (fname, lname, specialty, user_id)
    VALUES (?, ?, ?, ?)
  `, [fname, lname, specialty, user_id]);

  return { dentist_id: result.insertId };
}
```

---

### Example 4: UPDATE

**BEFORE (Controller):**
```javascript
// ❌ Update in controller
exports.updateDentist = async (req, res) => {
  const { id } = req.params;
  const { fname, lname, specialty } = req.body;

  await db.execute(`
    UPDATE dentist
    SET fname = ?, lname = ?, specialty = ?
    WHERE dentist_id = ?
  `, [fname, lname, specialty, id]);

  res.json({ success: true });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Dentist } = require('../models');

exports.updateDentist = async (req, res) => {
  await Dentist.update(req.params.id, req.body);
  res.json({ success: true });
};

// ✅ Model
static async update(dentistId, dentistData) {
  const { fname, lname, specialty } = dentistData;

  const [result] = await db.execute(`
    UPDATE dentist
    SET fname = ?, lname = ?, specialty = ?
    WHERE dentist_id = ?
  `, [fname, lname, specialty, dentistId]);

  if (result.affectedRows === 0) {
    throw new Error('Dentist not found');
  }

  return result;
}
```

---

### Example 5: DELETE

**BEFORE (Controller):**
```javascript
// ❌ Delete in controller
exports.deleteDentist = async (req, res) => {
  await db.execute(
    'DELETE FROM dentist WHERE dentist_id = ?',
    [req.params.id]
  );
  res.json({ success: true });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Dentist } = require('../models');

exports.deleteDentist = async (req, res) => {
  await Dentist.deleteById(req.params.id);
  res.json({ success: true });
};

// ✅ Model
static async deleteById(dentistId) {
  const [result] = await db.execute(
    'DELETE FROM dentist WHERE dentist_id = ?',
    [dentistId]
  );

  if (result.affectedRows === 0) {
    throw new Error('Dentist not found');
  }

  return result;
}
```

---

### Example 6: Transaction

**BEFORE (Controller):**
```javascript
// ❌ Transaction in controller
exports.createPatientWithUser = async (req, res) => {
  await db.query('START TRANSACTION');

  try {
    // Create user
    const [userResult] = await db.execute(
      'INSERT INTO user (email, password, role_id) VALUES (?, ?, 3)',
      [req.body.email, hashedPassword]
    );

    // Create patient
    const [patientResult] = await db.execute(
      'INSERT INTO patient (user_id, fname, lname) VALUES (?, ?, ?)',
      [userResult.insertId, req.body.fname, req.body.lname]
    );

    await db.query('COMMIT');
    res.json({ patient_id: patientResult.insertId });
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Patient } = require('../models');

exports.createPatientWithUser = async (req, res) => {
  const { email, password, fname, lname } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const patient = await Patient.createWithUser(
    { email, password: hashedPassword },
    { fname, lname }
  );

  res.json({ patient_id: patient.patient_id });
};

// ✅ Model
static async createWithUser(userData, patientData) {
  await db.query('START TRANSACTION');

  try {
    // Create user
    const [userResult] = await db.execute(
      'INSERT INTO user (email, password, role_id) VALUES (?, ?, 3)',
      [userData.email, userData.password]
    );

    // Create patient
    const [patientResult] = await db.execute(
      'INSERT INTO patient (user_id, fname, lname) VALUES (?, ?, ?)',
      [userResult.insertId, patientData.fname, patientData.lname]
    );

    await db.query('COMMIT');
    return { patient_id: patientResult.insertId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
```

---

### Example 7: Pagination & Filtering

**BEFORE (Controller):**
```javascript
// ❌ Complex query with pagination in controller
exports.getNotifications = async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const unread_only = req.query.unread_only === 'true';

  let whereClause = '1=1';
  let params = [];

  if (unread_only) {
    whereClause += ' AND is_read = 0';
  }

  params.push(limit, offset);

  const [notifications] = await db.query(`
    SELECT n.*, p.fname, p.lname
    FROM notifications n
    LEFT JOIN patient p ON n.patient_id = p.patient_id
    WHERE ${whereClause}
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `, params);

  res.json({ notifications });
};
```

**AFTER (Controller + Model):**
```javascript
// ✅ Controller
const { Notification } = require('../models');

exports.getNotifications = async (req, res) => {
  const filters = {
    limit: parseInt(req.query.limit) || 20,
    offset: parseInt(req.query.offset) || 0,
    unread_only: req.query.unread_only === 'true'
  };

  const notifications = await Notification.getWithPagination(filters);
  res.json({ notifications });
};

// ✅ Model
static async getWithPagination(filters) {
  const { limit, offset, unread_only } = filters;

  let whereClause = '1=1';
  let params = [];

  if (unread_only) {
    whereClause += ' AND is_read = 0';
  }

  params.push(limit, offset);

  const [notifications] = await db.query(`
    SELECT n.*, p.fname, p.lname
    FROM notifications n
    LEFT JOIN patient p ON n.patient_id = p.patient_id
    WHERE ${whereClause}
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `, params);

  return notifications;
}
```

---

## Common Model Patterns

### Pattern 1: Find by ID
```javascript
static async findById(id) {
  const [rows] = await db.execute(
    'SELECT * FROM table_name WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}
```

### Pattern 2: Find All
```javascript
static async findAll() {
  const [rows] = await db.execute('SELECT * FROM table_name ORDER BY id');
  return rows;
}
```

### Pattern 3: Find with Condition
```javascript
static async findByUserId(userId) {
  const [rows] = await db.execute(
    'SELECT * FROM table_name WHERE user_id = ?',
    [userId]
  );
  return rows[0] || null;
}
```

### Pattern 4: Create
```javascript
static async create(data) {
  const [result] = await db.execute(
    'INSERT INTO table_name (field1, field2) VALUES (?, ?)',
    [data.field1, data.field2]
  );
  return { id: result.insertId, ...data };
}
```

### Pattern 5: Update
```javascript
static async update(id, data) {
  const [result] = await db.execute(
    'UPDATE table_name SET field1 = ?, field2 = ? WHERE id = ?',
    [data.field1, data.field2, id]
  );

  if (result.affectedRows === 0) {
    throw new Error('Record not found');
  }

  return result;
}
```

### Pattern 6: Delete
```javascript
static async deleteById(id) {
  const [result] = await db.execute(
    'DELETE FROM table_name WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    throw new Error('Record not found');
  }

  return result;
}
```

### Pattern 7: Check Exists
```javascript
static async exists(field, value) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) as count FROM table_name WHERE field = ?',
    [value]
  );
  return rows[0].count > 0;
}
```

### Pattern 8: Count
```javascript
static async getCount(condition = {}) {
  let query = 'SELECT COUNT(*) as count FROM table_name';
  const params = [];

  if (condition.field) {
    query += ' WHERE field = ?';
    params.push(condition.value);
  }

  const [rows] = await db.execute(query, params);
  return rows[0].count;
}
```

---

## Model File Template

```javascript
// models/ModelName.model.js
const db = require('../config/db');

class ModelName {
  /**
   * Find record by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM table_name WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find all records
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM table_name');
    return rows;
  }

  /**
   * Create new record
   * @param {Object} data - Record data
   * @returns {Promise<Object>}
   */
  static async create(data) {
    const [result] = await db.execute(
      'INSERT INTO table_name (field1, field2) VALUES (?, ?)',
      [data.field1, data.field2]
    );
    return { id: result.insertId, ...data };
  }

  /**
   * Update record
   * @param {number} id - Record ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>}
   */
  static async update(id, data) {
    const [result] = await db.execute(
      'UPDATE table_name SET field1 = ?, field2 = ? WHERE id = ?',
      [data.field1, data.field2, id]
    );

    if (result.affectedRows === 0) {
      throw new Error('Record not found');
    }

    return result;
  }

  /**
   * Delete record
   * @param {number} id - Record ID
   * @returns {Promise<Object>}
   */
  static async deleteById(id) {
    const [result] = await db.execute(
      'DELETE FROM table_name WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      throw new Error('Record not found');
    }

    return result;
  }
}

module.exports = ModelName;
```

---

## Checklist for Refactoring a Controller

- [ ] 1. Identify all `db.execute()` and `db.query()` calls
- [ ] 2. Group queries by entity/model
- [ ] 3. Create/enhance corresponding model file
- [ ] 4. Add methods to model with JSDoc comments
- [ ] 5. Write unit tests for model methods
- [ ] 6. Update controller to import models
- [ ] 7. Replace SQL calls with model method calls
- [ ] 8. Remove direct db imports from controller
- [ ] 9. Test controller endpoints
- [ ] 10. Update API documentation

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Keeping business logic in controller
```javascript
// Wrong - calculation in controller
exports.getPatientStats = async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  const appointments = await Queue.getByPatient(patient.patient_id);
  const total = appointments.length; // Business logic
  const completed = appointments.filter(a => a.status === 'completed').length; // Business logic

  res.json({ total, completed });
};
```

### ✅ Solution: Move logic to model
```javascript
// Correct - logic in model
exports.getPatientStats = async (req, res) => {
  const stats = await Patient.getStats(req.params.id);
  res.json(stats);
};

// Model
static async getStats(patientId) {
  const [rows] = await db.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN queue_status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM queue
    WHERE patient_id = ?
  `, [patientId]);

  return rows[0];
}
```

---

### ❌ Mistake 2: Not handling NULL results
```javascript
// Wrong - might crash
const dentist = await Dentist.findById(id);
res.json({ name: dentist.fname }); // Error if dentist is null
```

### ✅ Solution: Check for null
```javascript
// Correct
const dentist = await Dentist.findById(id);
if (!dentist) {
  return res.status(404).json({ error: 'Dentist not found' });
}
res.json({ name: dentist.fname });
```

---

### ❌ Mistake 3: Not using transactions
```javascript
// Wrong - no transaction
await User.create(userData);
await Patient.create(patientData); // If this fails, user record is orphaned
```

### ✅ Solution: Use transactions
```javascript
// Correct
await Patient.createWithUser(userData, patientData); // Model handles transaction
```

---

### ❌ Mistake 4: Exposing sensitive data
```javascript
// Wrong - returns password
static async findById(id) {
  const [rows] = await db.execute('SELECT * FROM user WHERE user_id = ?', [id]);
  return rows[0]; // Contains password hash
}
```

### ✅ Solution: Select only needed fields
```javascript
// Correct
static async findById(id) {
  const [rows] = await db.execute(
    'SELECT user_id, email, username, role_id FROM user WHERE user_id = ?',
    [id]
  );
  return rows[0];
}
```

---

## Testing Examples

### Unit Test (Model)
```javascript
// tests/models/Dentist.test.js
const { Dentist } = require('../../models');
const db = require('../../config/db');

jest.mock('../../config/db');

describe('Dentist Model', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('findById returns dentist when found', async () => {
    const mockDentist = { dentist_id: 1, fname: 'John', lname: 'Doe' };
    db.execute.mockResolvedValue([[mockDentist]]);

    const result = await Dentist.findById(1);

    expect(result).toEqual(mockDentist);
    expect(db.execute).toHaveBeenCalledWith(
      'SELECT * FROM dentist WHERE dentist_id = ?',
      [1]
    );
  });

  test('findById returns null when not found', async () => {
    db.execute.mockResolvedValue([[]]);

    const result = await Dentist.findById(999);

    expect(result).toBeNull();
  });
});
```

### Integration Test (Controller)
```javascript
// tests/controllers/dentist.controller.test.js
const request = require('supertest');
const app = require('../../app');

describe('Dentist Controller', () => {
  test('GET /api/dentists/:id returns dentist', async () => {
    const response = await request(app)
      .get('/api/dentists/1')
      .expect(200);

    expect(response.body).toHaveProperty('dentist');
    expect(response.body.dentist).toHaveProperty('dentist_id');
  });

  test('GET /api/dentists/999 returns 404', async () => {
    const response = await request(app)
      .get('/api/dentists/999')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });
});
```

---

## Useful Commands

### Find all db.execute/query in a file:
```bash
grep -n "db\.\(execute\|query\)" controller_file.js
```

### Count SQL queries in a file:
```bash
grep -c "db\.\(execute\|query\)" controller_file.js
```

### Find all controllers with SQL:
```bash
grep -l "db\.\(execute\|query\)" controller/*.js
```

---

## Quick Reference: Model Methods Naming Convention

| Operation | Method Name | Example |
|-----------|-------------|---------|
| Get one by ID | `findById(id)` | `User.findById(1)` |
| Get one by field | `findBy{Field}(value)` | `User.findByEmail('email@example.com')` |
| Get all | `findAll()` | `Treatment.findAll()` |
| Get with condition | `findAll{Condition}()` | `Queue.findAllPending()` |
| Create | `create(data)` | `Patient.create({...})` |
| Update | `update(id, data)` | `Dentist.update(1, {...})` |
| Delete | `deleteById(id)` | `User.deleteById(1)` |
| Check exists | `exists(field, value)` | `User.exists('email', 'test@test.com')` |
| Count | `getCount(condition)` | `Notification.getCount({is_read: 0})` |
| Complex query | Descriptive name | `Patient.getDashboardData(id)` |

---

## Need Help?

1. **Check existing refactored controllers:**
   - `register.controller.js` ✅
   - `login.controller.js` ✅
   - `password-reset.controller.js` ✅

2. **Review existing models:**
   - `D:\dentist\models\*.model.js`

3. **Read detailed analysis:**
   - `SQL_ANALYSIS_REPORT.md`
   - `REFACTORING_SUMMARY.md`

---

*Last Updated: 2025*
*Quick Reference Version: 1.0*
