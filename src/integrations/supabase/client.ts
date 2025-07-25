// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://lgnrptxlvsbbdxbsnghx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnbnJwdHhsdnNiYmR4YnNuZ2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MzU0MzQsImV4cCI6MjA2NzMxMTQzNH0.h9zUnsJvHsLTWEAdyDuBe7vVV-8fLEfATf9-WH-uwXU";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});