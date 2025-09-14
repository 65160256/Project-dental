const nodemailer = require('nodemailer');
require('dotenv').config();

// สร้าง transporter สำหรับส่ง email
const createTransporter = () => {
  // ใช้ Gmail SMTP หรือ email service อื่นๆ
  return nodemailer.createTransport({
    service: 'gmail', // หรือ smtp server อื่น
    auth: {
      user: process.env.EMAIL_USER, // อีเมลของคลินิก
      pass: process.env.EMAIL_PASS  // app password
    }
  });
};

// ฟังก์ชันส่ง reset password email
const sendResetPasswordEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${token}`;
    
    const mailOptions = {
      from: `"Dentist Clinic" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Password</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #2c5aa0;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              margin-bottom: 20px;
              color: #333;
            }
            .content {
              margin-bottom: 30px;
            }
            .reset-button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #4285f4;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
              margin: 20px 0;
            }
            .reset-button:hover {
              background-color: #3367d6;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 14px;
              color: #666;
              text-align: center;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              color: #856404;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🦷 Dentist Clinic</div>
              <h2 class="title">Reset Your Password</h2>
            </div>
            
            <div class="content">
              <p>Hello,</p>
              <p>You requested to reset your password for your Dentist Clinic account.</p>
              <p>Click the button below to reset your password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="reset-button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4285f4;">${resetUrl}</p>
              
              <div class="warning">
                <p><strong>Security Note:</strong></p>
                <ul>
                  <li>This link will expire in 1 hour for security reasons</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this reset link with anyone</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>This email was sent from Dentist Clinic Management System</p>
              <p>If you have any questions, please contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('📧 Reset password email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending reset password email:', error);
    return { success: false, error: error.message };
  }
};

// ฟังก์ชันส่ง email แจ้งเตือนเมื่อรหัสผ่านถูกเปลี่ยน
const sendPasswordChangedEmail = async (email) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Dentist Clinic" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Changed Successfully',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Changed</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #2c5aa0;
              margin-bottom: 10px;
            }
            .success {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              color: #155724;
              text-align: center;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 14px;
              color: #666;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🦷 Dentist Clinic</div>
              <h2>Password Changed Successfully</h2>
            </div>
            
            <div class="success">
              <h3>✅ Your password has been changed</h3>
              <p>Your Dentist Clinic account password was successfully updated.</p>
            </div>
            
            <div class="content">
              <p><strong>Security Information:</strong></p>
              <ul>
                <li>Time: ${new Date().toLocaleString('th-TH')}</li>
                <li>If you didn't make this change, please contact us immediately</li>
                <li>Your account is now secure with the new password</li>
              </ul>
            </div>
            
            <div class="footer">
              <p>This email was sent from Dentist Clinic Management System</p>
              <p>If you have any questions, please contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('📧 Password changed email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending password changed email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendResetPasswordEmail,
  sendPasswordChangedEmail
};