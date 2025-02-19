require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Login API
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Fetch user from Supabase
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, password, userType")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ message: "Invalid email or user not found." });
    }

    // Compare hashed password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid password." });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, userType: user.userType }, JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({ token, userType: user.userType });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Register API (Optional: For creating new users)
app.post("/api/register", async (req, res) => {
  const { email, password, userType } = req.body;

  try {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password: hashedPassword, userType }]);

    if (error) {
      return res.status(400).json({ message: "Error creating user." });
    }

    res.status(201).json({ message: "User registered successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
