
    function toggleDropdown() {
      const menu = document.getElementById('profileDropdown');
      const trigger = document.querySelector('.profile-dropdown .user-info');
      const isOpen = menu.style.display === 'block';
      menu.style.display = isOpen ? 'none' : 'block';
      trigger && trigger.setAttribute('aria-expanded', String(!isOpen));
    }
    function toggleNotifications(){ console.log('การแจ้งเตือนถูกคลิก'); }

    // ปิดเมนูเมื่อคลิกนอก
    document.addEventListener('click', function (e) {
      const prof = document.querySelector('.profile-dropdown');
      if (prof && !prof.contains(e.target)) {
        document.getElementById('profileDropdown').style.display = 'none';
        const trigger = prof.querySelector('.user-info');
        trigger && trigger.setAttribute('aria-expanded','false');
      }
    });

    // Client-side validation (ข้อความไทยทั้งหมด)
    const form = document.querySelector('form');
    const currentEl = document.getElementById('currentPassword');
    const newEl = document.getElementById('newPassword');
    const confirmEl = document.getElementById('confirmPassword');
    const note = document.getElementById('pwdNote');

    form.addEventListener('submit', function(e){
      const currentPassword = currentEl.value.trim();
      const newPassword = newEl.value.trim();
      const confirmPassword = confirmEl.value.trim();

      if (!currentPassword || !newPassword || !confirmPassword) {
        e.preventDefault(); alert('กรุณากรอกข้อมูลรหัสผ่านให้ครบทุกช่อง'); return false;
      }
      if (newPassword.length < 8) {
        e.preventDefault(); alert('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 อักขระ'); return false;
      }
      if (newPassword !== confirmPassword) {
        e.preventDefault(); alert('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน'); return false;
      }
      if (newPassword === currentPassword) {
        e.preventDefault(); alert('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน'); return false;
      }
    });

    // Strength hint
    newEl.addEventListener('input', function(e){
      const p = e.target.value;
      if (!p) { note.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 อักขระ'; note.style.color='#666'; return; }
      if (p.length < 8) { note.textContent = `ความยาวรหัสผ่าน (${p.length}/8)`; note.style.color='#dc3545'; return; }
      // ตัวอย่างเงื่อนไขง่ายๆ: มีตัวพิมพ์เล็ก/ใหญ่/ตัวเลข อย่างน้อยอย่างละหนึ่ง
      const ok = /[a-z]/.test(p) + /[A-Z]/.test(p) + /\d/.test(p) + /[^A-Za-z0-9]/.test(p);
      note.textContent = ok >= 3 ? 'ความแข็งแรงรหัสผ่าน: ดี' : 'ความแข็งแรงรหัสผ่าน: ปานกลาง';
      note.style.color = ok >= 3 ? '#28a745' : '#ff9800';
    });

    // Confirm realtime
    confirmEl.addEventListener('input', function(e){
      const v = e.target.value, n = newEl.value;
      e.target.style.borderColor = (!v ? '#ddd' : (v===n ? '#28a745' : '#dc3545'));
    });
  