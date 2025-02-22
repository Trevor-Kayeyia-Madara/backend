require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// Configure CORS to allow your frontend domain
const corsOptions = {
    origin: "https://hair-specialist.vercel.app", // Allow only your frontend
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization"
};

app.use(cors(corsOptions)); // Apply CORS

// Supabase Config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret Key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });

        req.user = user; // Attach user info to request
        next();
    });
};

// Validate Session Route
app.get("/api/validate-session", authenticateToken, (req, res) => {
    res.status(200).json({ loggedIn: true, userId: req.user.id });
});
// Login Route
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    // Fetch user from Supabase
    const { data: user, error } = await supabase
        .from("users")
        .select("id, email, password, userType")
        .eq("email", email)
        .single();

    if (error || !user) {
        return res.status(401).json({ message: "Invalid email or user not found." });
    }

    console.log("Stored password in DB:", user.password);  // Debugging

    // Compare passwords (no hashing)
    if (password !== user.password) {
        return res.status(401).json({ message: "Invalid password." });
    }

    // Generate JWT Token
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "2h" });

    res.status(200).json({ message: "Login successful", userType: user.userType, token });
});

// Update Password Route (Protected)
app.put("/api/update-password", authenticateToken, async (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ message: "New password is required." });
    }

    try {
        const userId = req.user.id;

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password in Supabase
        const { error } = await supabase
            .from("users")
            .update({ password: hashedPassword })
            .eq("id", userId);

        if (error) {
            console.error("Supabase Update Error:", error);
            return res.status(500).json({ message: "Error updating password." });
        }

        res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
        console.error("Update Password Error:", error);
        res.status(500).json({ message: "Server error while updating password." });
    }
});
// Signup Route
app.post("/api/signup", async (req, res) => {
    const { full_name, email, password, userType } = req.body;

    if (!full_name || !email || !password || !userType) {
        return res.status(400).json({ message: "All fields are required." });
    }

    try {
        // Check if user already exists
        const { data: existingUser, error: existingError } = await supabase
            .from("users")
            .select("email")
            .eq("email", email)
            .single();

        if (existingUser) {
            return res.status(400).json({ message: "Email already registered." });
        }

        // Insert new user into Supabase (plaintext password)
        const { data: newUser, error: insertError } = await supabase
            .from("users")
            .insert([{ full_name, email, password, userType }]) // Password is stored as plaintext
            .select("id, email, userType")
            .single();

        if (insertError) {
            console.error("Supabase Insert Error:", insertError);
            return res.status(500).json({ message: "Error creating user." });
        }

        // Generate JWT Token
        const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: "2h" });

        res.status(201).json({ message: "User registered successfully", token, userType: newUser.userType });

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Server error during signup." });
    }
});
// Get User Route (Protected)
app.get("/api/user", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch user details from Supabase
        const { data: user, error } = await supabase
            .from("users")
            .select("id, email, userType")
            .eq("id", userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user details." });
    }
});

app.get("/api/specialists", async (req, res) => {
    try {
        // Fetch specialists, properly joining with the users table
        const { data: specialists, error } = await supabase
            .from("specialist_profile")
            .select("id, speciality, service_rates, location, created_at, users!inner (full_name)")
            .order("id", { ascending: true }); // Ensure ordered results

        if (error) {
            return res.status(500).json({ message: "Error fetching specialists.", error });
        }

        // Format the response to include full_name properly
        const formattedSpecialists = specialists.map(spec => ({
            id: spec.id,
            speciality: spec.speciality,
            service_rates: spec.service_rates,
            location: spec.location,
            created_at: spec.created_at,
            full_name: spec.users?.full_name // Get full_name from users
        }));

        res.status(200).json(formattedSpecialists);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching specialists." });
    }
});

app.get("/api/specialists/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Fetch user first
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("id", id)
            .single();

        if (userError) throw userError;
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Fetch specialist profile
        const { data: profile, error: profileError } = await supabase
            .from("specialist_profile")
            .select("*")
            .eq("user_id", id)
            .single();

        if (profileError) throw profileError;
        if (!profile) {
            return res.status(404).json({ message: "Specialist profile not found" });
        }

        // Merge both objects and send response
        res.json({ ...user, ...profile });
    } catch (err) {
        console.error("Error fetching specialist profile:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


// Get all services
app.get("/api/services", async (req, res) => {
  try {
    const { data, error } = await supabase.from("services").select("*");
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 
 * Get Booked Dates
 * Fetches all appointments and returns booked dates
 */
app.get("/api/booked-dates", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("date");

    if (error) throw error;

    const bookedDates = data.map((appointment) => appointment.date);
    res.json(bookedDates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create Appointment
 * Adds a new appointment to the database
 */
app.post("/api/appointments", async (req, res) => {
  const { customer_id, specialist_id, service_id, date, time, status } = req.body;

  if (!date || !time || !status) {
    return res.status(400).json({ error: "Date, time, and status are required" });
  }

  try {
    const { data, error } = await supabase
      .from("appointments")
      .insert([{ customer_id, specialist_id, service_id, date, time, status }])
      .select();

    if (error) throw error;

    res.status(201).json({ message: "Appointment booked successfully", appointment: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
