
import { createClient } from '@supabase/supabase-js';

async function checkSchema() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceRole);

  const { data, error } = await supabase.from('complaints').select('*').limit(1);
  if (error) {
    console.error('Error fetching complaints:', error);
  } else {
    console.log('Complaint columns:', Object.keys(data[0] || {}));
  }
}

checkSchema();
