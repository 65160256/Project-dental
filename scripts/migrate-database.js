const mysql = require('mysql2/promise');
require('dotenv').config();

async function createPasswordResetTable() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'dentist_db'
    });

    console.log('✅ Database connected successfully');

    // Check if table exists
    const [tables] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'password_resets'
    `, [process.env.DB_NAME]);

    if (tables[0].count > 0) {
      console.log('ℹ️ password_resets table already exists');
      
      // Check if we need to add any missing columns
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_resets'
      `, [process.env.DB_NAME]);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const requiredColumns = ['id', 'email', 'token', 'expires_at', 'used_at', 'created_at'];
      
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`⚠️ Missing columns detected: ${missingColumns.join(', ')}`);
        console.log('Please run the CREATE TABLE statement manually or drop and recreate the table');
      } else {
        console.log('✅ All required columns are present');
      }
      
      return;
    }

    console.log('🔨 Creating password_resets table...');

    await connection.execute(`
      CREATE TABLE password_resets (
        id int NOT NULL AUTO_INCREMENT,
        email varchar(255) NOT NULL,
        token varchar(255) NOT NULL,
        expires_at timestamp NOT NULL,
        used_at timestamp NULL DEFAULT NULL,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_email (email),
        KEY idx_token (token),
        KEY idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    console.log('✅ password_resets table created successfully');

    // Create cleanup event if it doesn't exist
    console.log('🕐 Setting up cleanup event...');
    
    try {
      await connection.execute(`
        CREATE EVENT IF NOT EXISTS cleanup_expired_password_resets
        ON SCHEDULE EVERY 1 HOUR
        STARTS NOW()
        DO
        DELETE FROM password_resets 
        WHERE expires_at < NOW() OR used_at IS NOT NULL
      `);
      
      console.log('✅ Cleanup event created successfully');
    } catch (eventError) {
      console.log('⚠️ Could not create cleanup event (may require SUPER privileges)');
      console.log('You can create it manually in your database admin panel');
    }

    // Test the table
    console.log('🧪 Testing table functionality...');
    
    const testEmail = 'test@example.com';
    const testToken = 'test-token-' + Date.now();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Insert test record
    await connection.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
      [testEmail, testToken, expiresAt]
    );

    // Verify insert
    const [testResults] = await connection.execute(
      'SELECT * FROM password_resets WHERE email = ?',
      [testEmail]
    );

    if (testResults.length > 0) {
      console.log('✅ Table insert test passed');
      
      // Clean up test record
      await connection.execute('DELETE FROM password_resets WHERE email = ?', [testEmail]);
      console.log('✅ Test record cleaned up');
    } else {
      console.log('❌ Table insert test failed');
    }

    console.log('🎉 Database migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('🔧 Database connection failed. Please check:');
      console.log('1. DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in .env');
      console.log('2. Database server is running');
      console.log('3. User has proper permissions');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('🔧 Database does not exist. Please create the database first:');
      console.log(`CREATE DATABASE ${process.env.DB_NAME || 'dentist_db'};`);
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Check environment variables
function checkEnvironment() {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('Please check your .env file');
    process.exit(1);
  }
  
  console.log('✅ Environment variables configured');
}

// Main execution
if (require.main === module) {
  console.log('🚀 Starting database migration for password reset functionality...');
  console.log('================================================');
  
  checkEnvironment();
  createPasswordResetTable()
    .then(() => {
      console.log('================================================');
      console.log('✅ Migration completed successfully!');
      console.log('Next steps:');
      console.log('1. Configure EMAIL_USER and EMAIL_PASS in .env');
      console.log('2. Run: npm run test:email');
      console.log('3. Test the forgot password flow');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createPasswordResetTable };