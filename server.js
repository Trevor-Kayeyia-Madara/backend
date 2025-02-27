require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ✅ Configure CORS
const corsOptions = {
    origin: "https://hair-specialist.vercel.app",
    methods: "GET,POST,PUT,DELETE,PATCH",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ Supabase Config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ✅ JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Middleware to Authenticate Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });

        req.user = user;
        next();
    });
};

// ✅ Validate Session
app.get("/api/validate-session", authenticateToken, (req, res) => {
    res.status(200).json({ loggedIn: true, userId: req.user.id });
});

// ✅ User Login
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    const { data: user, error } = await supabase
        .from("users")
        .select("id, email, password, userType")
        .eq("email", email)
        .single();

    if (error || !user || password !== user.password) {
        return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "2h" });
    res.status(200).json({ message: "Login successful", userType: user.userType, token, id: user.id });
});

// ✅ User Signup
app.post("/api/signup", async (req, res) => {
    const { full_name, email, password, userType } = req.body;
    if (!full_name || !email || !password || !userType) {
        return res.status(400).json({ message: "All fields are required." });
    }

    const { data: existingUser } = await supabase
        .from("users")
        .select("email")
        .eq("email", email)
        .single();

    if (existingUser) {
        return res.status(400).json({ message: "Email already registered." });
    }

    const { data: newUser, error } = await supabase
        .from("users")
        .insert([{ full_name, email, password, userType }])
        .select("id, email, userType")
        .single();

    if (error) {
        return res.status(500).json({ message: "Error creating user." });
    }

    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: "2h" });
    res.status(201).json({ message: "User registered successfully", token, userType: newUser.userType });
});

// ✅ Fetch User by ID
app.get("/api/users/:id", authenticateToken, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name, email, userType")
        .eq("id", userId)
        .single();

    if (error || !user) {
        return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(user);
});

// ✅ Fetch Customer by ID
app.get("/api/customers/:id", authenticateToken, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    const { data: customer, error } = await supabase
        .from("customers")
        .select("user_id, phone_number, address")
        .eq("user_id", customerId)
        .single();

    if (error || !customer) {
        return res.status(404).json({ error: "Customer not found." });
    }

    res.status(200).json(customer);
});

// ✅ Fetch All Specialists with Full Names
app.get("/api/specialists", async (req, res) => {
    const { data: specialists, error } = await supabase
        .from("specialist_profile")
        .select(`
            id, 
            user_id, 
            speciality, 
            service_rates, 
            location, 
            rating, 
            created_at, 
            users (full_name)  -- ✅ Join users table to get full_name
        `);

    if (error) {
        return res.status(500).json({ error: "Failed to fetch specialists." });
    }

    res.status(200).json(specialists);
});


// ✅ Fetch Specialist Profile
app.get("/api/specialists/:id", async (req, res) => {
    const specialistId = parseInt(req.params.id, 10);
    const { data: specialist, error } = await supabase
        .from("specialist_profile")
        .select("id, user_id, speciality, service_rates, location, rating")
        .eq("id", specialistId)
        .single();

    if (error || !specialist) {
        return res.status(404).json({ error: "Specialist profile not found." });
    }

    res.json(specialist);
});

// ✅ Update Specialist Profile
app.patch("/api/specialists/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const { full_name, email, speciality, service_rates, location } = req.body;

    if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid specialist ID." });
    }

    const { data, error } = await supabase
        .from("specialist_profile")
        .update({ full_name, email, speciality, service_rates, location, updated_at: new Date() })
        .eq("id", id)
        .select();

    if (error) {
        return res.status(500).json({ error: "Failed to update profile." });
    }

    res.json({ message: "Profile updated successfully.", data });
});

// ✅ Fetch Services
app.get("/api/services", async (req, res) => {
    const { specialistId } = req.query;
    if (!specialistId) {
        return res.status(400).json({ error: "Specialist ID is required" });
    }

    const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("specialist_id", specialistId);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json(data);
});

// ✅ Fetch Booked Dates
app.get("/api/booked-dates", async (req, res) => {
    const { data, error } = await supabase
        .from("appointments")
        .select("date");

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const bookedDates = data.map((appointment) => appointment.date);
    res.json(bookedDates);
});

// ✅ Create Appointment
app.post("/api/appointments", async (req, res) => {
    const { customer_name, specialist_id, service_id, date, time } = req.body;
    if (!customer_name || !date || !time) {
        return res.status(400).json({ error: "Customer name, date, and time are required" });
    }

    const { data, error } = await supabase
        .from("appointments")
        .insert([{ customer_name, specialist_id, service_id, date, time, status: "Pending" }])
        .select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Appointment booked successfully", appointment: data[0] });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
