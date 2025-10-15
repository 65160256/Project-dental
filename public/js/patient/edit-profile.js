
  function toggleDropdown() {
    const menu = document.getElementById('profileDropdown');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }
  
  document.addEventListener('click', function (e) {
    const prof = document.querySelector('.profile-dropdown');
    if (prof && !prof.contains(e.target)) {
      document.getElementById('profileDropdown').style.display = 'none';
    }
  });

  // Enhanced form validation
  document.querySelector('.profile-form').addEventListener('submit', function(e) {
    const fname = document.querySelector('input[name="fname"]').value.trim();
    const lname = document.querySelector('input[name="lname"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const id_card = document.querySelector('input[name="id_card"]').value.trim();
    const phone = document.querySelector('input[name="phone"]').value.trim();
    
    // Check required fields
    if (!fname || !lname || !email) {
      e.preventDefault();
      alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล และอีเมล)');
      return false;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      e.preventDefault();
      alert('กรุณากรอกอีเมลที่ถูกต้อง');
      return false;
    }
    
    // ID Card validation (if provided)
    if (id_card) {
      if (!/^\d{13}$/.test(id_card)) {
        e.preventDefault();
        alert('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลักเท่านั้น');
        return false;
      }
    }

    // Phone validation (if provided)
    if (phone) {
      if (!/^\d{10}$/.test(phone)) {
        e.preventDefault();
        alert('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักเท่านั้น');
        return false;
      }
    }

    // Confirm before submit
    if (!confirm('คุณต้องการบันทึกการเปลี่ยนแปลงหรือไม่?')) {
      e.preventDefault();
      return false;
    }
  });

  // Auto-format phone number (optional)
  const phoneInput = document.querySelector('input[name="phone"]');
  if (phoneInput) {
    phoneInput.addEventListener('input', function(e) {
      this.value = this.value.replace(/\D/g, '').substring(0, 10);
    });
  }

  // Auto-format ID card (optional)
  const idCardInput = document.querySelector('input[name="id_card"]');
  if (idCardInput) {
    idCardInput.addEventListener('input', function(e) {
      this.value = this.value.replace(/\D/g, '').substring(0, 13);
    });
  }
