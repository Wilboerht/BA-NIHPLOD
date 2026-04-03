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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEnums() {
  const { data, error } = await supabase
    .from('certificates')
    .select('status')
    .limit(10);
    
  if (error) {
    console.error('Error fetching certificates:', error);
    return;
  }
  
  const statuses = [...new Set(data.map(c => c.status))];
  console.log('Current statuses in database:', statuses);
}

checkEnums();
