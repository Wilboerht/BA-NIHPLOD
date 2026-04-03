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

async function listProfiles() {
  const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*');
  if (error) {
    console.log('Error fetching profiles:', error.message);
    return;
  }
  console.log('--- Current Profiles ---');
  profiles.forEach(p => {
    console.log(`${p.role.padEnd(15)} | ${p.username.padEnd(20)} | first_login: ${p.is_first_login} | id: ${p.id}`);
  });
}

listProfiles();
