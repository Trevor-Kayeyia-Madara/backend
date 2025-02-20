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

app.post("/api/login", async (req, res) => {
    try {
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
            console.log("User fetch error:", error);
            return res.status(401).json({ message: "Invalid email or user not found." });
        }

        console.log("User fetched:", user);

        // Ensure the password is hashed in the database
        if (!user.password.startsWith("$2b$")) {
            console.log("Stored password is not hashed:", user.password);
            return res.status(500).json({ message: "Password format error." });
        }

        // Compare hashed passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log("Password does not match for user:", user.email);
            return res.status(401).json({ message: "Invalid password." });
        }

        // Generate JWT Token
        if (!JWT_SECRET) {
            console.log("JWT_SECRET is not defined.");
            return res.status(500).json({ message: "Server configuration error." });
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "2h" });

        console.log("User logged in successfully:", user.email);
        res.status(200).json({ message: "Login successful", userType: user.userType, token });

    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ message: "Internal server error." });
    }
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

        // Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user into Supabase
        const { data: newUser, error: insertError } = await supabase
            .from("users")
            .insert([{ full_name, email, password: hashedPassword, userType }])
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
// Get All Specialists
app.get("/api/specialists", async (req, res) => {
    try {
        // Fetch specialists from Supabase
        const { data: specialists, error } = await supabase
            .from("specialist_profile")
            .select("*"); // Select all fields from the table

        if (error) {
            return res.status(500).json({ message: "Error fetching specialists." });
        }

        res.status(200).json(specialists);
    } catch (error) {
        res.status(500).json({ message: "Server error while fetching specialists." });
    }
});

// Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
