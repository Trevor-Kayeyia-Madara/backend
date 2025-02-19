const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 🔹 Load Supabase Credentials from .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY= process.env.SUPABASE_SERVICE_ROLE_KEY

// 🔹 Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY);

module.exports = supabase;
