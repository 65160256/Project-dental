const bcrypt = require('bcrypt');
const db = require('../config/db');


exports.registerPatient = async (req, res) => {
  const { email, password, confirmPassword, fname, lname, phone, dob, address, idcard } = req.body;

  if (!email || !password || !confirmPassword || !fname || !lname || !dob || !phone || !address || !idcard) {
    return res.status(400).send('Please fill in all required fields.');
  }

  if (password !== confirmPassword) {
    return res.status(400).send('Passwords do not match.');
  }

  try {
    // ตรวจสอบ email ซ้ำ
    const [existing] = await db.execute('SELECT * FROM user WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).send('Email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ตั้ง role_id = 3 (patient) โดยตรง
    const roleId = 3;

    // เพิ่มลง user
    const [userResult] = await db.execute(
      'INSERT INTO user (role_id, email, password) VALUES (?, ?, ?)',
      [roleId, email, hashedPassword]
    );
    const userId = userResult.insertId;

    // เพิ่มลง patient
    await db.execute(
      'INSERT INTO patient (user_id, fname, lname, phone, dob, address, idcard) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, fname, lname, phone, dob, address, idcard]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).send('Registration failed. Please try again.');
  }
};
