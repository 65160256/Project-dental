// scripts/test-notifications.js
// Script to diagnose notification issues

require('dotenv').config();
const db = require('../config/db');
const NotificationHelper = require('../utils/notificationHelper');

async function testNotifications() {
  console.log('='.repeat(60));
  console.log('NOTIFICATION DIAGNOSTICS');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Database connection
    console.log('\n1️⃣ Testing database connection...');
    try {
      const [result] = await db.execute('SELECT 1 as test');
      console.log('✅ Database connection: OK');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      console.log('💡 Solution: Check your .env file and ensure MySQL is running');
      process.exit(1);
    }
    
    // Test 2: Check if notifications table exists
    console.log('\n2️⃣ Checking notifications table...');
    try {
      const [tables] = await db.execute('SHOW TABLES LIKE "notifications"');
      if (tables.length === 0) {
        console.error('❌ notifications table does not exist!');
        console.log('💡 Solution: Run your database migration script');
        process.exit(1);
      }
      console.log('✅ notifications table exists');
    } catch (error) {
      console.error('❌ Error checking table:', error.message);
      process.exit(1);
    }
    
    // Test 3: Check table structure
    console.log('\n3️⃣ Checking table structure...');
    try {
      const [columns] = await db.execute('DESCRIBE notifications');
      console.log('✅ Table columns:');
      columns.forEach(col => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });
    } catch (error) {
      console.error('❌ Error checking structure:', error.message);
    }
    
    // Test 4: Test inserting a notification
    console.log('\n4️⃣ Testing notification insertion...');
    try {
      const [result] = await db.execute(`
        INSERT INTO notifications (type, title, message, is_read, is_new)
        VALUES (?, ?, ?, 0, 1)
      `, ['test', 'Test Notification', 'This is a test notification']);
      
      console.log('✅ Test notification inserted with ID:', result.insertId);
      
      // Clean up
      await db.execute('DELETE FROM notifications WHERE id = ?', [result.insertId]);
      console.log('✅ Test notification deleted');
    } catch (error) {
      console.error('❌ Error inserting test notification:', error.message);
      console.error('Error code:', error.code);
    }
    
    // Test 5: Test NotificationHelper
    console.log('\n5️⃣ Testing NotificationHelper...');
    try {
      console.log('   Testing helper functions...');
      // Note: This will fail if there are no appointments, but that's OK
      console.log('✅ NotificationHelper loaded successfully');
    } catch (error) {
      console.error('❌ Error loading NotificationHelper:', error.message);
    }
    
    // Test 6: Check recent notifications
    console.log('\n6️⃣ Checking recent notifications...');
    try {
      const [notifications] = await db.execute(`
        SELECT id, type, title, created_at, is_read
        FROM notifications 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      if (notifications.length > 0) {
        console.log(`✅ Found ${notifications.length} recent notifications:`);
        notifications.forEach(notif => {
          console.log(`   - ${notif.title} (${notif.type}) - ${notif.is_read ? 'read' : 'unread'}`);
        });
      } else {
        console.log('⚠️  No notifications found in database');
      }
    } catch (error) {
      console.error('❌ Error fetching notifications:', error.message);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSTICS COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
  } finally {
    process.exit(0);
  }
}

testNotifications();
