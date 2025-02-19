const router = express.Router();
import express from 'express';
import supabase from '../config/supabase';
import authenticateUser from '../middleware/authMiddleware';

// ✅ 1. Update Specialist Profile
router.post('/update', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id; // Extract user ID from token
        const { expertise, location, pricing, bio, available_hours, portfolio_images } = req.body;

        // Ensure the user exists in the specialists table
        const { data: specialist, error: fetchError } = await supabase
            .from('specialists')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: "Specialist profile not found" });
        }

        // Update specialist profile
        const { data, error } = await supabase
            .from('specialists')
            .update({ expertise, location, pricing, bio, available_hours, portfolio_images })
            .eq('user_id', userId)
            .select();

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ message: 'Profile updated successfully', specialist: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 2. Get a Specialist's Profile
router.get('/profile/:id', async (req, res) => {
    try {
        const specialistId = req.params.id;

        const { data, error } = await supabase
            .from('specialists')
            .select('*')
            .eq('id', specialistId)
            .single();

        if (error) return res.status(404).json({ error: "Specialist not found" });

        res.status(200).json({ specialist: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 3. Get All Specialists (With Search & Filters)
router.get('/all', async (req, res) => {
    try {
        const { expertise, location, minRating } = req.query;

        let query = supabase.from('specialists').select('*');

        if (expertise) query = query.ilike('expertise', `%${expertise}%`);
        if (location) query = query.ilike('location', `%${location}%`);
        if (minRating) query = query.gte('rating', parseFloat(minRating));

        const { data, error } = await query;

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ specialists: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 4. Delete Specialist Profile
router.delete('/delete', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;

        const { error } = await supabase
            .from('specialists')
            .delete()
            .eq('user_id', userId);

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ message: 'Specialist profile deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;