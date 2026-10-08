// Supabase Edge Function: sends a "your quiz is ready" Web Push to every
// device in public.push_subscriptions. Tapping the notification opens the
// app on its 5-question daily quiz (#quiz).
//
// Not called by users: it is triggered on a schedule by the GitHub Actions
// workflow .github/workflows/quiz-push.yml, which authenticates with the
// shared CRON_SECRET (sent in the x-cron-secret header). JWT verification is
// therefore switched off for this function in supabase/config.toml.
//
// Secrets needed: CRON_SECRET, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto:).
// The matching VAPID public key is the VAPID_PUBLIC_KEY constant in the
// app's HTML and must stay in sync with VAPID_PUBLIC_KEY below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BEf6jQgC2NcOFHoPbh4tiXA_poVy7SRUSLcxX9NnojZ0jmHn_aadhtNzDIDLA1tfcfI2EtJhxL_yZ9_D8ofkg8E";

const MESSAGES = [
  "5 მოკლე კითხვა გელოდება — 2 წუთი დაგჭირდება.",
  "დროა გაიმეორო! 5 კითხვა შენი ნასწავლი მასალიდან.",
  "პატარა ტესტი მზადაა — ნახე, რა გახსოვს.",
  "2 წუთი ინგლისურისთვის: 5 კითხვა გელოდება.",
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

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse(401, { error: "Unauthorized." });
  }

  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPrivateKey || !vapidSubject) {
    return jsonResponse(500, { error: "Server misconfigured: missing VAPID_PRIVATE_KEY or VAPID_SUBJECT." });
  }
  webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
