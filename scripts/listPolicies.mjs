import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
envLines.forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    if (!process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

async function listPolicies() {
  const { data, error } = await supabaseAdmin.rpc('exec_sql', {
    sql_query: "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public'"
  });
  
  if (error) {
     // If exec_sql is not available, we can try a different trick.
     // Some projects enable a view or we can use the 'postgres' schema if allowed.
     console.log('Error fetching policies (probably RPC missing):', error.message);
     return;
  }
  
  console.log('--- Current RLS Policies ---');
  data.forEach(p => {
     console.log(`${p.tablename.padEnd(20)} | ${p.policyname.padEnd(30)} | ${p.cmd}`);
  });
}

listPolicies();
