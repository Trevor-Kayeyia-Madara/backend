/* eslint-disable no-undef */
const supabase = require("../supabase");

/**
 * User Sign-up
 */
const signUp = async (req, res) => {
  const { email, password, name, location, userType, specialty } = req.body;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          location,
          userType,
          specialty: userType === "specialist" ? specialty : null,
        },
      },
    });

    if (error) throw error;

    res.status(201).json({ message: "User registered successfully!", user: data.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * User Login
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    res.status(200).json({ message: "Login successful!", user: data.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { signUp, login };
