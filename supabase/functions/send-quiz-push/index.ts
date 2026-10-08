// Supabase Edge Function: sends a "your quiz is ready" Web Push to every
// device in public.push_subscriptions. Tapping the notification opens the
// app on its daily quiz (#quiz).
//
// Not called by users: pg_cron calls it at the top of each quiz hour (see
// the quiz_push_schedule migration). The call carries no credential, so JWT
// verification is switched off for this function in supabase/config.toml
// and the function protects itself instead: it only sends during a quiz
// hour (Tbilisi time) and at most once per hour slot, recorded in
// public.push_send_log. Calling it at any other moment, or a second time in
// the same hour, does nothing.
//
// A request carrying the CRON_SECRET in the x-cron-secret header skips both
// checks -- for sending a test notification by hand.
//
// Secrets needed: VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https:
// contact URL), and optionally CRON_SECRET. The matching VAPID public key is
// the VAPID_PUBLIC_KEY constant in the app's HTML and must stay in sync with
// VAPID_PUBLIC_KEY below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BEf6jQgC2NcOFHoPbh4tiXA_poVy7SRUSLcxX9NnojZ0jmHn_aadhtNzDIDLA1tfcfI2EtJhxL_yZ9_D8ofkg8E";

// Tbilisi is UTC+4 all year (no daylight saving).
const LOCAL_UTC_OFFSET_HOURS = 4;
const QUIZ_HOURS_LOCAL = [9, 12, 15, 18, 21];

const MESSAGES = [
  "20 მოკლე კითხვა გელოდება — რამდენიმე წუთი დაგჭირდება.",
  "დროა გაიმეორო! 20 კითხვა შენი ნასწავლი მასალიდან.",
  "პატარა ტესტი მზადაა — ნახე, რა გახსოვს.",
  "რამდენიმე წუთი ინგლისურისთვის: 20 კითხვა გელოდება.",
  "გაიმეორე დღევანდელი სიტყვები — ტესტი მზადაა.",
];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPrivateKey || !vapidSubject) {
    return jsonResponse(500, { error: "Server misconfigured: missing VAPID_PRIVATE_KEY or VAPID_SUBJECT." });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cronSecret = Deno.env.get("CRON_SECRET");
  const isManualTest = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

  if (!isManualTest) {
    const local = new Date(Date.now() + LOCAL_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    if (QUIZ_HOURS_LOCAL.indexOf(local.getUTCHours()) === -1) {
      return jsonResponse(200, { skipped: "not a quiz hour" });
    }
    // one send per hour slot: the primary key rejects a second claim
    const slot = local.toISOString().slice(0, 13);
    const { error: claimErr } = await adminClient.from("push_send_log").insert({ slot });
    if (claimErr) {
      return jsonResponse(200, { skipped: "already sent for " + slot });
    }
  }

  webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const { data: subs, error: subsErr } = await adminClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (subsErr) {
    return jsonResponse(500, { error: "Could not read subscriptions." });
  }

  const payload = JSON.stringify({
    title: "🇬🇧 ინგლისურის ტესტი",
    body: MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
    url: "./index.html#quiz",
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all((subs || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3 * 60 * 60 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // the device unsubscribed or the subscription expired
        await adminClient.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        removed++;
      } else {
        console.error("send-quiz-push: push failed", status, (err as Error).message);
        failed++;
      }
    }
  }));

  return jsonResponse(200, { sent, removed, failed });
});
