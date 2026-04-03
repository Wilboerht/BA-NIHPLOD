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

async function checkUser(email) {
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  if (!user) {
    console.log(`User ${email} not found in Auth!`);
    return;
  }
  console.log(`Found user in Auth: ${user.id} (${user.email})`);
  
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();
  if (profileError) {
    console.log(`Profile for user ${user.id} NOT found or error:`, profileError.message);
  } else {
    console.log(`Profile role: ${profile.role}`);
    console.log('Full profile:', profile);
  }
}

checkUser('hank.wang@nihplod.cn');
