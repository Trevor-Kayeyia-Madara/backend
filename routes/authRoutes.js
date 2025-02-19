import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient} from '@supabase/supabase-js';
import authenticateUser from '../middleware/authMiddleware';
const router = express.Router();

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret Key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

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
        const { data: user, error: userError } = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword, role, profile_pic }])
            .select()
            .single();

        if (userError) throw userError;

        // If user is a specialist, create an empty profile
        if (role === 'specialist') {
            const { error: specialistError } = await supabase
                .from('specialists')
                .insert([{ user_id: user.id, expertise: '', location: '', pricing: '{}', bio: '', available_hours: '{}', portfolio_images: [] }]);

            if (specialistError) throw specialistError;
        }

        res.status(201).json({ message: 'User registered successfully', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Update Specialist Profile (Protected Route)
router.post('/update-specialist', authenticateUser, async (req, res) => {
    const { expertise, location, pricing, bio, available_hours, portfolio_images } = req.body;

    try {
        // Ensure user is a specialist
        if (req.user.role !== 'specialist') {
            return res.status(403).json({ error: 'Access denied. Only specialists can update their profile.' });
        }

        // Update specialist profile
        const { error } = await supabase
            .from('specialists')
            .update({
                expertise,
                location,
                pricing: JSON.stringify(pricing),
                bio,
                available_hours: JSON.stringify(available_hours),
                portfolio_images
            })
            .eq('user_id', req.user.userId);

        if (error) throw error;

        res.json({ message: 'Specialist profile updated successfully' });
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

export default router;