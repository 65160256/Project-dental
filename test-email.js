const emailService = require('./services/email.service');
require('dotenv').config();

async function testEmail() {
  console.log('🧪 Testing email configuration...');
  console.log('📧 Email User:', process.env.EMAIL_USER);
  console.log('🔐 Email Pass:', process.env.EMAIL_PASS ? '***configured***' : 'NOT SET');
  
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Please configure EMAIL_USER and EMAIL_PASS in .env file');
    process.exit(1);
  }

  try {
    // Test reset password email
    console.log('\n📤 Sending test reset password email...');
    
    const testEmail = 'test@example.com'; // Change this to your test email
    const testToken = 'test-token-123456';
    
    const result = await emailService.sendResetPasswordEmail(testEmail, testToken);
    
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      console.log('📬 Message ID:', result.messageId);
      console.log('\n📝 Next steps:');
      console.log('1. Check your email inbox');
      console.log('2. Check spam/junk folder if not found');
      console.log('3. Try the reset password flow in your application');
    } else {
      console.error('❌ Failed to send test email');
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Authentication Error Solutions:');
      console.log('1. Check EMAIL_USER and EMAIL_PASS in .env');
      console.log('2. Enable 2-Step Verification in Google Account');
      console.log('3. Generate App Password (not regular password)');
      console.log('4. Make sure EMAIL_USER matches the account');
    }
    
    if (error.code === 'ECONNECTION') {
      console.log('\n🌐 Connection Error Solutions:');
      console.log('1. Check internet connection');
      console.log('2. Check firewall settings');
      console.log('3. Try different SMTP server');
    }
  }
}

// Run test
testEmail().catch(console.error);