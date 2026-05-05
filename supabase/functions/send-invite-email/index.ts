import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is authenticated
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, inviteType } = await req.json();
    if (!email || !["user", "admin"].includes(inviteType)) {
      return new Response(
        JSON.stringify({ error: "Invalid email or inviteType" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseUrl = Deno.env.get("SITE_URL") || "https://muslimvoterproject.com";
    const signupUrl = `${baseUrl}/signup?email=${encodeURIComponent(email)}`;
    const isAdminInvite = inviteType === "admin";
    const subject = isAdminInvite
      ? "You've been invited as an Admin — Muslim Voter Project"
      : "You're invited to the Muslim Voter Project";

    const roleText = isAdminInvite
      ? "You've been granted <strong>administrator access</strong> to the Muslim Voter Project platform. As an admin, you can manage users, import data, and oversee the voter impact map."
      : "You've been invited to join the Muslim Voter Project platform. Explore voter impact data across states and congressional districts.";

    const ctaText = isAdminInvite ? "Sign In as Admin" : "Create Your Account";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background-color:#0c1018;padding:32px 40px;text-align:center;">
            <img src="https://muslimvoterproject.com/logo-icon.png" alt="Muslim Voter Project" width="48" height="48" style="display:block;margin:0 auto 8px auto;border-radius:8px;" />
            <h1 style="color:#e8ecf0;font-size:20px;margin:8px 0 0 0;font-weight:600;">Muslim Voter Project</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#1a1a2e;font-size:22px;margin:0 0 16px 0;font-weight:600;">${isAdminInvite ? "Welcome, Admin" : "You're Invited"}</h2>
            <p style="color:#55575d;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${roleText}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background-color:#17a0ad;border-radius:6px;">
                  <a href="${signupUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${ctaText}</a>
                </td>
              </tr>
            </table>
            <p style="color:#55575d;font-size:13px;line-height:1.6;margin:24px 0 0 0;">If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${signupUrl}" style="color:#17a0ad;word-break:break-all;">${signupUrl}</a></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">Muslim Voter Project &bull; This invitation was sent to ${email}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const plainText = `${isAdminInvite ? "Welcome, Admin" : "You're Invited"}\n\n${roleText.replace(/<[^>]+>/g, "")}\n\n${ctaText}: ${signupUrl}\n\nMuslim Voter Project — This invitation was sent to ${email}`;

    // Generate or reuse an unsubscribe token for this email
    const { data: existingToken } = await serviceClient
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", email)
      .is("used_at", null)
      .limit(1)
      .single();

    let unsubscribeToken: string;
    if (existingToken?.token) {
      unsubscribeToken = existingToken.token;
    } else {
      unsubscribeToken = crypto.randomUUID();
      await serviceClient.from("email_unsubscribe_tokens").insert({
        email,
        token: unsubscribeToken,
      });
    }

    const messageId = `invite-${inviteType}-${crypto.randomUUID()}`;

    // Log pending status before enqueue
    await serviceClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "invite-email",
      recipient_email: email,
      status: "pending",
      metadata: { invite_type: inviteType, invited_by: user.id },
    });

    // Enqueue the email via pgmq
    const { error: enqueueError } = await serviceClient.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        idempotency_key: messageId,
        unsubscribe_token: unsubscribeToken,
        to: email,
        from: `Muslim Voter Project <noreply@notify.muslimvoterproject.com>`,
        sender_domain: "notify.muslimvoterproject.com",
        subject,
        html,
        text: plainText,
        purpose: "transactional",
        label: "invite-email",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Enqueue error:", enqueueError);
      return new Response(
        JSON.stringify({ error: "Failed to queue email", details: enqueueError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
