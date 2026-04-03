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

if (!supabaseUrl || !supabaseServiceRole) {
  console.error("Missing Superbase URL or Service Role key");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const email = 'hank.wang@nihplod.cn';
  const password = 'hank';

  console.log(`Creating user: ${email}...`);

  // Create auth identity user
  const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm email
  });

  if (error) {
    if (error.message.includes('already been registered')) {
        console.log("User already exists, attempting to delete and recreate...");
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
        const found = existingUser.users.find(u => u.email === email);
        if (found) {
            await supabaseAdmin.auth.admin.deleteUser(found.id);
            console.log("Deleted old incomplete user, trying again. Run this script once more.");
        }
        return;
    }
    console.error("Error creating user:", error);
    return;
  }

  console.log("Auth user created successfully!", user.user.id);
  
  // Set up profile
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: user.user.id,
    username: 'hank.wang',
    full_name: 'Hank Wang',
    role: 'SUPER_ADMIN',
    is_first_login: true,
  });

  if (profileError) {
     console.error("Error creating profile:", profileError);
     return;
  }

  console.log("Profile initialized! User successfully created.");
}

main();
