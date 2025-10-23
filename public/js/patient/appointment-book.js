// Global Variables
let currentStep = 1;
let selectedDoctor = null;
let selectedDate = null;
let selectedTime = null;
let currentCalendarDate = new Date();
let doctorsData = [];
let treatmentsData = [];
let filteredTreatmentId = '';
let calendarData = {};
let currentPatient = { fname: '', lname: '' };

// Initialize Page
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 เริ่มต้นระบบจองนัดหมาย...');
  initializePage();
  setupFormValidation();
});

async function initializePage() {
  try {
    showToast('กำลังโหลดระบบจองนัดหมาย...', 'info');
    await loadPatientInfo();
    await loadTreatments();
    await loadCalendarData();
    generateCalendar();
    showToast('พร้อมจองนัดหมายแล้ว!', 'success');
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการเริ่มต้น:', error);
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณารีเฟรชหน้าใหม่', 'error');
  }
}

// Load Patient Info
async function loadPatientInfo() {
  try {
    const response = await fetch('/patient/api/my-profile');
    const data = await response.json();
    if (data.success) {
      currentPatient = { fname: data.patient.fname, lname: data.patient.lname };
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = `${currentPatient.fname} ${currentPatient.lname}`;
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar) userAvatar.textContent = currentPatient.email ? currentPatient.email.charAt(0).toUpperCase() : 'U';
      console.log('✅ โหลดข้อมูลผู้ป่วย:', currentPatient);
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย:', error);
  }
}

// Load Treatments
async function loadTreatments() {
  try {
    console.log('📋 กำลังโหลดการรักษา...');
    const response = await fetch('/patient/api/treatments');
    const data = await response.json();
    if (data.success) {
      treatmentsData = data.treatments;
      console.log('✅ โหลด', treatmentsData.length, 'การรักษา');
      populateTreatmentFilter();
    } else {
      throw new Error(data.error || 'ไม่สามารถโหลดการรักษาได้');
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการโหลดการรักษา:', error);
    showToast('ไม่สามารถโหลดข้อมูลการรักษาได้', 'error');
  }
}

// Populate Treatment Filter
function populateTreatmentFilter() {
  const select = document.getElementById('treatmentFilter');
  select.innerHTML = '<option value="">การรักษาทั้งหมด</option>';
  treatmentsData.forEach(treatment => {
    const option = document.createElement('option');
    option.value = treatment.treatment_id;
    option.textContent = `${treatment.treatment_name} (${treatment.duration} นาที)`;
    select.appendChild(option);
  });
}

// Load Calendar Data
async function loadCalendarData() {
  try {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth() + 1;
    console.log(`📅 Loading calendar data for ${year}-${month}...`);
    let url = `/patient/api/calendar-data?year=${year}&month=${month}`;
    if (filteredTreatmentId) url += `&treatment_id=${filteredTreatmentId}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.success) {
      calendarData = {};
      console.log('📦 Raw calendar data from API:', data.calendar_data);
      data.calendar_data.forEach(day => {
        // แปลง date format จาก "Fri Oct 17" เป็น "2025-10-17"
        const year = currentCalendarDate.getFullYear(); // ใช้ปีจากปฏิทินปัจจุบัน (2025)
        const dateObj = new Date(`${day.date}, ${year}`);
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dayNum = String(dateObj.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${dayNum}`;
        
        calendarData[dateString] = {
          available_dentists: day.available_dentists,
          available_slots: day.available_slots,
          total_slots: day.total_slots,
          dentists: day.dentists || []
        };
        console.log(`📅 Processed day ${day.date} → ${dateString} (year: ${year}):`, calendarData[dateString]);
      });
      console.log('✅ Loaded calendar data:', Object.keys(calendarData).length, 'days');
      console.log('🗂️ Final calendarData object:', calendarData);
      
      // Debug: แสดงรายการวันที่ที่มีข้อมูล
      const daysWithData = Object.keys(calendarData).filter(date => {
        const data = calendarData[date];
        return data && (data.available_dentists > 0 || data.dentists.length > 0);
      });
      console.log('📋 Days with available dentists:', daysWithData);
    } else {
      console.error('❌ Failed to load calendar data:', data.error);
    }
  } catch (error) {
    console.error('❌ Error loading calendar:', error);
  }
}

// Change Calendar Month
function changeCalendarMonth(direction) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
  loadCalendarData().then(() => generateCalendar());
}

// Generate Calendar
function generateCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  document.getElementById('calendarTitle').textContent = `${monthNames[month]} ${year + 543}`;
  const grid = document.getElementById('calendarGrid');
  const weekdayHeaders = grid.querySelectorAll('.weekday');
  grid.innerHTML = '';
  weekdayHeaders.forEach(header => grid.appendChild(header));
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate); 
    date.setDate(startDate.getDate() + i);
    const dayElement = createDayElement(date, month, today, tomorrow);
    grid.appendChild(dayElement);
  }
}

// Create Day Element
function createDayElement(date, currentMonth, today, tomorrow) {
  const day = document.createElement('div');
  day.className = 'calendar-day';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayNum = String(date.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${dayNum}`;
  day.dataset.date = dateString;

  const dayOfWeek = date.getDay();
  const compareDate = new Date(date); compareDate.setHours(0,0,0,0);
  const todayDate = new Date(today); todayDate.setHours(0,0,0,0);
  
  // คำนวณวันที่ห้ามจอง (น้อยกว่า 24 ชั่วโมง)
  const minBookingDate = new Date(today);
  minBookingDate.setDate(minBookingDate.getDate() + 1); // ต้องจองล่วงหน้าอย่างน้อย 1 วันเต็ม
  minBookingDate.setHours(0,0,0,0);

  if (date.getMonth() !== currentMonth) day.classList.add('other-month');
  const isPast = compareDate <= todayDate; // วันในอดีต
  const isTooClose = compareDate <= minBookingDate; // วันที่ใกล้เกินไป (น้อยกว่า 24 ชั่วโมง)
  
  if (isPast) day.classList.add('past');
  if (isTooClose && !isPast) day.classList.add('too-close');
  if (dayOfWeek === 0) day.classList.add('unavailable');

  const dayNumber = document.createElement('div');
  dayNumber.className = 'day-number';
  dayNumber.textContent = date.getDate();
  day.appendChild(dayNumber);

  const dayData = calendarData[dateString];
  
  // Debug logging
  if (dayData) {
    console.log(`📅 Day ${dateString}:`, {
      available_dentists: dayData.available_dentists,
      available_slots: dayData.available_slots,
      dentists: dayData.dentists,
      dentists_length: dayData.dentists ? dayData.dentists.length : 0
    });
  } else {
    console.log(`❌ No data for day ${dateString}`);
  }
  
  // แสดงข้อมูลหมอ/ช่องว่างสำหรับทุกวันที่มีข้อมูล (เหมือนแอดมิน)
  if (dayData && date.getMonth() === currentMonth && dayOfWeek !== 0) {
    console.log(`✅ Highlighting day ${dateString} - has ${dayData.available_dentists} dentists`);
    day.style.backgroundColor = '#fff9e6';
    const dentistsContainer = document.createElement('div');
    dentistsContainer.className = 'day-doctors';
    const dentistList = (dayData.dentists && dayData.dentists.length > 0)
      ? dayData.dentists.slice(0, 2)
      : [];
    dentistList.forEach(dentist => {
      const dentistItem = document.createElement('div'); 
      dentistItem.className = 'doctor-item';
      const initial = document.createElement('div'); 
      initial.className = 'doctor-mini-avatar';
      // ตรวจสอบโครงสร้างข้อมูล dentist
      const dentistName = dentist.name || `${dentist.fname || ''} ${dentist.lname || ''}`.trim();
      initial.textContent = dentistName.split(' ').map(n => n[0]).join('');
      const nameSpan = document.createElement('span'); 
      nameSpan.className = 'doctor-name-mini';
      nameSpan.textContent = dentistName;
      const status = document.createElement('div'); 
      status.className = 'doctor-status';
      dentistItem.appendChild(initial); 
      dentistItem.appendChild(nameSpan);
      dentistItem.appendChild(status);
      dentistsContainer.appendChild(dentistItem);
    });
    if (dayData.dentists && dayData.dentists.length > 2) {
      const moreInfo = document.createElement('div');
      moreInfo.style.cssText = 'text-align: center; color: #666; font-size: 10px; margin-top: 2px;';
      moreInfo.textContent = `+${dayData.dentists.length - 2} more`;
      dentistsContainer.appendChild(moreInfo);
    }
    if (dentistList.length === 0 && dayData.available_slots) {
      const info = document.createElement('div');
      info.style.cssText = 'text-align:center;color:#666;font-size:11px;margin-top:2px';
      info.textContent = `${dayData.available_slots||0} ช่องว่าง`;
      dentistsContainer.appendChild(info);
    }
    day.appendChild(dentistsContainer);
  }

  // อนุญาตให้คลิกเฉพาะวันที่ที่ห่างจากวันนี้อย่างน้อย 24 ชั่วโมง
  if (dayData && date.getMonth() === currentMonth && dayOfWeek !== 0 && !isTooClose && !isPast) {
    console.log(`🖱️ Making day ${dateString} clickable`);
    day.addEventListener('click', () => selectCalendarDate(dateString, day));
    day.style.cursor = 'pointer';
  } else if (isTooClose && !isPast) {
    console.log(`🚫 Day ${dateString} is too close for booking`);
    day.style.cursor = 'not-allowed';
    day.title = 'ต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมง';
  }

  return day;
}

// Select Calendar Date
function selectCalendarDate(dateStr, dayElement) {
  // อนุญาตให้เลือกวันที่ได้เหมือนแอดมิน (ไม่บังคับ 24 ชั่วโมงที่ระดับปฏิทิน)
  // จะตรวจสอบ 24 ชั่วโมงในขั้นตอนเลือกช่วงเวลาแทน
  document.querySelectorAll('.calendar-day.selected').forEach(day => day.classList.remove('selected'));
  dayElement.classList.add('selected');
  selectedDate = dateStr;
  console.log('📅 เลือกวันที่:', selectedDate);
  showAvailableDentists(dateStr);
}

// Show Available Dentists
async function showAvailableDentists(dateStr) {
  const doctorsSection = document.getElementById('doctorsSection');
  const doctorsGrid = document.getElementById('doctorsGrid');
  const dateText = document.getElementById('selectedDateText');
  const date = new Date(dateStr);
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  dateText.textContent = `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;

  doctorsGrid.innerHTML = `
    <div class="loading" style="grid-column: 1 / -1;">
      <div class="loading-spinner"></div>
      <span>กำลังโหลดข้อมูลทันตแพทย์...</span>
    </div>`;
  doctorsSection.style.display = 'block';

  try {
    let url = `/patient/api/available-dentists?date=${dateStr}`;
    if (filteredTreatmentId && filteredTreatmentId !== '') {
      url += `&treatment_id=${filteredTreatmentId}`;
    }
    console.log('👨‍⚕️ Fetching dentists from:', url);
    const response = await fetch(url);
    console.log('📡 API Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📦 API Response data:', data);

    if (data.success && data.dentists && data.dentists.length > 0) {
      doctorsData = data.dentists;
      console.log('✅ Found', data.dentists.length, 'dentists');
      let doctorsHTML = '';
      data.dentists.forEach(doctor => {
        const initials = doctor.email ? doctor.email.charAt(0).toUpperCase() : 'D';
        let treatmentsHTML = '';
        if (doctor.treatments && doctor.treatments.length > 0) {
          if (doctor.treatments.length <= 4) {
            doctor.treatments.forEach(t => treatmentsHTML += `<span class="treatment-tag">${t.treatment_name}</span>`);
          } else {
            doctor.treatments.slice(0,3).forEach(t => treatmentsHTML += `<span class="treatment-tag">${t.treatment_name}</span>`);
            treatmentsHTML += `<span class="treatment-tag" style="background:#666;color:white;">+${doctor.treatments.length - 3} อื่นๆ</span>`;
          }
        } else {
          treatmentsHTML = '<span class="treatment-tag">ทันตกรรมทั่วไป </span>';
        }

        doctorsHTML += `
          <div class="doctor-card" onclick="selectDoctorFromCard(${doctor.dentist_id}, '${doctor.fname}', '${doctor.lname}', '${doctor.specialty || 'ทันตแพทย์ทั่วไป'}', this)">
            <div class="doctor-card-header">
              <div class="doctor-avatar">${initials}</div>
              <div class="doctor-details">
                <h5>ทพ. ${doctor.fname} ${doctor.lname}</h5>
                <p>${doctor.specialty || 'ทันตแพทย์ทั่วไป'}</p>
              </div>
            </div>
            <div class="doctor-treatments">${treatmentsHTML}</div>
            <div class="doctor-availability">
              <strong>ช่วงเวลาว่าง:</strong><br>
              <span class="time-slot">${doctor.available_slots} ช่วงเวลาว่าง</span>
            </div>
          </div>`;
      });
      doctorsGrid.innerHTML = doctorsHTML;
    } else {
      console.log('⚠️ No dentists available');
      doctorsGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-calendar-times"></i>
          <h3>ไม่มีทันตแพทย์ว่างในวันนี้</h3>
          <p>กรุณาเลือกวันอื่น</p>
        </div>`;
    }

    doctorsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('❌ Error loading dentists:', error);
    console.error('❌ Error details:', error.message, error.stack);
    showToast('ไม่สามารถโหลดข้อมูลทันตแพทย์ได้: ' + error.message, 'error');
    doctorsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-exclamation-circle"></i>
        <h3>เกิดข้อผิดพลาดในการโหลดข้อมูล</h3>
        <p>กรุณาลองใหม่อีกครั้ง</p>
        <p style="font-size: 12px; color: #666;">Error: ${error.message}</p>
      </div>`;
  }
}

// Select Doctor From Card
function selectDoctorFromCard(doctorId, fname, lname, specialty, cardElement) {
  document.querySelectorAll('.doctor-card.selected').forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');
  selectedDoctor = { id: doctorId, name: `${fname} ${lname}`, specialty, fname, lname };
  console.log('👨‍⚕️ เลือกทันตแพทย์:', selectedDoctor);
  loadDoctorTreatments(doctorId);
  document.getElementById('step1Next').disabled = false;
  showToast(`เลือก ทพ. ${fname} ${lname} แล้ว`, 'success');
  setTimeout(() => {
    document.querySelector('.step-navigation').scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 300);
}

// Load Doctor Treatments
async function loadDoctorTreatments(dentistId) {
  try {
    console.log('📋 กำลังโหลดรายการรักษาของหมอ ID:', dentistId);
    const response = await fetch(`/patient/api/dentist-treatments/${dentistId}`);
    const data = await response.json();
    const select = document.getElementById('treatmentSelect');
    if (data.success && data.treatments.length > 0) {
      select.innerHTML = '<option value="">เลือกการรักษา</option>';
      data.treatments.forEach(t => {
        const option = document.createElement('option');
        option.value = t.treatment_id;
        option.textContent = `${t.treatment_name} (${t.duration} นาที)`;
        option.dataset.duration = t.duration;
        select.appendChild(option);
      });
      console.log('✅ โหลดรายการรักษา:', data.treatments.length, 'รายการ');
    } else {
      select.innerHTML = '<option value="">ไม่มีรายการรักษา</option>';
      showToast('หมอคนนี้ยังไม่มีรายการรักษาที่กำหนดไว้', 'warning');
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการโหลดรายการรักษา:', error);
    showToast('ไม่สามารถโหลดรายการรักษาได้', 'error');
  }
}

// Setup Form Validation
function setupFormValidation() {
  const treatmentSelect = document.getElementById('treatmentSelect');
  treatmentSelect.addEventListener('change', () => {
    loadTimeSlots();
    validateStep2();
  });
}

// Validate Step 2
function validateStep2() {
  const hasTreatment = document.getElementById('treatmentSelect').value !== '';
  const hasTime = selectedTime !== null;
  document.getElementById('step2Next').disabled = !(hasTreatment && hasTime);
}

// Next Step
function nextStep(step) {
  if (step === 2 && !selectedDoctor) { showToast('กรุณาเลือกทันตแพทย์ก่อน', 'error'); return; }
  if (step === 3) {
    const hasTreatment = document.getElementById('treatmentSelect').value;
    const hasTime = selectedTime;
    if (!hasTreatment || !hasTime) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }
    if (!validateBeforeConfirmation()) return;
  }
  currentStep = step;
  updateStepDisplay();
  if (step === 2) initializeStep2();
  else if (step === 3) initializeStep3();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Previous Step
function previousStep(step) {
  currentStep = step;
  updateStepDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Update Step Display
function updateStepDisplay() {
  for (let i = 1; i <= 3; i++) {
    const stepElement = document.getElementById(`step${i}`);
    const contentElement = document.getElementById(`step${i}Content`);
    stepElement.classList.remove('active', 'completed');
    contentElement.classList.remove('active');
    if (i < currentStep) stepElement.classList.add('completed');
    else if (i === currentStep) { stepElement.classList.add('active'); contentElement.classList.add('active'); }
  }
}

// Initialize Step 2
function initializeStep2() {
  document.getElementById('selectedDoctorName').textContent = `ทพ. ${selectedDoctor.name}`;
  document.getElementById('selectedDoctorSpecialty').textContent = selectedDoctor.specialty;
  document.getElementById('selectedDoctorAvatar').textContent = selectedDoctor.email ? selectedDoctor.email.charAt(0).toUpperCase() : 'D';
  updateSelectedDateDisplay();
  const treatmentId = document.getElementById('treatmentSelect').value;
  if (treatmentId) loadTimeSlots();
}

// Update Selected Date Display
function updateSelectedDateDisplay() {
  const date = new Date(selectedDate);
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const dayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  document.getElementById('selectedDateDisplay').textContent =
    `วัน${dayNames[date.getDay()]}ที่ ${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
}

// Load Time Slots
async function loadTimeSlots() {
  const treatmentId = document.getElementById('treatmentSelect').value;
  const grid = document.getElementById('timeSlotsGrid');
  
  if (!treatmentId) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-info-circle"></i>
        <h3>กรุณาเลือกการรักษาก่อน</h3>
      </div>`;
    return;
  }

  // ตรวจสอบกฎ 24 ชั่วโมงที่ระดับช่วงเวลา (เข้มงวดขึ้น)
  const selectedDateObj = new Date(selectedDate);
  const now = new Date();
  const timeDiff = selectedDateObj.getTime() - now.getTime();
  const hoursDiff = timeDiff / (1000 * 3600);
  
  if (hoursDiff < 24) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-clock"></i>
        <h3>ไม่สามารถจองได้</h3>
        <p><strong>ต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมง</strong></p>
        <p>เนื่องจากต้องรอการยืนยันจากแอดมิน</p>
        <p>กรุณาเลือกวันอื่นที่ห่างจากวันนี้อย่างน้อย 1 วัน</p>
      </div>`;
    return;
  }

  // ตรวจสอบวันอาทิตย์
  if (selectedDateObj.getDay() === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-calendar-times"></i>
        <h3>คลินิกปิดทำการวันอาทิตย์</h3>
        <p>กรุณาเลือกวันอื่น</p>
      </div>`;
    return;
  }

  grid.innerHTML = `
    <div class="loading" style="grid-column: 1 / -1;">
      <div class="loading-spinner"></div>
      <span>กำลังโหลดช่วงเวลาว่าง...</span>
    </div>`;

  try {
    const url = `/patient/api/available-slots?date=${selectedDate}&dentistId=${selectedDoctor.id}&treatmentId=${treatmentId}`;
    console.log('⏰ กำลังดึงช่วงเวลาจาก:', url);
    const response = await fetch(url);
    const data = await response.json();
    if (data.success && data.slots.length > 0) {
      console.log('✅ พบ', data.slots.length, 'ช่วงเวลาว่าง');
      // สร้าง time slots พร้อมตรวจสอบเวลา
      const currentTime = new Date();
      const selectedDateOnly = new Date(selectedDate);
      
      grid.innerHTML = data.slots.map(slot => {
        // สร้าง datetime object สำหรับ time slot นี้
        const [hours, minutes] = slot.start_time.split(':').map(Number);
        const slotDateTime = new Date(selectedDateOnly);
        slotDateTime.setHours(hours, minutes, 0, 0);
        
        // ตรวจสอบว่าเวลาผ่านมาแล้วหรือไม่
        const isPastTime = slotDateTime < currentTime;
        const isToday = selectedDateOnly.toDateString() === currentTime.toDateString();
        
        if (isPastTime && isToday) {
          // เวลาผ่านมาแล้ว - แสดงเป็น unavailable
          return `
            <div class="time-slot-btn unavailable" data-time="${slot.start_time}" data-end="${slot.end_time || ''}" title="เวลาผ่านมาแล้ว">
              <strong style="font-size:16px; color:#999;">${slot.start_time}${slot.end_time ? ' - ' + slot.end_time : ''}</strong><br>
              <small style="color:#999;">ผ่านมาแล้ว</small>
            </div>`;
        } else {
          // เวลายังไม่ผ่าน - แสดงเป็น available
          return `
            <div class="time-slot-btn available" onclick="selectTimeSlot('${slot.start_time}', '${slot.end_time || ''}', ${slot.duration})" data-time="${slot.start_time}" data-end="${slot.end_time || ''}">
              <strong style="font-size:16px;">${slot.start_time}${slot.end_time ? ' - ' + slot.end_time : ''}</strong><br>
              <small style="color:#059669;font-weight:600;">${slot.duration} นาที</small>
            </div>`;
        }
      }).join('');
    } else {
      console.log('⚠️ ไม่มีช่วงเวลาว่าง');
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-calendar-times"></i>
          <h3>ไม่มีช่วงเวลาว่างสำหรับการรักษานี้</h3>
          <p>กรุณาเลือกวันอื่นหรือเปลี่ยนการรักษา</p>
        </div>`;
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการโหลดช่วงเวลา:', error);
    showToast('ไม่สามารถโหลดช่วงเวลาได้', 'error');
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <i class="fas fa-exclamation-circle"></i>
        <h3>เกิดข้อผิดพลาดในการโหลดข้อมูล</h3>
      </div>`;
  }
}

// Change Selected Date
function changeSelectedDate(direction) {
  const date = new Date(selectedDate);
  date.setDate(date.getDate() + direction);
  const now = new Date();
  const hoursDiff = (date.getTime() - now.getTime()) / (1000 * 3600);
  
  if (hoursDiff < 24) { 
    showToast('ไม่สามารถเลือกวันที่ภายใน 24 ชั่วโมงได้ เนื่องจากต้องรอการยืนยันจากแอดมิน', 'warning'); 
    return; 
  }
  if (date.getDay() === 0) { 
    showToast('คลินิกปิดวันอาทิตย์', 'warning'); 
    return; 
  }
  
  selectedDate = date.toISOString().split('T')[0];
  updateSelectedDateDisplay();
  loadTimeSlots();
  selectedTime = null;
  validateStep2();
}

// Select Time Slot
function selectTimeSlot(startTime, endTime = '', duration = 0) {
  // ตรวจสอบว่าเวลาผ่านมาแล้วหรือไม่
  const currentTime = new Date();
  const selectedDateOnly = new Date(selectedDate);
  const [hours, minutes] = startTime.split(':').map(Number);
  const slotDateTime = new Date(selectedDateOnly);
  slotDateTime.setHours(hours, minutes, 0, 0);
  
  const isPastTime = slotDateTime < currentTime;
  const isToday = selectedDateOnly.toDateString() === currentTime.toDateString();
  
  if (isPastTime && isToday) {
    showToast('ไม่สามารถเลือกเวลาที่ผ่านมาแล้วได้', 'error');
    return;
  }
  
  document.querySelectorAll('.time-slot-btn.selected').forEach(btn => { btn.classList.remove('selected'); btn.classList.add('available'); });
  const button = document.querySelector(`[data-time="${startTime}"]`);
  if (button) {
    button.classList.remove('available');
    button.classList.add('selected');
    selectedTime = startTime;
    console.log('⏰ เลือกเวลา:', selectedTime, endTime ? `- ${endTime}` : '', `(${duration} นาที)`);
    validateStep2();
    const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;
    showToast(`เลือกเวลา ${timeDisplay} แล้ว`, 'success');
  }
}

// Initialize Step 3
function initializeStep3() {
  const treatmentId = document.getElementById('treatmentSelect').value;
  const symptoms = document.getElementById('symptoms').value;
  const selectedTreatment = treatmentsData.find(t => t.treatment_id == treatmentId);
  const treatmentDuration = selectedTreatment ? selectedTreatment.duration : 0;
  const [startHour, startMin] = selectedTime.split(':');
  const startDate = new Date(); startDate.setHours(parseInt(startHour), parseInt(startMin), 0);
  const endDate = new Date(startDate.getTime() + treatmentDuration * 60000);
  const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

  document.getElementById('finalPatientName').textContent = `${currentPatient.fname} ${currentPatient.lname}`;
  document.getElementById('finalTreatment').textContent = selectedTreatment ? `${selectedTreatment.treatment_name} (${selectedTreatment.duration} นาที)` : 'ไม่ทราบ';
  document.getElementById('finalDoctor').textContent = `ทพ. ${selectedDoctor.name}`;

  const date = new Date(selectedDate);
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const dayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  document.getElementById('finalDate').textContent = `วัน${dayNames[date.getDay()]}ที่ ${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
  document.getElementById('finalTime').textContent = `${selectedTime} - ${endTime} น.`;
  document.getElementById('finalSymptoms').textContent = symptoms || 'ไม่ได้ระบุ';
}

// Confirm Booking
async function confirmBooking() {
  const confirmBtn = document.querySelector('.confirmation-section button.btn-success');
  if (!confirmBtn) return;
  const originalHTML = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังจอง...';
  confirmBtn.disabled = true;

  try {
    const treatmentId = document.getElementById('treatmentSelect').value;
    const symptoms = document.getElementById('symptoms').value;
    if (!selectedDoctor || !selectedDoctor.id) throw new Error('กรุณาเลือกทันตแพทย์');
    if (!treatmentId) throw new Error('กรุณาเลือกการรักษา');
    if (!selectedDate) throw new Error('กรุณาเลือกวันที่');
    if (!selectedTime) throw new Error('กรุณาเลือกเวลา');

    const bookingData = { dentist_id: selectedDoctor.id, treatment_id: treatmentId, date: selectedDate, start_time: selectedTime, note: symptoms || '' };
    console.log('📤 Booking data:', bookingData);

    const response = await fetch('/patient/api/book-appointment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bookingData)
    });
    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Booking successful:', data.booking);
      showToast('ส่งคำขอจองนัดหมายเรียบร้อยแล้ว! รอการยืนยันจากแอดมิน', 'success');
      document.querySelector('.booking-success').innerHTML = `<i class="fas fa-clock"></i> ส่งคำขอจองนัดหมายเรียบร้อยแล้ว!`;
      document.querySelector('.booking-success').style.background = 'linear-gradient(135deg, #ffc107, #ff8c00)';
      confirmBtn.innerHTML = '<i class="fas fa-check"></i> ส่งคำขอแล้ว!';
      confirmBtn.disabled = true;
      const editBtn = document.querySelector('.confirmation-section .btn-secondary');
      if (editBtn) editBtn.style.display = 'none';
      
      // แสดงข้อความรอยืนยัน
      const statusBadge = document.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.textContent = 'รอยืนยันจากแอดมิน';
        statusBadge.className = 'status-badge status-pending';
      }
    } else {
      throw new Error(data.error || 'เกิดข้อผิดพลาดในการจอง');
    }
  } catch (error) {
    console.error('❌ Booking error:', error);
    showToast(error.message || 'ไม่สามารถจองนัดหมายได้', 'error');
    confirmBtn.innerHTML = originalHTML;
    confirmBtn.disabled = false;
  }
}

// Validate Before Confirmation
function validateBeforeConfirmation() {
  const treatmentId = document.getElementById('treatmentSelect').value;
  
  // ตรวจสอบข้อมูลพื้นฐาน
  if (!selectedDoctor || !selectedDoctor.id) { showToast('กรุณาเลือกทันตแพทย์', 'error'); return false; }
  if (!treatmentId) { showToast('กรุณาเลือกการรักษา', 'error'); return false; }
  if (!selectedDate) { showToast('กรุณาเลือกวันที่', 'error'); return false; }
  if (!selectedTime) { showToast('กรุณาเลือกเวลา', 'error'); return false; }
  
  // ตรวจสอบกฎ 24 ชั่วโมงอีกครั้งก่อนจอง
  const selectedDateObj = new Date(selectedDate);
  const now = new Date();
  const hoursDiff = (selectedDateObj.getTime() - now.getTime()) / (1000 * 3600);
  
  if (hoursDiff < 24) {
    showToast('ไม่สามารถจองได้ เนื่องจากต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมงเพื่อรอการยืนยันจากแอดมิน', 'error');
    return false;
  }
  
  // ตรวจสอบว่าเวลาที่เลือกผ่านมาแล้วหรือไม่
  const [hours, minutes] = selectedTime.split(':').map(Number);
  const slotDateTime = new Date(selectedDateObj);
  slotDateTime.setHours(hours, minutes, 0, 0);
  
  const isPastTime = slotDateTime < now;
  const isToday = selectedDateObj.toDateString() === now.toDateString();
  
  if (isPastTime && isToday) {
    showToast('ไม่สามารถจองได้ เนื่องจากเวลาที่เลือกผ่านมาแล้ว', 'error');
    return false;
  }
  
  return true;
}

// Start New Booking
function startNewBooking() { location.reload(); }

// Apply Treatment Filter
async function applyTreatmentFilter() {
  filteredTreatmentId = document.getElementById('treatmentFilter').value;
  if (!filteredTreatmentId) { showToast('กรุณาเลือกการรักษา', 'warning'); return; }
  showToast('กำลังค้นหาหมอที่ทำการรักษานี้...', 'info');
  await loadCalendarData();
  generateCalendar();
  const calendarSection = document.querySelector('.calendar-section');
  if (calendarSection) calendarSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const selectedTreatment = treatmentsData.find(t => t.treatment_id == filteredTreatmentId);
  const filterInstructions = document.getElementById('filterInstructions');
  if (filterInstructions) {
    filterInstructions.innerHTML = `
      <strong>กำลังแสดง:</strong> หมอที่ทำการรักษา "${selectedTreatment.treatment_name}" เท่านั้น
      | <a href="#" onclick="clearTreatmentFilter(); return false;" style="color: #4A90E2; text-decoration: underline;">แสดงทั้งหมด</a>
    `;
  }
  setTimeout(() => { showToast(`พบหมอที่ทำ ${selectedTreatment.treatment_name} - เลือกวันที่เพื่อดูรายละเอียด`, 'success'); }, 500);
}

function clearTreatmentFilter() {
  filteredTreatmentId = '';
  document.getElementById('treatmentFilter').value = '';
  const filterInstructions = document.getElementById('filterInstructions');
  if (filterInstructions) {
    filterInstructions.innerHTML = `<strong>ต้องจองล่วงหน้าอย่างน้อย 24 ชั่วโมง</strong> เพื่อรอการยืนยันจากแอดมิน และคลินิกปิดวันอาทิตย์`;
  }
  showToast('กำลังโหลดข้อมูลทั้งหมด...', 'info');
  loadCalendarData().then(() => {
    generateCalendar();
    showToast('แสดงหมอทั้งหมด', 'success');
  });
}

// Show Toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toastMessage');
  const icon = toast.querySelector('i');
  toast.className = `toast ${type} show`;
  switch(type) {
    case 'success': icon.className = 'fas fa-check-circle'; break;
    case 'error': icon.className = 'fas fa-exclamation-circle'; break;
    case 'warning': icon.className = 'fas fa-exclamation-triangle'; break;
    default: icon.className = 'fas fa-info-circle';
  }
  toast.querySelector('span').textContent = message;
  setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

// Toggle Dropdown
function toggleDropdown() {
  const menu = document.getElementById('profileDropdown');
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}
// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
  const prof = document.querySelector('.profile-dropdown');
  if (prof && !prof.contains(e.target)) {
    const menu = document.getElementById('profileDropdown');
    if (menu) menu.style.display = 'none';
  }
});
