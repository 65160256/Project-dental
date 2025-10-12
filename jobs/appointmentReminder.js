const cron = require('node-cron');
const db = require('../config/db');
const NotificationHelper = require('../utils/notificationHelper');

// Run every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running appointment reminder job...');

  try {
    // Get appointments for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    const [appointments] = await db.execute(`
      SELECT queue_id, patient_id, dentist_id
      FROM queue
      WHERE DATE(time) = ?
      AND queue_status IN ('pending', 'confirm')
    `, [tomorrowDate]);

    console.log(`Found ${appointments.length} appointments for tomorrow`);

    for (const appointment of appointments) {
      await NotificationHelper.createReminderNotification(
        appointment.queue_id,
        appointment.patient_id,
        appointment.dentist_id
      );
    }

    console.log('Appointment reminder job completed');

  } catch (error) {
    console.error('Error in appointment reminder job:', error);
  }
});

module.exports = cron;