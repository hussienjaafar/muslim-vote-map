import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GeoResult {
  city?: string;
  regionName?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

async function geolocateIp(ip: string): Promise<GeoResult> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return {};
  try {
    // Use ipapi.co (HTTPS, 1k/day free) with a 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return {};
    const data = await res.json();
    return {
      city: data.city ?? undefined,
      regionName: data.region ?? undefined,
      country: data.country_name ?? undefined,
      lat: data.latitude ?? undefined,
      lon: data.longitude ?? undefined,
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: true, skipped: "unauthenticated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    const userId = authUser?.id;

    if (authError || !userId) {
      console.warn("Auth validation skipped:", authError?.message ?? "No user");
      return new Response(JSON.stringify({ ok: true, skipped: "invalid_token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const eventType = body.event_type;
    const metadata = body.metadata ?? {};

    if (!eventType || typeof eventType !== "string") {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "";

    // Geolocate (non-blocking timeout ensures response isn't delayed)
    const geo = await geolocateIp(ip);

    // Insert with service role client (bypasses RLS)
    const { error: insertError } = await adminClient
      .from("user_activity_log")
      .insert({
        user_id: userId,
        event_type: eventType,
        metadata,
        ip_address: ip || null,
        city: geo.city ?? null,
        region: geo.regionName ?? null,
        country: geo.country ?? null,
        latitude: geo.lat ?? null,
        longitude: geo.lon ?? null,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to log activity" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("log-activity error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
