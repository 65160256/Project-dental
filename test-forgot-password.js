const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
require('dotenv').config();

async function testDatabase() {
    console.log('Testing Database Connection...');
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'mysql',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'dentist_db'
        });

        // Test basic connection
        const [result] = await connection.execute('SELECT 1 as test');
        console.log('✅ Database connection successful');

        // Test password_resets table exists
        const [tables] = await connection.execute("SHOW TABLES LIKE 'password_resets'");
        if (tables.length === 0) {
            console.log('❌ password_resets table not found');
            console.log('Creating table now...');
            
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
            
            console.log('✅ password_resets table created');
        } else {
            console.log('✅ password_resets table exists');
        }

        await connection.end();
        return true;

    } catch (error) {
        console.log('❌ Database test failed:', error.message);
        return false;
    }
}

async function testEmailConfig() {
    console.log('Testing Email Configuration...');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ EMAIL_USER or EMAIL_PASS not set in .env');
        return false;
    }

    try {
        const transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.verify();
        console.log('✅ Email configuration is valid');
        console.log('Email configured for:', process.env.EMAIL_USER);
        
        return true;

    } catch (error) {
        console.log('❌ Email test failed:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('=== Testing Forgot Password System ===');
    
    const dbTest = await testDatabase();
    const emailTest = await testEmailConfig();

    console.log('================================');
    
    if (dbTest && emailTest) {
        console.log('🎉 All tests passed!');
        console.log('Your forgot password system is ready.');
    } else {
        console.log('❌ Some tests failed. Please check the issues above.');
    }
}

runAllTests().catch(console.error);