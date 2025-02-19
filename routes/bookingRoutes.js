import express from 'express';
import supabase from '../config/supabase.js';
import authenticateUser from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔹 Create a New Booking (Customer only)
router.post('/book', authenticateUser, async (req, res) => {
    const { specialist_id, service, appointment_time } = req.body;

    try {
        // Ensure user is a customer
        if (req.user.role !== 'customer') {
            return res.status(403).json({ error: 'Only customers can book appointments' });
        }

        // Insert booking
        const { data, error } = await supabase
            .from('bookings')
            .insert([{ 
                customer_id: req.user.userId, 
                specialist_id, 
                service, 
                appointment_time 
            }]);

        if (error) throw error;

        res.status(201).json({ message: 'Booking request sent', booking: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Accept or Reject a Booking (Specialist only)
router.put('/update-booking/:booking_id', authenticateUser, async (req, res) => {
    const { booking_id } = req.params;
    const { status } = req.body;

    try {
        // Ensure user is a specialist
        if (req.user.role !== 'specialist') {
            return res.status(403).json({ error: 'Only specialists can accept/reject bookings' });
        }

        // Validate status
        if (!['confirmed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Update booking status
        const { error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', booking_id)
            .eq('specialist_id', req.user.userId);

        if (error) throw error;

        res.json({ message: `Booking ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Get All Bookings for a Specialist
router.get('/specialist-bookings', authenticateUser, async (req, res) => {
    try {
        // Ensure user is a specialist
        if (req.user.role !== 'specialist') {
            return res.status(403).json({ error: 'Only specialists can view bookings' });
        }

        // Fetch bookings
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('specialist_id', req.user.userId);

        if (error) throw error;

        res.json({ bookings: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔹 Get All Bookings for a Customer
router.get('/customer-bookings', authenticateUser, async (req, res) => {
    try {
        // Ensure user is a customer
        if (req.user.role !== 'customer') {
            return res.status(403).json({ error: 'Only customers can view bookings' });
        }

        // Fetch bookings
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('customer_id', req.user.userId);

        if (error) throw error;

        res.json({ bookings: data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router; // ✅ Correct ES Module export
