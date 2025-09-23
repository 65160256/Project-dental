const db = require('../config/db');

module.exports = {
  countUnread() {
    return db.execute('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0');
  },
  create({ type, title, message, patient_id = null }) {
    return db.execute(
      `INSERT INTO notifications (type, title, message, patient_id, is_read, is_new)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [type, title, message, patient_id]
    );
  },
  list() { return db.execute('SELECT * FROM notifications ORDER BY created_at DESC'); },
  findById(id) { return db.execute('SELECT * FROM notifications WHERE id = ?', [id]); },
  markRead(id) { return db.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]); },
  markAllRead() { return db.execute('UPDATE notifications SET is_read = 1'); },
  delete(id) { return db.execute('DELETE FROM notifications WHERE id = ?', [id]); }
};
