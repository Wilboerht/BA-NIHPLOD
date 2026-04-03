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

async function checkSchema() {
  const { data: profiles, error } = await supabaseAdmin.from('profiles').select('*').limit(1);
  if (error) {
    console.log('Error fetching profiles:', error.message);
    return;
  }
  if (profiles && profiles.length > 0) {
    console.log('Columns in profiles:', Object.keys(profiles[0]));
  } else {
    console.log('No profiles found to check columns.');
  }

  const { data: dealers, error2 } = await supabaseAdmin.from('dealers').select('*').limit(1);
  if (dealers && dealers.length > 0) {
      console.log('Columns in dealers:', Object.keys(dealers[0]));
  }
}

checkSchema();
