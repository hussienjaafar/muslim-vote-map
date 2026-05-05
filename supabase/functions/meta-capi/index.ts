const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PIXEL_ID = Deno.env.get('META_PIXEL_ID')!;
const ACCESS_TOKEN = Deno.env.get('META_CAPI_TOKEN')!;
const GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // GET — return the public pixel ID so the client can init fbq dynamically
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ pixel_id: PIXEL_ID }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const {
      event_name,
      event_id,
      event_source_url,
      user_data = {},
      custom_data = {},
      fbc,
      fbp,
    } = body;

    if (!event_name || !event_id) {
      return new Response(
        JSON.stringify({ error: 'event_name and event_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build hashed user_data for CAPI
    const hashedUserData: Record<string, any> = {};

    if (user_data.email) {
      hashedUserData.em = [await sha256(user_data.email)];
    }
    if (user_data.firstName) {
      hashedUserData.fn = [await sha256(user_data.firstName)];
    }
    if (user_data.lastName) {
      hashedUserData.ln = [await sha256(user_data.lastName)];
    }
    if (user_data.phone) {
      hashedUserData.ph = [await sha256(user_data.phone.replace(/\D/g, ''))];
    }

    // Client IP and user agent from request headers
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip');
    const clientUa = req.headers.get('user-agent');

    if (clientIp) hashedUserData.client_ip_address = clientIp;
    if (clientUa) hashedUserData.client_user_agent = clientUa;
    if (fbc) hashedUserData.fbc = fbc;
    if (fbp) hashedUserData.fbp = fbp;

    const eventData = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url,
      action_source: 'website',
      user_data: hashedUserData,
      custom_data,
    };

    const response = await fetch(`${GRAPH_URL}?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [eventData] }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta CAPI error:', JSON.stringify(result));
      // Swallow upstream errors so non-critical tracking never breaks the client
      return new Response(
        JSON.stringify({ ok: false, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, events_received: result.events_received }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('meta-capi error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
