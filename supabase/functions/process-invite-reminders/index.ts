import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const REMINDER_SCHEDULE = [
  { num: 1, daysAfter: 3, subject: "Your Campaign Data Solutions invitation is waiting", tone: "friendly" },
  { num: 2, daysAfter: 7, subject: "Don't miss your access to issue donor data", tone: "value" },
  { num: 3, daysAfter: 14, subject: "Final reminder: Your invitation to Campaign Data Solutions", tone: "urgency" },
] as const;

function buildReminderHtml(email: string, signupUrl: string, reminderNum: 1 | 2 | 3): string {
  const headings: Record<number, string> = {
    1: "Your Invitation is Waiting",
    2: "Explore Voter Impact Data",
    3: "Final Reminder",
  };
  const bodies: Record<number, string> = {
    1: "A few days ago, you were invited to join the Campaign Data Solutions platform. Your access is ready — just click below to create your account and start exploring issue-based donor data across states and congressional districts.",
    2: "Your invitation to the Campaign Data Solutions is still waiting. Our platform provides powerful insights into issue-based donor data, election context, and congressional district analysis. Don't miss out on access to these data-driven civic engagement tools.",
    3: "This is your final reminder about your invitation to the Campaign Data Solutions. Your invitation will remain valid, but we won't send any more reminders. Click below to accept and get started.",
  };
  const ctas: Record<number, string> = {
    1: "Accept Invitation",
    2: "Get Started Now",
    3: "Accept Before It's Too Late",
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#0c1018;padding:32px 40px;text-align:center;">
            <img src="https://campaigndata.solutions/logo-icon.png" alt="Campaign Data Solutions" width="48" height="48" style="display:block;margin:0 auto 8px auto;border-radius:8px;" />
            <h1 style="color:#e8ecf0;font-size:20px;margin:8px 0 0 0;font-weight:600;">Campaign Data Solutions</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#1a1a2e;font-size:22px;margin:0 0 16px 0;font-weight:600;">${headings[reminderNum]}</h2>
            <p style="color:#55575d;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${bodies[reminderNum]}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background-color:#17a0ad;border-radius:6px;">
                  <a href="${signupUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${ctas[reminderNum]}</a>
                </td>
              </tr>
            </table>
            <p style="color:#55575d;font-size:13px;line-height:1.6;margin:24px 0 0 0;">If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${signupUrl}" style="color:#17a0ad;word-break:break-all;">${signupUrl}</a></p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">Campaign Data Solutions &bull; Reminder ${reminderNum} of 3 &bull; Sent to ${email}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    // Verify service role JWT
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401 });
    }

    // Decode JWT to check role
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }
    const claims = JSON.parse(atob(payloadB64));
    if (claims.role !== "service_role") {
      return new Response(JSON.stringify({ error: "Service role required" }), { status: 403 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const baseUrl = Deno.env.get("SITE_URL") || "https://campaigndata.solutions";

    // 1. Get all pending invites (not accepted)
    const { data: pendingInvites, error: invError } = await supabase
      .from("invited_emails")
      .select("id, email, invited_at")
      .is("accepted_at", null);

    if (invError) throw invError;
    if (!pendingInvites?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending invites" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Get suppressed emails
    const { data: suppressed } = await supabase
      .from("suppressed_emails")
      .select("email");
    const suppressedSet = new Set((suppressed ?? []).map((s) => s.email.toLowerCase()));

    // 3. Get already-sent reminders from email_send_log
    const { data: sentReminders } = await supabase
      .from("email_send_log")
      .select("recipient_email, metadata, status")
      .eq("template_name", "invite-reminder")
      .in("status", ["pending", "sent"]);

    // Build map: email → Set of reminder numbers already sent
    const remindersSentMap = new Map<string, Set<number>>();
    for (const log of sentReminders ?? []) {
      const email = log.recipient_email.toLowerCase();
      const meta = log.metadata as Record<string, unknown> | null;
      const num = meta?.reminder_num as number | undefined;
      if (num) {
        if (!remindersSentMap.has(email)) remindersSentMap.set(email, new Set());
        remindersSentMap.get(email)!.add(num);
      }
    }

    const now = Date.now();
    let processed = 0;
    const results: Array<{ email: string; reminder: number; status: string }> = [];

    for (const invite of pendingInvites) {
      const email = invite.email.toLowerCase();

      // Skip suppressed
      if (suppressedSet.has(email)) {
        results.push({ email, reminder: 0, status: "suppressed" });
        continue;
      }

      const invitedAt = new Date(invite.invited_at).getTime();
      const daysSinceInvite = (now - invitedAt) / (1000 * 60 * 60 * 24);
      const alreadySent = remindersSentMap.get(email) ?? new Set();

      // Find which reminder is due
      let reminderToBeSent: (typeof REMINDER_SCHEDULE)[number] | null = null;
      for (const reminder of REMINDER_SCHEDULE) {
        if (daysSinceInvite >= reminder.daysAfter && !alreadySent.has(reminder.num)) {
          reminderToBeSent = reminder;
          // Don't break — we want the highest eligible reminder
        }
      }

      if (!reminderToBeSent) continue;

      const signupUrl = `${baseUrl}/signup?email=${encodeURIComponent(email)}`;
      const html = buildReminderHtml(email, signupUrl, reminderToBeSent.num as 1 | 2 | 3);
      const plainText = `Reminder: Your invitation to the Campaign Data Solutions is still waiting. Accept here: ${signupUrl}`;

      // Get or create unsubscribe token
      const { data: existingToken } = await supabase
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
        await supabase.from("email_unsubscribe_tokens").insert({ email, token: unsubscribeToken });
      }

      const idempotencyKey = `invite-reminder-${email}-${reminderToBeSent.num}`;
      const messageId = `invite-reminder-${crypto.randomUUID()}`;

      // Log pending
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: "invite-reminder",
        recipient_email: email,
        status: "pending",
        metadata: { reminder_num: reminderToBeSent.num, invite_id: invite.id },
      });

      // Enqueue
      const { error: enqueueError } = await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          idempotency_key: idempotencyKey,
          unsubscribe_token: unsubscribeToken,
          to: email,
          from: "Campaign Data Solutions <noreply@notify.campaigndata.solutions>",
          sender_domain: "notify.campaigndata.solutions",
          subject: reminderToBeSent.subject,
          html,
          text: plainText,
          purpose: "transactional",
          label: "invite-reminder",
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueError) {
        console.error(`Failed to enqueue reminder for ${email}:`, enqueueError);
        results.push({ email, reminder: reminderToBeSent.num, status: "enqueue_failed" });
      } else {
        processed++;
        results.push({ email, reminder: reminderToBeSent.num, status: "queued" });
      }
    }

    return new Response(
      JSON.stringify({ processed, total: pendingInvites.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-invite-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
