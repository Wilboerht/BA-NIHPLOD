import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const verifyRoutePath = path.join(rootDir, 'app/api/certificates/verify/route.ts');
let verifyContent = fs.readFileSync(verifyRoutePath, 'utf8');

verifyContent = verifyContent.replace(
  `import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';`,
  `import { NextResponse } from 'next/server';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';`
);

verifyContent = verifyContent.replace(
  /const supabaseUrl = process\.env\.NEXT_PUBLIC_SUPABASE_URL!;.*?final_image_url\n\s+`\)\n\s+\.eq\('cert_number', certNumber\.toUpperCase\(\)\)\n\s+\.single\(\);/s,
  `let data;
    let error;

    if (USE_LOCAL_DB && sql) {
      try {
        const result = await sql\`
          SELECT c.id, c.cert_number, c.start_date, c.end_date, c.auth_scope, c.status, c.final_image_url,
                 d.company_name, d.phone
          FROM certificates c
          LEFT JOIN dealers d ON c.dealer_id = d.id
          WHERE c.cert_number = \${certNumber.toUpperCase()}
          LIMIT 1
        \`;
        
        if (result && result.length > 0) {
          data = {
            ...result[0],
            dealers: { company_name: result[0].company_name, phone: result[0].phone }
          };
        } else {
          error = { code: 'PGRST116' };
        }
      } catch (err) {
        throw err;
      }
    } else {
      const res = await supabaseAdmin
        .from('certificates')
        .select(\`
          id,
          cert_number,
          start_date,
          end_date,
          auth_scope,
          status,
          dealers ( company_name, phone ),
          final_image_url
        \`)
        .eq('cert_number', certNumber.toUpperCase())
        .single();
      
      data = res.data;
      error = res.error;
    }`
);

fs.writeFileSync(verifyRoutePath, verifyContent);

const certRoutePath = path.join(rootDir, 'app/api/certificates/route.ts');
let certContent = fs.readFileSync(certRoutePath, 'utf8');

certContent = certContent.replace(
  `import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';`,
  `import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';`
);

certContent = certContent.replace(
  /const supabaseUrl = process\.env\.NEXT_PUBLIC_SUPABASE_URL!;.*?persistSession: false\n\s+}\n\s+}\);/s,
  `// Used either local DB or supabaseAdmin directly depending on USE_LOCAL_DB`
);

// We need to wait for user approval or manually make these modifications to the main API
// The main API is very complex, so doing an automated script for all logic branching is hard.
console.log("Patched verify route. The main certificates route needs manual patching because of its complexity.");
