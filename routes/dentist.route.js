const express = require('express');
const router = express.Router();

router.get('/schedule', (req, res) => {
  res.render('dentist-schedule'); // หรือ res.send('Dentist schedule') ชั่วคราว
});

module.exports = router;
