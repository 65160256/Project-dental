const bcrypt = require('bcrypt');
const db = require('../config/db');
const validator = require('validator');

// Enhanced validation function
function validateInput(data) {
    const errors = {};
    
    // First name validation
    if (!data.fname || !data.fname.trim()) {
        errors.fname = 'First name is required';
    } else if (data.fname.trim().length < 2) {
        errors.fname = 'First name must be at least 2 characters';
    } else if (!/^[a-zA-Z]+(\s[a-zA-Z]+)*$/.test(data.fname.trim())) {
        errors.fname = 'First name must contain only letters and single spaces';
    }
    
    // Last name validation
    if (!data.lname || !data.lname.trim()) {
        errors.lname = 'Last name is required';
    } else if (data.lname.trim().length < 2) {
        errors.lname = 'Last name must be at least 2 characters';
    } else if (!/^[a-zA-Z]+(\s[a-zA-Z]+)*$/.test(data.lname.trim())) {
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

// Check for duplicates
async function checkDuplicates(email, id_card) {
    try {
        const [emailExists] = await db.execute(
            'SELECT user_id FROM user WHERE LOWER(email) = LOWER(?)',
            [email]
        );
        
        const [idCardExists] = await db.execute(
            'SELECT patient_id FROM patient WHERE id_card = ?',
            [id_card]
        );
        
        return {
            emailExists: emailExists.length > 0,
            idCardExists: idCardExists.length > 0
        };
    } catch (error) {
        console.error('Database error checking duplicates:', error);
        throw new Error('Database error occurred');
    }
}

// Main registration function
exports.registerPatient = async (req, res) => {
    let connection = null;
    
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
            id_card: req.body.id_card
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
            id_card: rawData.id_card.trim()
        };
        
        // Check for duplicates
        const duplicates = await checkDuplicates(cleanData.email, cleanData.id_card);
        
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
        
        // ✅ Fixed: Get connection and use proper transaction handling
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        console.log('Starting database transaction...');
        
        // Create user (role_id = 3 for patient)
        const [userResult] = await connection.execute(
            'INSERT INTO user (role_id, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
            [3, cleanData.email, hashedPassword]
        );
        
        const userId = userResult.insertId;
        console.log('User created with ID:', userId);
        
        // Create patient
        await connection.execute(`
            INSERT INTO patient (
                user_id, fname, lname, dob, id_card, address, phone,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            userId,
            cleanData.fname,
            cleanData.lname,
            cleanData.dob,
            cleanData.id_card,
            cleanData.address,
            cleanData.phone
        ]);
        
        console.log('Patient record created for user ID:', userId);
        
        // Commit transaction
        await connection.commit();
        console.log('Transaction committed successfully');
        
        console.log(`✅ New patient registered successfully: ${cleanData.email} (User ID: ${userId})`);
        return res.redirect('/login?message=' + encodeURIComponent('Registration successful! Please log in with your credentials.'));
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // Rollback transaction if connection exists
        if (connection) {
            try {
                await connection.rollback();
                console.log('Transaction rolled back');
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        
        // Handle duplicate entry errors from database level
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('email')) {
                return res.redirect('/register?error=duplicate_email');
            } else if (error.message.includes('id_card')) {
                return res.redirect('/register?error=duplicate_id');
            }
        }
        
        return res.redirect('/register?error=server_error&message=' + encodeURIComponent('Registration failed. Please try again later.'));
        
    } finally {
        // Release connection back to pool
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
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
        
        const [existing] = await db.execute(
            'SELECT user_id FROM user WHERE LOWER(email) = LOWER(?)',
            [email]
        );
        
        return res.json({
            success: true,
            available: existing.length === 0
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
        
        const [existing] = await db.execute(
            'SELECT patient_id FROM patient WHERE id_card = ?',
            [id_card]
        );
        
        return res.json({
            success: true,
            available: existing.length === 0
        });
        
    } catch (error) {
        console.error('ID card check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};