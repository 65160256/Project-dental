const bcrypt = require('bcrypt');
const validator = require('validator');
const RegisterModel = require('../models/register.model');

// Enhanced validation function
function validateInput(data) {
    const errors = {};
    
    // First name validation
    if (!data.fname || !data.fname.trim()) {
        errors.fname = 'First name is required';
    } else if (data.fname.trim().length < 2) {
        errors.fname = 'First name must be at least 2 characters';
    } else if (!/^[a-zA-Zก-๙]+(\s[a-zA-Zก-๙]+)*$/.test(data.fname.trim())) {
        errors.fname = 'First name must contain only letters and single spaces';
    }
    
    // Last name validation
    if (!data.lname || !data.lname.trim()) {
        errors.lname = 'Last name is required';
    } else if (data.lname.trim().length < 2) {
        errors.lname = 'Last name must be at least 2 characters';
    } else if (!/^[a-zA-Zก-๙]+(\s[a-zA-Zก-๙]+)*$/.test(data.lname.trim())) {
        errors.lname = 'Last name must contain only letters and single spaces';
    }
    
    // Email validation
    if (!data.email || !data.email.trim()) {
        errors.email = 'Email is required';
    } else if (!validator.isEmail(data.email.trim())) {
        errors.email = 'Please provide a valid email address';
    }
    
    // Password validation
    if (!data.password) {
        errors.password = 'Password is required';
    } else if (data.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(data.password)) {
        errors.password = 'Password must contain uppercase, lowercase, and number';
    }
    
    // Confirm password
    if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
    }
    
    // Phone validation
    if (!data.phone || !data.phone.trim()) {
        errors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(data.phone.trim())) {
        errors.phone = 'Phone number must be exactly 10 digits';
    }
    
    // ID card validation
    if (!data.id_card || !data.id_card.trim()) {
        errors.id_card = 'ID card number is required';
    } else if (!/^\d{13}$/.test(data.id_card.trim())) {
        errors.id_card = 'ID card number must be exactly 13 digits';
    }
    
    // Date of birth validation
    if (!data.dob) {
        errors.dob = 'Date of birth is required';
    } else {
        const today = new Date();
        const birthDate = new Date(data.dob);
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        let calculatedAge = age;
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
        }
        
        if (calculatedAge < 18) {
            errors.dob = 'You must be at least 18 years old';
        } else if (calculatedAge > 120) {
            errors.dob = 'Invalid date of birth';
        }
    }
    
    // Address validation
    if (!data.address || !data.address.trim()) {
        errors.address = 'Address is required';
    } else if (data.address.trim().length < 10) {
        errors.address = 'Address must be at least 10 characters';
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// Main registration function
exports.registerPatient = async (req, res) => {
    try {
        console.log('Registration request received:', {
            email: req.body.email,
            fname: req.body.fname,
            lname: req.body.lname
        });

       const rawData = {
            fname: req.body.fname,
            lname: req.body.lname,
            email: req.body.email,
            password: req.body.password,
            confirmPassword: req.body.confirmPassword,
            phone: req.body.phone,
            dob: req.body.dob,
            address: req.body.address,
            id_card: req.body.id_card,
            gender: req.body.gender || null,
            chronic_disease: req.body.chronic_disease || null,
            allergy_history: req.body.allergy_history || null
        };

        
        // Validate input
        const validation = validateInput(rawData);
        if (!validation.isValid) {
            const errorMessage = Object.values(validation.errors).join(', ');
            console.log('Validation errors:', validation.errors);
            return res.redirect(`/register?error=invalid_data&message=${encodeURIComponent(errorMessage)}`);
        }
        
        // Clean data
        const cleanData = {
            fname: rawData.fname.trim().replace(/\s+/g, ' '),
            lname: rawData.lname.trim().replace(/\s+/g, ' '),
            email: rawData.email.trim().toLowerCase(),
            password: rawData.password,
            phone: rawData.phone.trim(),
            dob: rawData.dob,
            address: rawData.address.trim(),
            id_card: rawData.id_card.trim(),
            gender: rawData.gender ? String(rawData.gender).trim() : null,
            chronic_disease: rawData.chronic_disease ? String(rawData.chronic_disease).trim() : null,
            allergy_history: rawData.allergy_history ? String(rawData.allergy_history).trim() : null
        };
        
        // Check for duplicates (ใช้ Model)
        const duplicates = await RegisterModel.checkDuplicates(
            cleanData.email,
            cleanData.id_card
        );
        
        if (duplicates.emailExists) {
            console.log('Duplicate email detected:', cleanData.email);
            return res.redirect('/register?error=duplicate_email');
        }
        
        if (duplicates.idCardExists) {
            console.log('Duplicate ID card detected:', cleanData.id_card);
            return res.redirect('/register?error=duplicate_id');
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(cleanData.password, 12);
        
        console.log('Starting database transaction...');
        
        // สร้าง user และ patient ด้วย Transaction (ใช้ Model)
        const patientData = {
            fname: cleanData.fname,
            lname: cleanData.lname,
            dob: cleanData.dob,
            id_card: cleanData.id_card,
            address: cleanData.address,
            phone: cleanData.phone,
            gender: cleanData.gender,
            chronic_disease
: cleanData.chronic_disease
,
            allergy_history: cleanData.allergy_history
        };

        const userId = await RegisterModel.registerPatientWithTransaction(
            cleanData.email,
            hashedPassword,
            patientData
        );
        
        console.log('Transaction committed successfully');
        console.log(`✅ New patient registered successfully: ${cleanData.email} (User ID: ${userId})`);
        
        return res.redirect('/login?message=' + encodeURIComponent('Registration successful! Please log in with your credentials.'));
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle duplicate entry errors from database level
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('email')) {
                return res.redirect('/register?error=duplicate_email');
            } else if (error.message.includes('id_card')) {
                return res.redirect('/register?error=duplicate_id');
            }
        }
        
        return res.redirect('/register?error=server_error&message=' + encodeURIComponent('Registration failed. Please try again later.'));
    }
};

// API function for checking email availability
exports.checkEmailAvailability = async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }
        
        // ใช้ Model
        const exists = await RegisterModel.checkEmailExists(email);
        
        return res.json({
            success: true,
            available: !exists
        });
        
    } catch (error) {
        console.error('Email check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

// API function for checking ID card availability
exports.checkIdCardAvailability = async (req, res) => {
    try {
        const { id_card } = req.query;
        
        if (!id_card || !/^\d{13}$/.test(id_card)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid ID card format'
            });
        }
        
        // ใช้ Model
        const exists = await RegisterModel.checkIdCardExists(id_card);
        
        return res.json({
            success: true,
            available: !exists
        });
        
    } catch (error) {
        console.error('ID card check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

// Get patient statistics (สำหรับ Admin)
exports.getPatientStats = async (req, res) => {
    try {
        const totalPatients = await RegisterModel.getTotalPatientsCount();
        const recentPatients = await RegisterModel.getRecentPatients(10);
        
        res.json({
            success: true,
            data: {
                total: totalPatients,
                recent: recentPatients
            }
        });
    } catch (error) {
        console.error('Get patient stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch patient statistics'
        });
    }
};