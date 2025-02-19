import express from 'express';
import supabase from '../config/supabase.js'; // Import Supabase client
import authenticateUser from '../middleware/authMiddleware.js'; // Import authentication middleware


// ✅ 1. Book an Appointment
router.post('/book', authenticateUser, async (req, res) => {
    try {
        const customerId = req.user.id; // Extract customer ID from token
        const { specialist_id, appointment_time, notes } = req.body;

        // Validate specialist exists
        const { data: specialist, error: specialistError } = await supabase
            .from('specialists')
            .select('id')
            .eq('id', specialist_id)
            .single();

        if (!specialist) return res.status(404).json({ error: "Specialist not found" });

        // Insert appointment
        const { data, error } = await supabase
            .from('appointments')
            .insert([{ customer_id: customerId, specialist_id, appointment_time, notes }])
            .select();

        if (error) return res.status(400).json({ error: error.message });

        res.status(201).json({ message: 'Appointment booked successfully', appointment: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 2. Get Customer's Appointments
router.get('/customer', authenticateUser, async (req, res) => {
    try {
        const customerId = req.user.id;

        const { data, error } = await supabase
            .from('appointments')
            .select('*')
            .eq('customer_id', customerId);

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ appointments: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 3. Get Specialist's Appointments
router.get('/specialist', authenticateUser, async (req, res) => {
    try {
        const specialistId = req.user.id;

        const { data: specialist, error: specialistError } = await supabase
            .from('specialists')
            .select('id')
            .eq('user_id', specialistId)
            .single();

        if (!specialist) return res.status(404).json({ error: "Specialist profile not found" });

        const { data, error } = await supabase
            .from('appointments')
            .select('*')
            .eq('specialist_id', specialist.id);

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ appointments: data });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 4. Specialist Confirms or Rejects Appointment
router.post('/update-status', authenticateUser, async (req, res) => {
    try {
        const specialistId = req.user.id;
        const { appointment_id, status } = req.body;

        // Validate specialist profile
        const { data: specialist, error: specialistError } = await supabase
            .from('specialists')
            .select('id')
            .eq('user_id', specialistId)
            .single();

        if (!specialist) return res.status(404).json({ error: "Specialist profile not found" });

        // Validate status
        if (!['confirmed', 'canceled', 'completed'].includes(status)) {
            return res.status(400).json({ error: "Invalid status update" });
        }

        // Update appointment status
        const { error } = await supabase
            .from('appointments')
            .update({ status })
            .eq('id', appointment_id)
            .eq('specialist_id', specialist.id);

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ message: `Appointment ${status} successfully` });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ 5. Customer Cancels an Appointment
router.post('/cancel', authenticateUser, async (req, res) => {
    try {
        const customerId = req.user.id;
        const { appointment_id } = req.body;

        // Update appointment status to 'canceled'
        const { error } = await supabase
            .from('appointments')
            .update({ status: 'canceled' })
            .eq('id', appointment_id)
            .eq('customer_id', customerId);

        if (error) return res.status(400).json({ error: error.message });

        res.status(200).json({ message: 'Appointment canceled successfully' });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
