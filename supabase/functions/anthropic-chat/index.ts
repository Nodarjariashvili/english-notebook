// Supabase Edge Function: proxies requests to the Anthropic Messages API.
//
// - The real Anthropic API key lives only in this function's environment
//   (ANTHROPIC_API_KEY secret) -- it never reaches the browser.
// - Rejects any request that isn't from a signed-in Supabase user.
// - Enforces a per-day-per-user cap (shared code path used by both the chat
//   tab and the admin photo-analysis panel) -- 50/day on the free plan,
//   500/day for an active/on_trial row in public.subscriptions (Premium).
// - Forwards the request body to Anthropic unchanged and returns Anthropic's
//   response body unchanged, so the existing client-side response parsing
//   (result.content[0].text, etc.) needs no changes. Custom error responses
//   (401/429/500 raised by this function itself) are shaped to match
//   Anthropic's own {type:"error", error:{type, message}} envelope for the
//   same reason.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const FREE_DAILY_LIMIT = 50;
const PREMIUM_DAILY_LIMIT = 500;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial"]);
const FUNCTION_NAME = "anthropic-chat";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function errorResponse(status: number, type: string, message: string) {
  return new Response(
    JSON.stringify({ type: "error", error: { type, message } }),
    { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "invalid_request_error", "Method not allowed.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "authentication_error", "Missing Authorization header.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // bound to the caller's own JWT -- used only to find out who they are
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return errorResponse(401, "authentication_error", "Invalid or expired session.");
  }
  const userId = userData.user.id;

  // service-role client -- bypasses RLS, used for subscription lookup + rate-limit bookkeeping
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: subRow } = await adminClient
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  const dailyLimit = subRow && ACTIVE_SUBSCRIPTION_STATUSES.has(subRow.status) ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;

  const today = new Date().toISOString().slice(0, 10);
  const { data: usageResult, error: usageErr } = await adminClient.rpc("increment_api_usage", {
    p_user_id: userId,
    p_function_name: FUNCTION_NAME,
    p_day: today,
    p_limit: dailyLimit,
  });
  if (usageErr) {
    return errorResponse(500, "api_error", "Rate limit check failed.");
  }
  if (usageResult === -1) {
    return errorResponse(429, "rate_limit_error", "Daily request limit reached. Try again tomorrow, or upgrade for a higher limit.");
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return errorResponse(500, "api_error", "Server misconfigured: missing ANTHROPIC_API_KEY.");
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
    JSON.parse(bodyText); // validate it's well-formed JSON before forwarding
  } catch {
    return errorResponse(400, "invalid_request_error", "Invalid JSON body.");
  }

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: bodyText,
  });

  const responseBody = await anthropicRes.text();
  return new Response(responseBody, {
    status: anthropicRes.status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
