const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
};

const signInWithPassword = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  return { data, error };
};

const authStateListener = () => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    console.log(event, session);
  });

  return () => data.subscription.unsubscribe();
};

module.exports = { signUp, signInWithPassword, signOut, getSession, authStateListener };
