// TEMPORARY one-shot admin function — DELETE after use.
// Generates a fresh password recovery action_link via Supabase admin API,
// bypassing email delivery (and email-scanner prefetch consumption).
//
// Hardcoded to a single email for safety. To use:
//   curl -X POST $URL/functions/v1/admin-generate-recovery-link \
//     -H "Content-Type: application/json" \
//     -d '{"email":"hussein@molitico.com"}'

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_EMAIL = 'hussein@molitico.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { email } = await req.json()
    if (!email || email.toLowerCase().trim() !== ALLOWED_EMAIL) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: 'https://campaigndata.solutions/reset-password',
      },
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        action_link: data.properties?.action_link,
        email_otp: data.properties?.email_otp,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
