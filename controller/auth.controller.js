const db = require('../models/db');
const bcrypt = require('bcryptjs');
const loginController = require('./login.controller');

exports.getLogin = (req, res) => {
  res.render('login');
};

exports.postLogin = loginController.login;

exports.getRegister = (req, res) => {
  res.render('register');
};

exports.postRegister = async (req, res) => {
  const { fname, lname, dob, idcard, email, password, address, phone } = req.body;

  // สร้าง hash password
  const hash = await bcrypt.hash(password, 10);

  
  // แก้ role_id เป็น 3
const [userResult] = await db.execute(
  'INSERT INTO user (role_id, email, password) VALUES (?, ?, ?)', 
  [3, email, hash]
);


  const user_id = userResult.insertId;

  await db.execute(
    'INSERT INTO patient (user_id, fname, lname, phone, dob, address, idcard) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user_id, fname, lname, phone, dob, address, idcard]
  );

  res.redirect('/login');
};

exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.send('Logout failed');
    }
    res.redirect('/login');
  });
};

