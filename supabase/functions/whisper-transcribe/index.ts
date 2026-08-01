// Supabase Edge Function: proxies audio transcription requests to OpenAI's
// Whisper API. Same shape as anthropic-chat -- see that function's header
// comment for the auth/rate-limit rationale.
//
// The request body is multipart/form-data (an audio blob), not JSON, so it
// is forwarded to OpenAI as a raw stream with the original content-type
// (which carries the multipart boundary) instead of being parsed/rebuilt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const DAILY_LIMIT = 50;
const FUNCTION_NAME = "whisper-transcribe";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "Missing Authorization header.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return errorResponse(401, "Invalid or expired session.");
  }
  const userId = userData.user.id;

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageResult, error: usageErr } = await adminClient.rpc("increment_api_usage", {
    p_user_id: userId,
    p_function_name: FUNCTION_NAME,
    p_day: today,
    p_limit: DAILY_LIMIT,
  });
  if (usageErr) {
    return errorResponse(500, "Rate limit check failed.");
  }
  if (usageResult === -1) {
    return errorResponse(429, "Daily request limit reached (50/day). Try again tomorrow.");
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return errorResponse(500, "Server misconfigured: missing OPENAI_API_KEY.");
  }

  const contentType = req.headers.get("content-type") || "";
  const whisperRes = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + openaiKey,
      "content-type": contentType,
    },
    body: req.body,
  });

  const responseBody = await whisperRes.text();
  return new Response(responseBody, {
    status: whisperRes.status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
