const cron = require('node-cron');
const passwordResetController = require('../controller/password-reset.controller');

// Cleanup expired tokens every hour
const scheduleTokenCleanup = () => {
  console.log('📅 Scheduling password reset token cleanup job...');
  
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('🧹 Running password reset token cleanup...');
    
    try {
      const deletedCount = await passwordResetController.cleanupExpiredTokens();
      
      if (deletedCount > 0) {
        console.log(`✅ Cleaned up ${deletedCount} expired password reset tokens`);
      } else {
        console.log('ℹ️ No expired tokens to clean up');
      }
      
      // Log current active tokens count
      const activeCount = await passwordResetController.getActiveTokensCount();
      console.log(`📊 Active password reset tokens: ${activeCount}`);
      
    } catch (error) {
      console.error('❌ Error during token cleanup:', error);
    }
  });
  
  console.log('✅ Token cleanup job scheduled (runs every hour)');
};

// Manual cleanup function
const runCleanupNow = async () => {
  console.log('🧹 Running manual token cleanup...');
  
  try {
    const deletedCount = await passwordResetController.cleanupExpiredTokens();
    console.log(`✅ Manually cleaned up ${deletedCount} expired tokens`);
    
    const activeCount = await passwordResetController.getActiveTokensCount();
    console.log(`📊 Active tokens remaining: ${activeCount}`);
    
    return { deletedCount, activeCount };
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error);
    throw error;
  }
};

// Detailed cleanup with stats
const runDetailedCleanup = async () => {
  const db = require('../models/db');
  
  try {
    console.log('📊 Password Reset Token Statistics:');
    console.log('=====================================');
    
    // Get current stats
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN expires_at <= NOW() AND used_at IS NULL THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as used
      FROM password_resets
    `);
    
    const stat = stats[0];
    console.log(`📈 Total tokens: ${stat.total}`);
    console.log(`✅ Active tokens: ${stat.active}`);
    console.log(`⏰ Expired tokens: ${stat.expired}`);
    console.log(`✓ Used tokens: ${stat.used}`);
    
    // Show tokens by date
    const [dateStats] = await db.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as successful
      FROM password_resets
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    console.log('\n📅 Last 7 days activity:');
    dateStats.forEach(day => {
      const successRate = day.count > 0 ? ((day.successful / day.count) * 100).toFixed(1) : '0.0';
      console.log(`${day.date}: ${day.count} requests, ${day.successful} successful (${successRate}%)`);
    });
    
    // Clean up
    const deletedCount = await passwordResetController.cleanupExpiredTokens();
    console.log(`\n🧹 Cleaned up ${deletedCount} expired/used tokens`);
    
    return {
      before: stat,
      deletedCount,
      dateStats
    };
    
  } catch (error) {
    console.error('❌ Detailed cleanup failed:', error);
    throw error;
  }
};

module.exports = {
  scheduleTokenCleanup,
  runCleanupNow,
  runDetailedCleanup
};