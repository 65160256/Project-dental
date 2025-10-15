
        let currentQueueId = null;

        // โหลดข้อมูลเมื่อหน้าโหลดเสร็จ
        document.addEventListener('DOMContentLoaded', function() {
            currentQueueId = '<%= typeof treatment !== "undefined" ? treatment.queue_id : "" %>' || window.location.pathname.split('/').pop();
            
            if (currentQueueId && currentQueueId !== 'undefined' && currentQueueId !== '') {
                loadTreatmentHistory(currentQueueId);
            } else {
                showError('ไม่พบ ID การรักษา');
            }
        });

        // โหลดข้อมูลประวัติการรักษา
        async function loadTreatmentHistory(queueId) {
            try {
                showLoading();
                
                const response = await fetch(`/patient/api/treatment-history/${queueId}`);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success && data.treatment) {
                    displayTreatmentHistory(data.treatment);
                } else {
                    showError(data.error || 'ไม่สามารถโหลดข้อมูลได้');
                }
                
            } catch (error) {
                console.error('Error:', error);
                showError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
            }
        }

        // แสดงผลข้อมูล
        function displayTreatmentHistory(treatment) {
            hideLoading();
            
            try {
                // Format dates
                const treatmentDate = new Date(treatment.time);
                
                // Date of Treatment
                document.getElementById('treatment-date').textContent = 
                    treatmentDate.toLocaleDateString('th-TH', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });

                // Booking ID
                document.getElementById('booking-id').textContent = `#Y-${treatment.queue_id.toString().padStart(6, '0')}`;

                // Patient Info
                document.getElementById('patient-name').textContent = 
                    `${treatment.patient_fname || ''} ${treatment.patient_lname || ''}`.trim() || '-';

                // Gender
                const genderMap = {
                    'male': 'ชาย',
                    'female': 'หญิง',
                    'other': 'อื่นๆ'
                };
                const genderElement = document.getElementById('patient-gender');
                genderElement.textContent = genderMap[treatment.gender] || '-';
                if (!treatment.gender) genderElement.classList.add('empty');

                // DOB
                const dobElement = document.getElementById('patient-dob');
                if (treatment.dob) {
                    const dob = new Date(treatment.dob);
                    dobElement.textContent = dob.toLocaleDateString('th-TH', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });
                } else {
                    dobElement.textContent = '-';
                    dobElement.classList.add('empty');
                }

                // Age
                const ageElement = document.getElementById('patient-age');
                if (treatment.dob) {
                    const age = calculateAge(new Date(treatment.dob));
                    ageElement.textContent = `${age} ปี`;
                } else {
                    ageElement.textContent = '-';
                    ageElement.classList.add('empty');
                }

                // ID Card
                const idCardElement = document.getElementById('patient-idcard');
                idCardElement.textContent = treatment.id_card || '-';
                if (!treatment.id_card) idCardElement.classList.add('empty');

                // Phone
                const phoneElement = document.getElementById('patient-phone');
                phoneElement.textContent = treatment.phone || '-';
                if (!treatment.phone) phoneElement.classList.add('empty');

                // Address
                const addressElement = document.getElementById('patient-address');
                addressElement.textContent = treatment.address || '-';
                if (!treatment.address) addressElement.classList.add('empty');

                // Chronic Disease
                const chronicElement = document.getElementById('chronic-disease');
                chronicElement.textContent = treatment.chronic_disease || 'ไม่มี';
                if (!treatment.chronic_disease) chronicElement.classList.add('empty');

                // Allergy History
                const allergyElement = document.getElementById('allergy-history');
                allergyElement.textContent = treatment.allergy_history || 'ไม่มี';
                if (!treatment.allergy_history) allergyElement.classList.add('empty');

                // Appointment Date
                document.getElementById('appointment-date').textContent = 
                    treatmentDate.toLocaleDateString('th-TH', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    });

                // Appointment Time
                const timeElement = document.getElementById('appointment-time');
                if (treatment.duration) {
                    const startTime = treatmentDate.toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    
                    const endDate = new Date(treatmentDate.getTime() + treatment.duration * 60000);
                    const endTime = endDate.toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    
                    timeElement.textContent = `${startTime} - ${endTime}`;
                } else {
                    timeElement.textContent = treatmentDate.toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                }

                // Treatment Name
                document.getElementById('treatment-name').textContent = treatment.treatment_name || '-';

                // Dentist Name
                document.getElementById('dentist-name').textContent = 
                    `ทพ. ${treatment.dentist_fname || ''} ${treatment.dentist_lname || ''}`.trim();

                // Diagnosis/Result
                const diagnosisElement = document.getElementById('diagnosis-result');
                if (treatment.treatment_diagnosis && treatment.treatment_diagnosis.trim()) {
                    diagnosisElement.innerHTML = `<div class="result-box">${treatment.treatment_diagnosis}</div>`;
                } else if (treatment.diagnosis && treatment.diagnosis.trim()) {
                    diagnosisElement.innerHTML = `<div class="result-box">${treatment.diagnosis}</div>`;
                } else {
                    diagnosisElement.textContent = 'ยังไม่มีข้อมูล';
                    diagnosisElement.classList.add('empty');
                }

                // Next Appointment
                const nextElement = document.getElementById('next-appointment');
                if (treatment.next_appointment_detail && treatment.next_appointment_detail.trim()) {
                    nextElement.innerHTML = `<div class="next-box">${treatment.next_appointment_detail}</div>`;
                } else if (treatment.next_appointment) {
                    const nextDate = new Date(treatment.next_appointment);
                    nextElement.innerHTML = `<div class="next-box">นัดครั้งต่อไป: ${nextDate.toLocaleDateString('th-TH', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                    })}</div>`;
                } else {
                    nextElement.textContent = 'ไม่มีนัดครั้งต่อไป';
                    nextElement.classList.add('empty');
                }
                
                // แสดงเนื้อหา
                document.getElementById('content-area').style.display = 'block';
                
            } catch (error) {
                console.error('Error displaying data:', error);
                showError('เกิดข้อผิดพลาดในการแสดงผลข้อมูล');
            }
        }

        function calculateAge(birthDate) {
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            return age;
        }

        // Show/Hide functions
        function showLoading() {
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('error').style.display = 'none';
            document.getElementById('content-area').style.display = 'none';
        }

        function hideLoading() {
            document.getElementById('loading').style.display = 'none';
        }

        function showError(message) {
            hideLoading();
            document.getElementById('error-text').textContent = message;
            document.getElementById('error').style.display = 'block';
            document.getElementById('content-area').style.display = 'none';
        }

        function retryLoad() {
            if (currentQueueId) {
                loadTreatmentHistory(currentQueueId);
            }
        }

        function goBack() {
            window.location.href = '/patient/my-treatments';
        }

        // UI Functions
        function toggleDropdown() {
            const menu = document.getElementById('profileDropdown');
            if (menu) {
                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function (e) {
            const prof = document.querySelector('.profile-dropdown');
            const dropdown = document.getElementById('profileDropdown');
            if (prof && !prof.contains(e.target) && dropdown) {
                dropdown.style.display = 'none';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                goBack();
            }
        });
    