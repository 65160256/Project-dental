const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ สร้าง absolute path สำหรับ uploads directory
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');

// ✅ ตรวจสอบและสร้างโฟลเดอร์ถ้ายังไม่มี
if (!fs.existsSync(uploadDir)) {
  console.log(`📁 Creating uploads directory: ${uploadDir}`);
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // ✅ ใช้ path ที่แน่นอน
    console.log(`📤 Saving file to: ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // ✅ สร้างชื่อไฟล์ที่ unique
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    
    console.log(`💾 Generated filename: ${filename}`);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    console.log(`🔍 Checking file type: ${file.mimetype}`);
    
    // ✅ ตรวจสอบ MIME type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✅ File type accepted');
      cb(null, true);
    } else {
      console.log('❌ File type rejected');
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed!'), false);
    }
  }
});

// ✅ Export พร้อม log
console.log(`📂 Upload directory configured: ${uploadDir}`);

module.exports = upload;