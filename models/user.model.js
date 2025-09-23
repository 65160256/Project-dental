const db = require('../config/db');
const bcrypt = require('bcrypt');

module.exports = {
  findById(userId) {
    return db.execute(`
      SELECT u.email, u.username, u.last_login, r.rname, u.role_id
      FROM user u JOIN role r ON u.role_id = r.role_id
      WHERE u.user_id = ?`, [userId]);
  },

  getPasswordHash(userId) {
    return db.execute('SELECT password FROM user WHERE user_id = ?', [userId]);
  },

  async changePassword(userId, currentPassword, newPassword) {
    const [rows] = await this.getPasswordHash(userId);
    if (rows.length === 0) throw new Error('User not found');
    const ok = await bcrypt.compare(currentPassword, rows[0].password);
    if (!ok) throw new Error('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE user SET password = ? WHERE user_id = ?', [hashed, userId]);
    return true;
  },

  emailExists(email, excludeUserId = null) {
    if (excludeUserId) {
      return db.execute(
        'SELECT COUNT(*) as count FROM user WHERE email = ? AND user_id != ?',
        [email, excludeUserId]
      );
    }
    return db.execute('SELECT COUNT(*) as count FROM user WHERE email = ?', [email]);
  },

  async create({ email, password, role_id }) {
    const hashed = await bcrypt.hash(password, 10);
    const [res] = await db.execute(
      'INSERT INTO user (email, password, role_id) VALUES (?, ?, ?)',
      [email, hashed, role_id]
    );
    return res.insertId;
  },

  async update(userId, { email, password }) {
    const fields = []; const params = [];
    if (email) { fields.push('email = ?'); params.push(email); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push('password = ?'); params.push(hash);
    }
    if (!fields.length) return;
    params.push(userId);
    await db.execute(`UPDATE user SET ${fields.join(', ')} WHERE user_id = ?`, params);
  },

  delete(userId) {
    return db.execute('DELETE FROM user WHERE user_id = ?', [userId]);
  }
};
