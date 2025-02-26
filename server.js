require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const http = require("http"); // Import HTTP module

const app = express(); // Initialize Express first
const server = http.createServer(app); // Create HTTP server after initializing app
const io = new Server(server, { cors: { origin: "https://hair-specialist.vercel.app" } });

app.use(express.json());
// Configure CORS to allow your frontend domain
const corsOptions = {
    origin: "https://hair-specialist.vercel.app", // Allow only your frontend
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true
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

app.get("/api/users/:customerId", authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.customerId, 10); // Ensure customerId is a number

        if (req.user.id !== userId) {
            return res.status(403).json({ message: "Access denied. You can only access your own details." });
        }

        // Fetch user details and check if the userType is "customer"
        const { data: user, error } = await supabase
            .from("users")
            .select("id, userType, full_name") // Include full_name in the query
            .eq("id", userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.userType !== "customer") {
            return res.status(403).json({ message: "Access denied. Only customers can access this route." });
        }

        return res.status(200).json({ id: user.id, full_name: user.full_name, userType: user.userType });
    } catch (error) {
        console.error("Error fetching customer details:", error);
        return res.status(500).json({ message: "Internal server error." });
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
app.put("/api/users/:customerId", authenticateToken, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { full_name, email } = req.body;

        if (req.user.id !== parseInt(customerId)) {
            return res.status(403).json({ message: "Unauthorized to update this profile" });
        }

        const { data, error } = await supabase
            .from("users")
            .update({ full_name, email })
            .eq("id", customerId)
            .select();

        if (error) throw error;

        res.status(200).json(data[0]);
    } catch (error) {
        console.error("Profile Update Error:", error);
        res.status(500).json({ message: "Failed to update profile." });
    }
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
    const { id } = req.params;

    // Convert id to an integer if necessary
    const specialistId = parseInt(id, 10);
    if (isNaN(specialistId)) {
        return res.status(400).json({ error: "Invalid specialist ID" });
    }

    try {
        // Step 1: Find the specialist profile using `id` from specialist_profile table
        const { data: specialistProfile, error: profileError } = await supabase
            .from("specialist_profile")
            .select("id, user_id, speciality, service_rates, location, rating, created_at")
            .eq("id", specialistId) // Fetch using the specialist_profile ID
            .single();

        if (profileError || !specialistProfile) {
            return res.status(404).json({ error: "Specialist profile not found." });
        }

        // Extract user_id from specialistProfile
        const userId = specialistProfile.user_id;

        // Step 2: Fetch the user details (name, email) using user_id
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, full_name, email, userType, created_at")
            .eq("id", userId)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: "User not found." });
        }

        // Step 3: Combine user details with specialist profile data
        const responseData = {
            specialistId: specialistProfile.id, // Specialist ID from specialist_profile table
            userId: user.id, // User ID from users table
            full_name: user.full_name,
            email: user.email,
            userType: user.userType,
            created_at: user.created_at,
            speciality: specialistProfile.speciality,
            service_rates: specialistProfile.service_rates,
            location: specialistProfile.location,
            rating: specialistProfile.rating,
        };

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching specialist profile:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

 // Update Specialist Profile
// Update specialist profile
app.put("/api/specialists/:id", async (req, res) => {
    const { id } = req.params;
    const { full_name, email, speciality, service_rates, location } = req.body;

    try {
        // Update specialist profile in Supabase
        const { data, error } = await supabase
            .from("specialist_profile")
            .update({
                full_name,
                email,
                speciality,
                service_rates,
                location,
                updated_at: new Date(), // Track last update timestamp
            })
            .eq("id", id)
            .select();

        if (error) {
            throw error;
        }

        res.json({ message: "Profile updated successfully.", data });
    } catch (error) {
        console.error("Error updating profile:", error.message);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

app.get("/api/services", async (req, res) => {
    const { specialistId } = req.query;
  
    if (!specialistId) {
      return res.status(400).json({ error: "Specialist ID is required" });
    }
  
    try {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("specialist_id", specialistId); // Filter by specialist_id
  
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
    const { customer_name, customer_id, specialist_id, service_id, date, time, status } = req.body;
  
    if (!customer_name || !date || !time) {
      return res.status(400).json({ error: "Customer name, date, and time are required" });
    }
  
    try {
      // Insert appointment with initial status as "Pending"
      const { data: insertedData, error: insertError } = await supabase
        .from("appointments")
        .insert([{ customer_name, specialist_id, service_id, date, time, status: "Pending" }])
        .select();
  
      if (insertError) throw insertError;
  
      const appointmentId = insertedData[0].id;
  
      // Update status from "Pending" to "Booked"
      const { error: updateError } = await supabase
        .from("appointments")
        .update({ status: "Booked" })
        .eq("id", appointmentId);
  
      if (updateError) throw updateError;
  
      res.status(201).json({
        message: "Appointment booked successfully",
        appointment: { ...insertedData[0], status: "Booked" },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;

    // Validate the appointment ID
    if (!id) {
        return res.status(400).json({ message: "❌ Appointment ID is required." });
    }

    try {
        // Fetch appointment from the database
        const { data, error } = await supabase
            .from("appointments")
            .select("*")
            .eq("id", id)
            .single(); // Fetch a single record

        if (error || !data) {
            console.error("❌ Error fetching appointment:", error);
            return res.status(404).json({ message: "⚠️ Appointment not found." });
        }

        // Return the appointment details
        return res.status(200).json(data);
    } catch (error) {
        console.error("❌ Server error:", error);
        return res.status(500).json({ message: "⚠️ Internal server error." });
    }
});


// ✅ **Real-time chat setup**
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Handle user joining a chat room
    socket.on("joinRoom", ({ customerId, specialistId }) => {
        const roomId = [customerId, specialistId].sort().join("_");
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    // Handle sending messages
    socket.on("sendMessage", async ({ senderId, receiverId, message }) => {
        const roomId = [senderId, receiverId].sort().join("_");

        // Save message to Supabase
        const { data, error } = await supabase
            .from("messages")
            .insert([{ sender_id: senderId, receiver_id: receiverId, content: message }])
            .select();

        if (error) {
            console.error("Error saving message:", error);
            return;
        }

        // Emit the message to the room
        io.to(roomId).emit("receiveMessage", { senderId, receiverId, message, timestamp: new Date().toISOString() });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// ✅ **API Route to Fetch Chat History**
app.get("/api/chat/:customerId/:specialistId", authenticateToken, async (req, res) => {
    const { customerId, specialistId } = req.params;

    try {
        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .or(`sender_id.eq.${customerId},receiver_id.eq.${customerId}`)
            .or(`sender_id.eq.${specialistId},receiver_id.eq.${specialistId}`)
            .order("created_at", { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));