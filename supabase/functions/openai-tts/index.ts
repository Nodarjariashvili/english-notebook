// Supabase Edge Function: turns the tutor's English reply into natural
// speech with OpenAI's text-to-speech API and returns the MP3 audio.
// Same auth/rate-limit shape as whisper-transcribe and anthropic-chat -- see
// anthropic-chat's header comment for the rationale.
//
// Request body: JSON { "input": "text to speak" }. The model, voice and
// instructions are fixed here so the client can't run up arbitrary usage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TTS_API_URL = "https://api.openai.com/v1/audio/speech";
const TTS_MODEL = "gpt-4o-mini-tts";
const TTS_VOICE = "coral";
const TTS_INSTRUCTIONS =
  "You are a warm, friendly English tutor talking to a beginner. Speak clearly, at a slightly slower than normal pace, with natural intonation.";
const MAX_INPUT_CHARS = 1500;
const FREE_DAILY_LIMIT = 50;
const PREMIUM_DAILY_LIMIT = 500;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial"]);
const FUNCTION_NAME = "openai-tts";

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

  let input: string;
  try {
    const body = await req.json();
    input = typeof body.input === "string" ? body.input.trim() : "";
  } catch {
    return errorResponse(400, "Invalid JSON body.");
  }
  if (!input) {
    return errorResponse(400, "Missing 'input' text.");
  }
  if (input.length > MAX_INPUT_CHARS) {
    input = input.slice(0, MAX_INPUT_CHARS);
  }

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
    return errorResponse(500, "Rate limit check failed.");
  }
  if (usageResult === -1) {
    return errorResponse(429, "Daily request limit reached. Try again tomorrow, or upgrade for a higher limit.");
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return errorResponse(500, "Server misconfigured: missing OPENAI_API_KEY.");
  }

  const ttsRes = await fetch(TTS_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + openaiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input,
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!ttsRes.ok) {
    const errText = await ttsRes.text();
    return new Response(errText, {
      status: ttsRes.status,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  return new Response(ttsRes.body, {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "audio/mpeg" },
  });
});
