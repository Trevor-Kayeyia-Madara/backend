import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

// 🔹 Load Supabase Credentials from .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔹 Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

export default supabase; // ✅ Correct ESM export
