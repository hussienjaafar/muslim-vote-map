import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sends notification emails to all admin users.
 * Called from the app when:
 *   1. A new access request is submitted (type: "new_application")
 *   2. An invitation is accepted / new user signs up (type: "invite_accepted")
 *
 * No auth required for "new_application" (public form submission).
 * Auth required for "invite_accepted" (called from handle_new_user context — use service key).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { type, data } = await req.json();

    // Get all admin emails
    const { data: adminRoles } = await serviceClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No admins to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map((r) => r.user_id);
    const { data: adminProfiles } = await serviceClient
      .from("profiles")
      .select("email, full_name")
      .in("id", adminIds);

    const adminEmails = (adminProfiles ?? [])
      .map((p) => p.email)
      .filter((e): e is string => !!e);

    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No admin emails found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = Deno.env.get("SITE_URL") || "https://campaigndata.solutions";
    let subject: string;
    let bodyHtml: string;
    let bodyText: string;
    let label: string;

    if (type === "new_application") {
      const { fullName, email, organization, useCase } = data;
      subject = `New Access Request: ${fullName} — ${organization}`;
      label = "admin-notification-application";

      bodyHtml = `
<h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px 0;">New Access Request</h2>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>${fullName}</strong> from <strong>${organization}</strong> has submitted an access request.</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>Email:</strong> ${email}</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 16px 0;"><strong>Use Case:</strong> ${useCase}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
  <tr><td style="background-color:#17a0ad;border-radius:6px;">
    <a href="${baseUrl}/admin/users/applications" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Review Application</a>
  </td></tr>
</table>`;

      bodyText = `New Access Request\n\n${fullName} from ${organization} has submitted an access request.\nEmail: ${email}\nUse Case: ${useCase}\n\nReview: ${baseUrl}/admin/users/applications`;

    } else if (type === "invite_accepted") {
      const { email: userEmail, fullName } = data;
      subject = `Invitation Accepted: ${fullName || userEmail}`;
      label = "admin-notification-accepted";

      bodyHtml = `
<h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px 0;">Invitation Accepted</h2>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 16px 0;"><strong>${fullName || userEmail}</strong> has accepted their invitation and created an account.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
  <tr><td style="background-color:#17a0ad;border-radius:6px;">
    <a href="${baseUrl}/admin/users" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Users</a>
  </td></tr>
</table>`;

      bodyText = `Invitation Accepted\n\n${fullName || userEmail} has accepted their invitation and created an account.\n\nView: ${baseUrl}/admin/users`;

    } else if (type === "new_order") {
      const { userEmail, userName, orderId, totalAmount, itemCount } = data;
      subject = `New Quote Request: ${userName || userEmail}`;
      label = "admin-notification-order";

      bodyHtml = `
<h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px 0;">New Quote Request</h2>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>${userName || userEmail}</strong> has submitted a quote request.</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>Email:</strong> ${userEmail}</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>Items:</strong> ${itemCount} product(s)</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 16px 0;"><strong>Estimated Total:</strong> $${Number(totalAmount || 0).toFixed(2)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">
  <tr><td style="background-color:#17a0ad;border-radius:6px;">
    <a href="${baseUrl}/admin/orders" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Orders</a>
  </td></tr>
</table>`;

      bodyText = `New Quote Request\n\n${userName || userEmail} has submitted a quote request.\nEmail: ${userEmail}\nItems: ${itemCount} product(s)\nEstimated Total: $${Number(totalAmount || 0).toFixed(2)}\n\nView: ${baseUrl}/admin/orders`;

    } else if (type === "order_fulfilled" || type === "order_cancelled") {
      const { recipientEmail, userName, orderId, itemCount, adminNotes } = data;

      if (!recipientEmail) {
        return new Response(JSON.stringify({ error: "recipientEmail is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isFulfilled = type === "order_fulfilled";
      subject = isFulfilled
        ? "Your Quote Request Has Been Fulfilled — Campaign Data Solutions"
        : "Quote Request Update — Campaign Data Solutions";
      label = "order-status-update";

      const statusText = isFulfilled ? "fulfilled" : "cancelled";
      const statusColor = isFulfilled ? "#059669" : "#dc2626";
      const heading = isFulfilled
        ? "Your Quote Request Has Been Fulfilled"
        : "Quote Request Update";
      const message = isFulfilled
        ? `Your quote request with ${itemCount || 0} item(s) has been fulfilled. You can view the details in your account.`
        : `Your quote request has been cancelled.${adminNotes ? ` The admin provided the following note: "${adminNotes}"` : ""}`;

      bodyHtml = `
<h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px 0;">${heading}</h2>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;">Hi ${userName || "there"},</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;">${message}</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>Order ID:</strong> ${(orderId || "").slice(0, 8)}...</p>
<p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 16px 0;"><strong>Status:</strong> <span style="color:${statusColor};font-weight:600;text-transform:uppercase;">${statusText}</span></p>
<table role="presentation" cellpadding="0" cellspacing="0">
  <tr><td style="background-color:#17a0ad;border-radius:6px;">
    <a href="${baseUrl}/account" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Your Account</a>
  </td></tr>
</table>`;

      bodyText = `${heading}\n\nHi ${userName || "there"},\n\n${message}\n\nOrder ID: ${(orderId || "").slice(0, 8)}...\nStatus: ${statusText}\n\nView your account: ${baseUrl}/account`;

      // Send to the user, not admins
      const messageId = `order-status-${type}-${crypto.randomUUID()}`;

      let unsubscribeToken: string;
      const { data: existingToken } = await serviceClient
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", recipientEmail)
        .maybeSingle();

      if (existingToken?.token) {
        unsubscribeToken = existingToken.token;
      } else {
        unsubscribeToken = crypto.randomUUID();
        await serviceClient.from("email_unsubscribe_tokens").insert({
          email: recipientEmail,
          token: unsubscribeToken,
        });
      }

      const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#0c1018;padding:24px 40px;text-align:center;">
          <h1 style="color:#e8ecf0;font-size:16px;margin:0;font-weight:600;">Campaign Data Solutions</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">${bodyHtml}</td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">You're receiving this because you have an account on Campaign Data Solutions.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      await serviceClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: label,
        recipient_email: recipientEmail,
        status: "pending",
        metadata: { notification_type: type, order_id: orderId, ...data },
      });

      const { error: enqueueError } = await serviceClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          idempotency_key: messageId,
          to: recipientEmail,
          from: `Campaign Data Solutions <noreply@notify.campaigndata.solutions>`,
          sender_domain: "notify.campaigndata.solutions",
          subject,
          html: fullHtml,
          text: bodyText,
          purpose: "transactional",
          label,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      });

      return new Response(JSON.stringify({ success: true, notified: [{ email: recipientEmail, error: enqueueError?.message || null }] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid notification type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to each admin
    const results = [];
    for (const adminEmail of adminEmails) {
      const messageId = `admin-notify-${type}-${crypto.randomUUID()}`;

      // Get or create unsubscribe token for this email
      let unsubscribeToken: string;
      const { data: existingToken } = await serviceClient
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", adminEmail)
        .maybeSingle();

      if (existingToken?.token) {
        unsubscribeToken = existingToken.token;
      } else {
        unsubscribeToken = crypto.randomUUID();
        await serviceClient.from("email_unsubscribe_tokens").insert({
          email: adminEmail,
          token: unsubscribeToken,
        });
      }

      const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#0c1018;padding:24px 40px;text-align:center;">
          <h1 style="color:#e8ecf0;font-size:16px;margin:0;font-weight:600;">Campaign Data Solutions — Admin</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">${bodyHtml}</td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">You're receiving this because you're an admin on Campaign Data Solutions.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      await serviceClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: label,
        recipient_email: adminEmail,
        status: "pending",
        metadata: { notification_type: type, ...data },
      });

      const { error: enqueueError } = await serviceClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          idempotency_key: messageId,
          to: adminEmail,
          from: `Campaign Data Solutions <noreply@notify.campaigndata.solutions>`,
          sender_domain: "notify.campaigndata.solutions",
          subject,
          html: fullHtml,
          text: bodyText,
          purpose: "transactional",
          label,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      });

      results.push({ email: adminEmail, error: enqueueError?.message || null });
    }

    return new Response(JSON.stringify({ success: true, notified: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-admins error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
