const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
};

export const signInWithPassword = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

export const signInWithOtp = async (email) => {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: 'https://example.com/welcome' },
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  return { data, error };
};

export const authStateListener = () => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    console.log(event, session);

    switch (event) {
      case 'INITIAL_SESSION':
        // Handle initial session
        break;
      case 'SIGNED_IN':
        // Handle sign-in event
        break;
      case 'SIGNED_OUT':
        // Handle sign-out event
        break;
      case 'PASSWORD_RECOVERY':
        // Handle password recovery event
        break;
      case 'TOKEN_REFRESHED':
        // Handle token refreshed event
        break;
      case 'USER_UPDATED':
        // Handle user updated event
        break;
      default:
        break;
    }
  });

  return () => data.subscription.unsubscribe(); // Call this function to unsubscribe
};
