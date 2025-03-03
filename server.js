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

// ✅ Validate Session (Now Includes Full Name)
app.get("/api/validate-session", authenticateToken, async (req, res) => {
    const userId = req.user.id;

    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name, email, userType")
        .eq("id", userId)
        .single();

    if (error || !user) {
        return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ loggedIn: true, user });
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

app.get("/api/specialists", async (req, res) => {
    try {
        const { search } = req.query; // Get search query

        let query = supabase
            .from("specialist_profile")
            .select("id, speciality, service_rates, rating, location, created_at, users!inner (full_name)")
            .order("id", { ascending: true });

        // Apply search filter if present
        if (search) {
            query = query.or(`speciality.ilike.%${search}%,location.ilike.%${search}%`);
        }

        const { data: specialists, error } = await query;

        if (error) {
            return res.status(500).json({ message: "Error fetching specialists.", error });
        }

        // Format response
        const formattedSpecialists = specialists.map(spec => ({
            id: spec.id,
            speciality: spec.speciality,
            service_rates: spec.service_rates,
            rating: spec.rating,
            location: spec.location,
            created_at: spec.created_at,
            full_name: spec.users?.full_name
        }));

        res.status(200).json(formattedSpecialists);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching specialists." });
    }
});

// ✅ Fetch Specialist Profile with Full Name
app.get("/api/specialists/:id", async (req, res) => {
    const specialistId = parseInt(req.params.id, 10);

    if (!specialistId) {
        return res.status(400).json({ error: "Invalid specialist ID" });
    }

    // Fetch specialist details with the associated user's full name
    const { data: specialist, error } = await supabase
        .from("specialist_profile")
        .select("id, user_id, speciality, service_rates, location, rating, users!inner(full_name)")
        .eq("id", specialistId)
        .single();

    if (error || !specialist) {
        return res.status(404).json({ error: "Specialist not found." });
    }

    res.json({
        id: specialist.id,
        full_name: specialist.users.full_name, // Ensure full_name is included
        speciality: specialist.speciality,
        service_rates: specialist.service_rates,
        location: specialist.location,
        rating: specialist.rating
    });
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

// ✅ Fetch Services by Speciality
app.get("/api/specialists/:id/services", async (req, res) => {
    const specialistId = parseInt(req.params.id, 10);

    if (!specialistId) {
        return res.status(400).json({ error: "Invalid specialist ID" });
    }

    // Fetch the specialist's speciality
    const { data: specialist, error: specialistError } = await supabase
        .from("specialist_profile")
        .select("speciality")
        .eq("id", specialistId)
        .single();

    if (specialistError || !specialist) {
        return res.status(404).json({ error: "Specialist not found." });
    }

    // Fetch services based on the speciality_id
    const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .eq("speciality_id", specialistId); // Match services with the speciality_id

    if (servicesError) {
        return res.status(500).json({ error: servicesError.message });
    }

    res.status(200).json(services);
});


app.get("/api/appointments/:appointmentId", async (req, res) => {
    const { appointment_id } = req.params;

    try {
        const { data: appointment, error } = await supabase
            .from("appointments")
            .select("id, customer_id, customer_name, specialist_name, service (name, price), date, time")
            .eq("id", appointment_id)
            .single();  // ✅ Fetch only one record

        if (error || !appointment) {
            return res.status(404).json({ error: "Appointment not found." });
        }

        if (!appointment.customer_id) {
            return res.status(500).json({ error: "customer_id is missing from response." });
        }

        res.json(appointment);
    } catch (error) {
        console.error("Error fetching appointment:", error);
        return res.status(500).json({ error: error.message || "Error fetching appointment details." });
    }
});
app.post("/api/appointments", authenticateToken, async (req, res) => {
    const { customer_id, customer_name, specialist_id, service_id, date, time } = req.body;
    
    if (!customer_name || !specialist_id || !service_id || !date || !time) {
        return res.status(400).json({ message: "All fields are required." });
    }

    // Convert time to a Date object
    const requestedTime = new Date(`${date}T${time}:00`);

    // Check for existing appointments within the 2-hour window
    const { data: existingAppointments, error } = await supabase
    .from("appointments")
    .select("time")
    .eq("date", date)
    .eq("specialist_id", specialist_id)
    .gte("time", new Date(requestedTime - 2 * 60 * 60 * 1000).toISOString())
    .lte("time", new Date(requestedTime + 2 * 60 * 60 * 1000).toISOString());
  
    if (error) {
        return res.status(500).json({ message: "Database error checking existing appointments." });
    }

    if (existingAppointments.length > 0) {
        return res.status(400).json({ message: "This time slot is unavailable. Please select a different time." });
    }

    // Proceed with booking since no conflicts
    const { data, error: insertError } = await supabase
        .from("appointments")
        insert([{ customer_id, customer_name, specialist_id, service_id, date, time, status: "Pending" }])
        .select();

    if (insertError) {
        return res.status(500).json({ message: "Error booking appointment." });
    }

    return res.status(201).json({ message: "Appointment booked successfully!", appointment: data });
});

app.put("/api/appointments/:id/update-status", authenticateToken, async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!appointmentId || !status) {
        return res.status(400).json({ error: "Invalid appointment ID or status" });
    }

    const { data, error } = await supabase
        .from("appointments")
        .update({ status })
        .eq("id", appointmentId)
        .select();

    if (error) {
        return res.status(500).json({ error: "Failed to update appointment status." });
    }

    res.json({ message: "Appointment status updated successfully.", data });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
