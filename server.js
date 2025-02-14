require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const authRoutes = require('./routes/authRoutes'); // Import auth routes

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes); // Authentication routes

// Root Route
app.get('/', (req, res) => {
    res.send('Welcome to The Online Hair Specialist Finder API!');
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
