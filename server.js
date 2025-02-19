require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const specialistRoutes = require('./routes/specialistRoutes');
const bookingRoutes = require('./routes/bookingRoutes'); // 🔹 Import Booking Routes
const supabase = require('./config/supabase');

const app = express();

// 🔹 Middleware
app.use(cors());
app.use(bodyParser.json());

// 🔹 Routes
app.use('/api/auth', authRoutes); // Authentication
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
