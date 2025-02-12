/* eslint-disable no-undef */
const supabase = require("../config/supabase");

/**
 * User Sign-up
 */
const signUp = async (req, res) => {
  const { email, password, name, location, userType, specialty } = req.body;

  // Validate required fields
  if (!email || !password || !name || !location || !userType) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          location,
          userType,
          specialty: userType === "specialist" ? specialty || null : null,
        },
      },
    });

    if (error) throw error;

    res.status(201).json({ message: "User registered successfully!", user: data.user });
  } catch (error) {
    console.error("Sign-up Error:", error.message);
    res.status(400).json({ error: "Registration failed. Please try again." });
  }
};

/**
 * User Login
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    res.status(200).json({ message: "Login successful!", user: data.user });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(400).json({ error: "Invalid credentials. Please try again." });
  }
};

module.exports = { signUp, login };
