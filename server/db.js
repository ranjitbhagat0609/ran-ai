// server/db.js – हार्डकोडेड (केवल लोकल टेस्टिंग के लिए)
const { createClient } = require('@supabase/supabase-js');
const postgres = require('postgres');

// ⚠️ इन्हें कभी GitHub पर push न करें – इन्हें बदल देंगे बाद में
const supabaseUrl = 'https://cnneiwpcbahbfojxeplq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNubmVpd3BjYmFoYmZvanhlcGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODE1MDEsImV4cCI6MjA5MDk1NzUwMX0.RWOT8FFFq22ml8WFYWxW9Od5-o7CRlugSCVqvr6pMVA';   // 🔐 Dashboard से कॉपी करें
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database connection string (पासवर्ड पहले बदल चुके हैं न?)
// पुराना पासवर्ड expose हो गया था – नया डालें
const sql = postgres('postgresql://postgres:Rk060920039801088930@db.cnneiwpcbahbfojxeplq.supabase.co:5432/postgres');

module.exports = { supabase, sql };
