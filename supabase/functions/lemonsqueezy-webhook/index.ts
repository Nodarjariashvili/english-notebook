// Supabase Edge Function: receives LemonSqueezy webhook events and keeps
// public.subscriptions in sync.
//
// Unlike anthropic-chat/whisper-transcribe, the caller here is LemonSqueezy's
// own server, not a signed-in browser user -- there is no Supabase JWT to
// check. Trust instead comes from verifying the HMAC-SHA256 signature
// LemonSqueezy sends in the X-Signature header, computed over the raw
// request body using the webhook signing secret (LEMONSQUEEZY_WEBHOOK_SECRET,
// generated when the webhook is created in the LemonSqueezy dashboard --
// this is a different secret from the LemonSqueezy API key).
//
// Only subscription lifecycle events are handled; other event types (e.g.
// order_created for one-off purchases, which this app doesn't sell) are
// acknowledged with 200 and ignored so LemonSqueezy doesn't keep retrying
// them.
//
// NOTE: the LemonSqueezy payload field names below follow their documented
// subscription object shape as of when this was written. Before relying on
// this in production, verify it against a real received payload (Supabase
// Edge Function logs) during testing -- third-party API shapes can drift,
// and this hasn't been tested against a live webhook yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_payment_success",
  "subscription_payment_failed",
]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifySignature(secret: string, rawBody: string, signatureHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(computedHex, signatureHex);
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) {
    console.error("lemonsqueezy-webhook: missing LEMONSQUEEZY_WEBHOOK_SECRET");
    return json({ error: "Server misconfigured" }, 500);
  }

  const signature = req.headers.get("X-Signature") || req.headers.get("x-signature");
  if (!signature) {
    return json({ error: "Missing X-Signature header" }, 401);
  }

  // read the RAW body (not re-serialized JSON) -- the signature is computed
  // over these exact bytes, so parsing-then-restringifying would break it
  const rawBody = await req.text();
  const validSignature = await verifySignature(secret, rawBody, signature);
  if (!validSignature) {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventName: string | undefined = payload?.meta?.event_name;
  if (!eventName || !SUBSCRIPTION_EVENTS.has(eventName)) {
    // not a subscription event we care about (e.g. order_created) -- 200 so
    // LemonSqueezy marks it delivered and doesn't retry
    return json({ ignored: true, event: eventName ?? null }, 200);
  }

  // set at checkout time via checkout_data.custom.user_id -- see plan step 5
  // (frontend checkout integration), not yet implemented
  const userId: string | undefined = payload?.meta?.custom_data?.user_id;
  if (!userId) {
    console.error("lemonsqueezy-webhook: event has no custom_data.user_id", eventName, payload?.data?.id);
    // 200: we can never link this to a user after the fact by retrying, so
    // acknowledge it (and rely on the server log above to notice the gap)
    // rather than have LemonSqueezy hammer this endpoint with retries.
    return json({ error: "Missing custom_data.user_id", event: eventName }, 200);
  }

  const attrs = payload?.data?.attributes ?? {};
  const row = {
    user_id: userId,
    status: attrs.status ?? "unknown",
    variant_id: attrs.variant_id != null ? String(attrs.variant_id) : null,
    lemonsqueezy_subscription_id: payload?.data?.id != null ? String(payload.data.id) : null,
    lemonsqueezy_customer_id: attrs.customer_id != null ? String(attrs.customer_id) : null,
    renews_at: attrs.renews_at ?? null,
    ends_at: attrs.ends_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { error: upsertErr } = await adminClient
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });

  if (upsertErr) {
    console.error("lemonsqueezy-webhook: subscriptions upsert failed:", upsertErr.message);
    return json({ error: "Database write failed" }, 500);
  }

  return json({ ok: true, event: eventName, user_id: userId }, 200);
});
