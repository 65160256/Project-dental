    // JavaScript เหมือนเดิมทั้งหมด
    let currentFilter = 'all';
    let searchDebounce;

    document.addEventListener('DOMContentLoaded', function() {
      initializeSearch();
      setupEventListeners();
      const initial = document.getElementById('searchInput').value.trim();
      if (initial) performSearch(initial);
    });

    function setupEventListeners() {
      const searchInput = document.getElementById('searchInput');
      searchInput.addEventListener('input', function() {
        clearTimeout(searchDebounce);
        const q = this.value;
        document.getElementById('clearSearch').style.display = q ? 'block' : 'none';
        searchDebounce = setTimeout(() => performSearch(q), 250);
      });
      searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') performSearch(this.value);
      });
      document.addEventListener('click', function (e) {
        const prof = document.querySelector('.profile-dropdown');
        if (prof && !prof.contains(e.target)) {
          const menu = document.getElementById('profileDropdown');
          menu.style.display = 'none';
          const trigger = prof.querySelector('.user-info');
          trigger && trigger.setAttribute('aria-expanded','false');
        }
      });
      window.addEventListener('click', function(event) {
        const modal = document.getElementById('profileModal');
        if (event.target === modal) closeModal();
      });
      document.addEventListener('keydown', function(e){
        const modal = document.getElementById('profileModal');
        if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
      });
    }

    function initializeSearch() {
      const searchValue = document.getElementById('searchInput').value;
      document.getElementById('clearSearch').style.display = searchValue ? 'block' : 'none';
    }

    function normalize(str){ return (str || '').toString().trim().toLowerCase(); }

    function performSearch(query) {
      const q = normalize(query);
      const cards = document.querySelectorAll('.dentist-card');
      let visibleCount = 0;
      cards.forEach(card => {
        const name = normalize(card.dataset.dentistName);
        const specialty = normalize(card.dataset.specialty);
        const matchesText = !q || name.includes(q) || specialty.includes(q);
        const matchesFilter = (currentFilter === 'all') || (specialty === normalize(currentFilter));
        const shouldShow = matchesText && matchesFilter;
        card.classList.toggle('hidden', !shouldShow);
        card.classList.toggle('is-visible', shouldShow);
        if (shouldShow) visibleCount++;
      });
      document.querySelectorAll('.specialty-section').forEach(section => {
        const visibleCards = section.querySelectorAll('.dentist-card.is-visible');
        section.classList.toggle('hidden', visibleCards.length === 0);
      });
      updateSearchResults(visibleCount, q);
    }

    function updateSearchResults(count, query) {
      const old = document.querySelector('.search-results-info');
      if (old) old.remove();
      if (query) {
        const info = document.createElement('div');
        info.className = 'search-results-info';
        info.innerHTML = `
          <div><i class="fas fa-search"></i>
            พบ <strong>${count}</strong> ทันตแพทย์ที่ตรงกับ "<strong>${escapeHtml(query)}</strong>"
          </div>
          <button onclick="clearSearch()" class="clear-search-btn"><i class="fas fa-times"></i> ล้าง</button>
        `;
        const anchor = document.getElementById('searchResultsAnchor');
        anchor.parentNode.insertBefore(info, anchor.nextSibling);
      }
    }

    function clearSearch() {
      const input = document.getElementById('searchInput');
      input.value = '';
      document.getElementById('clearSearch').style.display = 'none';
      performSearch('');
      input.focus();
    }

    function filterBySpecialty(specialty, el) {
      currentFilter = specialty;
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      if (el) el.classList.add('active');
      performSearch(document.getElementById('searchInput').value);
    }

    function handleImageError(img, dentistId, initials) {
      const photoContainer = document.getElementById(`photo-${dentistId}`);
      if (!photoContainer) return;
      photoContainer.innerHTML = `<span class="dentist-initials">${escapeHtml(initials || 'DR')}</span>`;
    }

    function makeAppointment(dentistId, dentistName) {
      if (confirm(`คุณต้องการจองนัดหมายกับ ทพ. ${dentistName} ใช่หรือไม่?`)) {
        window.location.href = `/patient/appointment/schedule?dentist_id=${encodeURIComponent(dentistId)}`;
      }
    }

    async function viewDentistProfile(dentistId) {
      const modal = document.getElementById('profileModal');
      const content = document.getElementById('profileContent');
      openModal();
      content.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>';
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 10000);
      try {
        const res = await fetch(`/patient/api/dentist-profile/${encodeURIComponent(dentistId)}`, { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        if (data && data.success) {
          displayProfile(data.dentist);
        } else {
          content.innerHTML = '<div style="padding:20px;text-align:center;color:#dc3545;">ไม่สามารถโหลดข้อมูลได้</div>';
        }
      } catch (err) {
        clearTimeout(t);
        console.error(err);
        content.innerHTML = `
          <div style="text-align:center;padding:40px;">
            <i class="fas fa-user-md" style="font-size:4rem;color:var(--primary);margin-bottom:20px;"></i>
            <h3>ข้อมูลทันตแพทย์</h3>
            <p>ข้อมูลรายละเอียดจะพร้อมใช้งานเร็วๆ นี้</p>
            <div style="margin-top:20px;">
              <button onclick="makeAppointment(${Number(dentistId)||0}, 'ทันตแพทย์')" class="make-appointment-btn">
                <i class="fas fa-calendar-plus"></i> จองนัดหมาย
              </button>
            </div>
          </div>
        `;
      }
    }

    function displayProfile(dentist) {
      const content = document.getElementById('profileContent');
      const initials = (dentist.full_name || '').split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
      const hasPhoto = dentist.photo && dentist.photo !== 'default-doctor.png';
      content.innerHTML = `
        <div style="text-align:center;margin-bottom:30px;">
          <div style="width:150px;height:150px;border-radius:50%;background:linear-gradient(135deg, var(--primary), var(--primary-2));margin:0 auto 20px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:4rem;box-shadow:0 8px 20px rgba(74,144,226,.3); overflow:hidden;">
            ${hasPhoto
              ? `<img src="/uploads/${encodeHtml(dentist.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" decoding="async" onerror="this.remove();const p=this.parentElement;p.innerHTML='<span style=&quot;font-size:2.2rem;font-weight:800;&quot;>${encodeHtml(initials || 'DR')}</span>';">`
              : `<span style="font-size:2.2rem;font-weight:800;">${encodeHtml(initials || 'DR')}</span>`}
          </div>
          <h2>ทพ. ${escapeHtml(dentist.full_name || '')}</h2>
          <p style="color: var(--primary); font-weight:700; font-size:16px;">${escapeHtml(dentist.specialty || '')}</p>
        </div>
        <div style="margin-bottom:30px;">
          <h3 style="margin-bottom:15px;color:#333;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-graduation-cap" style="color: var(--primary);"></i> การศึกษาและวุฒิบัตร
          </h3>
          <div style="background:#f8f9fa;padding:20px;border-radius:10px;">
            ${dentist.education
              ? String(dentist.education).split(',').map(edu => `<p style="margin-bottom:8px;padding-left:10px;">• ${escapeHtml(edu.trim())}</p>`).join('')
              : '<p style="padding-left:10px;">• ทันตแพทยศาสตรบัณฑิต เกียรตินิยม<br>• วุฒิบัตรชำนาญการทางทันตกรรม</p>'}
          </div>
        </div>
        <div style="margin-bottom:30px;">
          <h3 style="margin-bottom:15px;color:#333;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-stethoscope" style="color: var(--primary);"></i> ความเชี่ยวชาญ
          </h3>
          <div style="background:#f8f9fa;padding:20px;border-radius:10px;">
            <p>${escapeHtml(dentist.specialty || '')}</p>
          </div>
        </div>
        <div class="credential" style="margin-bottom:20px;">
          <i class="fas fa-clock"></i>
          <span>ประสบการณ์: 5+ ปี</span>
        </div>
        <div style="text-align:center;margin-top:30px;">
          <button onclick="makeAppointment(${Number(dentist.dentist_id)||0}, '${escapeJsString(dentist.full_name || "ทันตแพทย์")}')"
                  class="make-appointment-btn" style="font-size:16px;padding:15px 30px;">
            <i class="fas fa-calendar-plus"></i> จองนัดหมายกับ ทพ. ${escapeHtml(dentist.full_name || '')}
          </button>
        </div>
      `;
    }

    function openModal(){
      const modal = document.getElementById('profileModal');
      modal.setAttribute('aria-hidden','false');
      const focusable = modal.querySelector('.modal-content');
      focusable && focusable.focus();
    }
    function closeModal(){
      const modal = document.getElementById('profileModal');
      modal.setAttribute('aria-hidden','true');
    }

    function toggleDropdown() {
      const menu = document.getElementById('profileDropdown');
      const isOpen = menu.style.display === 'block';
      menu.style.display = isOpen ? 'none' : 'block';
      const trigger = document.querySelector('.profile-dropdown .user-info');
      trigger && trigger.setAttribute('aria-expanded', String(!isOpen));
    }

    function toggleNotifications() {
      console.log('การแจ้งเตือนถูกคลิก');
    }

    function escapeHtml(str){
      return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
    }
    function encodeHtml(str){ return escapeHtml(str); }
    function escapeJsString(str){ return String(str).replaceAll('\\','\\\\').replaceAll("`","\\`").replaceAll("'","\\'").replaceAll('"','\\"'); }
  