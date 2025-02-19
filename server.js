import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/authRoutes.js';
import specialistRoutes from './routes/specialistRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js'; // 🔹 Import Booking Routes
import supabase from './config/supabase.js';
import appointmentsRoutes from './routes/appointmentsRoutes.js';

const app = express();

// 🔹 Middleware
app.use(cors());
app.use(bodyParser.json());

// 🔹 Routes
app.use('/api/auth', authRoutes); // Authentication
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/specialists', specialistRoutes); // Specialist Profile Setup
app.use('/api/bookings', bookingRoutes); // Booking & Scheduling

// 🔹 Default Route
app.get('/', (req, res) => {
    res.send('Welcome to the Hair Specialist Booking API 🚀');
});

// 🔹 Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
