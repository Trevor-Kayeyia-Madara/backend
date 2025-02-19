require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());
app.use(cors());

// Supabase Config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret Key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

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

    // Compare hashed passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ message: "Invalid password." });
    }

    // Generate JWT Token
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "2h" });

    // Return user type and token
    res.status(200).json({ message: "Login successful", userType: user.userType, token });
});

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

// Server Listening
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
