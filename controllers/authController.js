const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

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
          specialty: userType === "specialist" ? specialty || null : null,
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

/**
 * User Logout
 */
const logout = async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    res.status(200).json({ message: "User logged out successfully!" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { signUp, login, logout };
