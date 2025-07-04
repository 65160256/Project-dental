const bcrypt = require('bcrypt');
const db = require('../models/db');

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM user WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.send('User not found');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.send('Incorrect password');
    }

    // ✅ login success: สร้าง session
    req.session.userId = user.user_id;
    req.session.role = user.role_id;

    // ✅ อัปเดตเวลา last_login
    await db.execute('UPDATE user SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

    // ✅ redirect ตาม role
    if (user.role_id == 1) return res.redirect('/admin/dashboard');
    if (user.role_id == 2) return res.redirect('/dentist/schedule');
    if (user.role_id == 3) return res.redirect('/patient/home');

    // ถ้าไม่มี role ที่ตรง ให้ redirect กลับไป login
    return res.redirect('/login');

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};
