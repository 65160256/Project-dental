const nodemailer = require('nodemailer');
require('dotenv').config();

async function sendTestEmail() {
    console.log('📧 Sending test email...');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ Please set EMAIL_USER and EMAIL_PASS in .env');
        return;
    }

    try {
        const transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const testEmail = {
            from: `"Dentist Clinic" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'Test - Forgot Password System Working!',
            html: `
                <h2>Test Email Successful!</h2>
                <p>Your forgot password email system is working correctly.</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            `
        };

        const result = await transporter.sendMail(testEmail);
        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', result.messageId);
        console.log('Check your inbox!');
        
    } catch (error) {
        console.log('❌ Test email failed:', error.message);
    }
}

sendTestEmail();