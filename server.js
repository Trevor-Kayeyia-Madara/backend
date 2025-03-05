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
app.get("/api/validate-session", authenticateToken, async (req, res) => {
    const { data: user, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", req.user.id)
        .single();

    if (error || !user) {
        return res.status(404).json({ message: "User not found." });
    }
      // ✅ Fetch `customer_id`
    const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .single();

if (customerError) {
    return res.status(500).json({ message: "Failed to fetch customer ID" });
}

res.status(200).json({ loggedIn: true, user, customerId: customer.id });
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

app.get("/api/customers/:id", authenticateToken, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);

    const { data: customer, error } = await supabase
        .from("customers")
        .select("user_id, phone_number, address, users(full_name)")
        .eq("user_id", customerId)
        .single();

    if (error || !customer) {
        return res.status(404).json({ error: "Customer not found." });
    }

    res.status(200).json({
        user_id: customer.user_id,
        phone_number: customer.phone_number,
        address: customer.address,
        full_name: customer.users.full_name
    });
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

app.get("/api/specialists/:id", async (req, res) => {
    const specialistId = parseInt(req.params.id, 10);

    const { data: specialist, error } = await supabase
        .from("specialist_profile")
        .select("id, user_id, speciality, service_rates, location, rating, users(full_name)")
        .eq("id", specialistId)
        .single();

    if (error || !specialist) {
        return res.status(404).json({ error: "Specialist profile not found." });
    }

    res.json({
        id: specialist.id,
        speciality: specialist.speciality,
        service_rates: specialist.service_rates,
        location: specialist.location,
        rating: specialist.rating,
        full_name: specialist.users.full_name
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

// API to fetch services offered by a specific specialist
app.get("/api/specialists/:id/services", async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
        .from("services")
        .select("id, name, description, prices")
        .eq("speciality_id", id);

    if (error) {
        return res.status(500).json({ error: "Error fetching services." });
    }

    res.json(data);
});
app.get("/api/appointments/:id", async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);

    // Fetch appointment details from the database
    const { data: appointment, error } = await supabase
        .from("appointments")
        .select("id, customer_id, specialist_id, service_id, date, time, status")
        .eq("id", appointmentId)
        .single();

    if (error || !appointment) {
        return res.status(404).json({ error: "Appointment not found." });
    }

    res.status(200).json(appointment);
});


// API to create an appointment with validation
app.post("/api/appointments", async (req, res) => {
    const { customer_id, specialist_id, service_id, date, time, status } = req.body;

    if (!customer_id || !date || !time || !specialist_id || !service_id || !status) {
        return res.status(400).json({ error: "All fields are required" });
    }

    // Fetch specialist's working hours
    const { data: specialist, error: specialistError } = await supabase
        .from("specialist_profile")
        .select("opening_time, closing_time")
        .eq("id", specialist_id)
        .single();

    if (specialistError || !specialist) {
        return res.status(404).json({ error: "Specialist profile not found" });
    }

    const selectedTime = parseInt(time.split(":")[0]);
    const openingTime = parseInt(specialist.opening_time.split(":")[0]);
    const closingTime = parseInt(specialist.closing_time.split(":")[0]);

    if (selectedTime < openingTime || selectedTime >= closingTime) {
        return res.status(400).json({ error: "Selected time is outside working hours." });
    }

    // Check for overlapping appointments (2-hour rule)
    const { data: existingAppointments, error: appointmentError } = await supabase
        .from("appointments")
        .select("time")
        .eq("specialist_id", specialist_id)
        .eq("date", date);

    if (appointmentError) {
        return res.status(500).json({ error: "Error checking existing appointments" });
    }

    for (const appointment of existingAppointments) {
        const bookedHour = parseInt(appointment.time.split(":")[0]);
        if (selectedTime >= bookedHour && selectedTime < bookedHour + 2) {
            return res.status(400).json({ error: "Time slot already booked. Choose another time." });
        }
    }

    // Insert new appointment
    const { data, error } = await supabase
        .from("appointments")
        .insert([{ customer_id, specialist_id, service_id, date, time, status, created_at: new Date() }])
        .select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Appointment booked successfully", appointment: data[0] });
});

app.post("/api/reviews", authenticateToken, async (req, res) => {
    const { customer_id, specialist_id, rating, review } = req.body;

    if (!customer_id || !specialist_id || !rating || !review) {
        return res.status(400).json({ error: "All fields are required." });
    }
    if (!rating || rating < 1.0 || rating > 5.0) {
        return res.status(400).json({ error: "Rating must be between 1.0 and 5.0" });
    }
    
    try {
        // ✅ Insert review into Supabase (Use correct column name `review`)
        const { data: reviewData, error: reviewError } = await supabase
            .from("reviews")
            .insert([{ customer_id, specialist_id, rating, review }]) // ✅ Fix column name here
            .select()
            .single();

        if (reviewError) {
            return res.status(500).json({ error: "Failed to save review.", details: reviewError.message });
        }

        // ✅ Calculate new average rating for the specialist
        const { data: reviews, error: fetchError } = await supabase
            .from("reviews")
            .select("rating")
            .eq("specialist_id", specialist_id);

        if (fetchError) {
            return res.status(500).json({ error: "Failed to calculate rating.", details: fetchError.message });
        }

        const totalRatings = reviews.length;
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

        // ✅ Update specialist rating
        const { error: updateError } = await supabase
            .from("specialist_profile")
            .update({ rating: avgRating })
            .eq("id", specialist_id);

        if (updateError) {
            return res.status(500).json({ error: "Failed to update specialist rating.", details: updateError.message });
        }

        res.status(201).json({ message: "Review submitted successfully!", review: reviewData });
    } catch (error) {
        res.status(500).json({ error: "Server error submitting review.", details: error.message });
    }
});

app.get("/api/reviews", async (req, res) => {
    try {
        const { data: reviews, error } = await supabase
            .from("reviews")
            .select("id, customer_id, specialist_id, rating, review, created_at") // ✅ Fix column name

            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({ error: "Error fetching reviews.", details: error.message });
        }

        res.status(200).json(reviews);
    } catch (error) {
        res.status(500).json({ error: "Server error while fetching reviews.", details: error.message });
    }
});

// ✅ Fetch Existing Review for Customer & Specialist
app.get("/api/reviews/:customer_id/:specialist_id", async (req, res) => {
    const { customer_id, specialist_id } = req.params;

    try {
        const { data: review, error } = await supabase
            .from("reviews")
            .select("id, rating, review")
            .eq("customer_id", customer_id)
            .eq("specialist_id", specialist_id)
            .single();

        if (error && error.code !== "PGRST116") { // Ignore no-data error
            return res.status(500).json({ error: "Error fetching review." });
        }

        res.status(200).json(review || null);
    } catch (error) {
        res.status(500).json({ error: "Server error while fetching review." });
    }
});

// ✅ Update Existing Review
app.put("/api/reviews", authenticateToken, async (req, res) => {
    const { customer_id, specialist_id, rating, review } = req.body;

    try {
        const { data, error } = await supabase
            .from("reviews")
            .update({ rating, review, created_at: new Date() })
            .eq("customer_id", customer_id)
            .eq("specialist_id", specialist_id)
            .select();

        if (error) {
            return res.status(500).json({ error: "Failed to update review." });
        }

        res.status(200).json({ message: "Review updated successfully!", data });
    } catch (error) {
        res.status(500).json({ error: "Server error updating review." });
    }
});

// ✅ Fetch Appointments for Logged-in Customer
app.get("/api/customers/:id/appointments", authenticateToken, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);

    try {
        // ✅ Fix the join with `specialist_profile`
        const { data: appointments, error } = await supabase
            .from("appointments")
            .select(`
                id, 
                date, 
                time, 
                status, 
                specialist_profile!specialist_id (full_name, speciality) 
            `)
            .eq("customer_id", customerId)
            .order("date", { ascending: false });

        if (error) {
            return res.status(500).json({ error: "Failed to fetch appointments.", details: error.message });
        }

        res.status(200).json(appointments);
    } catch (error) {
        res.status(500).json({ error: "Server error while fetching appointments.", details: error.message });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));