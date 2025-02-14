require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret Key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// 🔹 Register User (Customer or Specialist)
router.post('/register', async (req, res) => {
    const { name, email, password, role, profile_pic } = req.body;

    try {
        // Validate role
        if (!['customer', 'specialist'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into Supabase users table
        const { data, error } = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword, role, profile_pic }])
            .select();

        if (error) throw error;

        res.status(201).json({ message: 'User registered successfully', user: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Login User (Generate JWT Token)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Fetch user from Supabase
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !users) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, users.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: users.id, role: users.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Middleware: Protect Routes (Verify Token)
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied, token missing' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user info to request
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// 🔹 Get User Profile (Protected Route)
router.get('/profile', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
