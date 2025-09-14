const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./models/db');
const emailService = require('./services/email.service');
const { runDetailedCleanup } = require('./jobs/cleanup-tokens');

require('dotenv').config();

class SystemTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async test(name, testFunction) {
    try {
      this.log(`Testing: ${name}`, 'info');
      await testFunction();
      this.testResults.passed++;
      this.testResults.tests.push({ name, status: 'PASSED', error: null });
      this.log(`PASSED: ${name}`, 'success');
    } catch (error) {
      this.testResults.failed++;
      this.testResults.tests.push({ name, status: 'FAILED', error: error.message });
      this.log(`FAILED: ${name} - ${error.message}`, 'error');
    }
  }

  async testDatabaseConnection() {
    const [result] = await db.execute('SELECT 1 as test');
    if (result[0].test !== 1) {
      throw new Error('Database connection failed');
    }
  }

  async testPasswordResetTable() {
    // Check if table exists and has correct structure
    const [tables] = await db.execute(`
      SHOW TABLES LIKE 'password_resets'
    `);
    
    if (tables.length === 0) {
      throw new Error('password_resets table does not exist');
    }

    // Check table structure
    const [columns] = await db.execute(`
      DESCRIBE password_resets
    `);
    
    const requiredColumns = ['id', 'email', 'token', 'expires_at', 'used_at', 'created_at'];
    const existingColumns = columns.map(col => col.Field);
    
    for (const required of requiredColumns) {
      if (!existingColumns.includes(required)) {
        throw new Error(`Missing column: ${required}`);
      }
    }
  }

  async testTokenOperations() {
    const testEmail = 'test-' + Date.now() + '@example.com';
    const testToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Test insert
    const [insertResult] = await db.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [testEmail, testToken, expiresAt]
    );

    if (insertResult.affectedRows !== 1) {
      throw new Error('Failed to insert test token');
    }

    // Test select
    const [selectResult] = await db.execute(
      'SELECT * FROM password_resets WHERE email = ?',
      [testEmail]
    );

    if (selectResult.length !== 1 || selectResult[0].token !== testToken) {
      throw new Error('Failed to retrieve test token');
    }

    // Test update (mark as used)
    const [updateResult] = await db.execute(
      'UPDATE password_resets SET used_at = NOW() WHERE email = ?',
      [testEmail]
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error('Failed to update test token');
    }

    // Test delete
    await db.execute('DELETE FROM password_resets WHERE email = ?', [testEmail]);
    
    const [verifyResult] = await db.execute(
      'SELECT * FROM password_resets WHERE email = ?',
      [testEmail]
    );

    if (verifyResult.length !== 0) {
      throw new Error('Failed to delete test token');
    }
  }

  async testEmailConfiguration() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('EMAIL_USER or EMAIL_PASS not configured');
    }

    // Test email service configuration (without actually sending)
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.verify();
  }

  async testPasswordHashing() {
    const testPassword = 'testPassword123';
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    
    if (!hashedPassword || hashedPassword === testPassword) {
      throw new Error('Password hashing failed');
    }

    const isValid = await bcrypt.compare(testPassword, hashedPassword);
    if (!isValid) {
      throw new Error('Password verification failed');
    }

    const isInvalid = await bcrypt.compare('wrongPassword', hashedPassword);
    if (isInvalid) {
      throw new Error('Password verification should have failed');
    }
  }

  async testEnvironmentVariables() {
    const required = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
      'SESSION_SECRET', 'EMAIL_USER', 'EMAIL_PASS'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
  }

  async testUserTable() {
    // Check if user table exists and we can query it
    const [users] = await db.execute('SELECT COUNT(*) as count FROM user LIMIT 1');
    
    if (typeof users[0].count !== 'number') {
      throw new Error('User table query failed');
    }
  }

  async testCleanupFunction() {
    // Create expired token
    const testEmail = 'expired-test-' + Date.now() + '@example.com';
    const testToken = crypto.randomBytes(32).toString('hex');
    const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    await db.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [testEmail, testToken, expiredDate]
    );

    // Run cleanup
    const result = await runDetailedCleanup();
    
    if (result.deletedCount < 1) {
      throw new Error('Cleanup function did not remove expired token');
    }

    // Verify token was removed
    const [remaining] = await db.execute(
      'SELECT * FROM password_resets WHERE email = ?',
      [testEmail]
    );

    if (remaining.length > 0) {
      throw new Error('Expired token was not cleaned up');
    }
  }

  async runAllTests() {
    console.log('🧪 Starting comprehensive system tests...');
    console.log('=' .repeat(50));

    await this.test('Environment Variables', () => this.testEnvironmentVariables());
    await this.test('Database Connection', () => this.testDatabaseConnection());
    await this.test('User Table Access', () => this.testUserTable());
    await this.test('Password Reset Table', () => this.testPasswordResetTable());
    await this.test('Token Operations', () => this.testTokenOperations());
    await this.test('Email Configuration', () => this.testEmailConfiguration());
    await this.test('Password Hashing', () => this.testPasswordHashing());
    await this.test('Cleanup Function', () => this.testCleanupFunction());

    console.log('=' .repeat(50));
    console.log(`Test Results: ${this.testResults.passed} passed, ${this.testResults.failed} failed`);
    
    if (this.testResults.failed > 0) {
      console.log('\nFailed Tests:');
      this.testResults.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    } else {
      console.log('🎉 All tests passed! Your forgot password system is ready to use.');
    }

    return this.testResults.failed === 0;
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new SystemTester();
  
  tester.runAllTests()
    .then(success => {
      if (success) {
        console.log('\n✅ System test completed successfully!');
        console.log('Next steps:');
        console.log('1. Start your application: npm run dev');
        console.log('2. Test the forgot password flow manually');
        console.log('3. Check admin dashboard for monitoring');
        process.exit(0);
      } else {
        console.log('\n❌ System test failed. Please fix the issues above.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 System test crashed:', error);
      process.exit(1);
    });
}

module.exports = SystemTester;