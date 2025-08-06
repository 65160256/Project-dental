const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin.controller');
const upload = require('../middlewares/upload');

// GET: Admin Dashboard
router.get('/dashboard', (req, res) => {
  if (!req.session.userId || req.session.role != 1) {
    return res.redirect('/login');
  }
  res.render('admin-dashboard');
});


router.get('/profile', adminController.getProfile); // ✅ เรียก controller แทน



router.post('/change-password', adminController.changePassword);

router.get('/appointments', adminController.viewAppointments);

router.get('/appointments/ajax', adminController.ajaxAppointments);
router.get('/appointments/week', adminController.renderWeekCalendar);

router.get('/dentists', adminController.viewDentists);
router.get('/dentists/add', adminController.addDentistForm);

router.post('/dentists/add', upload.single('photo'), adminController.addDentist);

router.get('/dentists/:id', adminController.viewDentist);
router.get('/dentists/:id/edit', adminController.editDentistForm);


router.post('/dentists/:id/edit', upload.single('photo'), adminController.editDentist);

router.get('/dentists/delete/:id', adminController.deleteDentist);

router.get('/dentists/:id/schedule', adminController.dentistSchedule);

router.get('/patients', adminController.getPatients); 
// แสดงหน้า patients ทั้งหมด
router.get('/admin/patients', adminController.listPatients);

// หน้าเพิ่ม patient
router.get('/patients/add', adminController.showAddPatientForm);
router.post('/patients/add', adminController.addPatient);

// หน้าแก้ไข patient
router.get('/patients/:id/edit', adminController.showEditPatientForm);
router.post('/patients/:id/edit', adminController.editPatient);

// ดูรายละเอียด patient
router.get('/patients/:id', adminController.viewPatient);


// ลบ patient
router.get('/patients/:id/delete', adminController.deletePatient);

router.get('/patients/:id/treatments', adminController.viewPatientTreatmentHistory);

// router.get('/patients/:patientId/treatments/:treatmentId', adminController.viewTreatmentDetail);
router.get('/patients/:id/treatments/:queueId', adminController.viewTreatmentDetails);


// -----treatments-------
router.get('/treatments', adminController.listTreatments);

// ✅ ต้องอยู่ก่อน /:id
router.get('/treatments/add', adminController.showAddTreatmentForm);
router.post('/treatments/add', adminController.addTreatment);

// แล้วค่อยตามด้วย
router.get('/treatments/:id', adminController.viewTreatment);

router.get('/treatments/:id/edit', adminController.showEditTreatmentForm);
router.post('/treatments/:id/edit', adminController.updateTreatment);

router.get('/treatments/:id/delete', adminController.deleteTreatment);

module.exports = router;
