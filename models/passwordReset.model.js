const db = require('../config/db');

module.exports = {
  stats() {
    return db.execute(`
      SELECT COUNT(*) total,
             SUM(CASE WHEN expires_at > NOW() AND used_at IS NULL THEN 1 ELSE 0 END) active,
             SUM(CASE WHEN expires_at <= NOW() AND used_at IS NULL THEN 1 ELSE 0 END) expired,
             SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) used,
             ROUND((SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END)/COUNT(*))*100,2) success_rate
      FROM password_resets`);
  },
  recent(limit = 50) {
    return db.execute(`
      SELECT pr.*, CASE 
        WHEN pr.used_at IS NOT NULL THEN 'completed'
        WHEN pr.expires_at <= NOW() THEN 'expired'
        ELSE 'active' END status
      FROM password_resets pr
      ORDER BY pr.created_at DESC
      LIMIT ?`, [limit]);
  },
  dailyLast30() {
    return db.execute(`
      SELECT DATE(created_at) date, COUNT(*) total_requests,
             SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) successful_resets,
             ROUND(AVG(CASE WHEN used_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, used_at) END),1) avg_completion_minutes
      FROM password_resets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC`);
  }
};
