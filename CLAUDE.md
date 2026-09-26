# Lumen English

Georgian users' English-learning PWA. Always reply to the user in Georgian script (ქართული ასოები), not Latin transliteration.

## Status (updated 2026-09-26)

**Done**
- 9 Units, 3 exercise modes, voice conversation mode, Settings, progress sync
- "Calm Focus" design + PWA (works offline)
- Supabase: auth, RLS, admin/user roles, cross-device progress
- API keys moved to Supabase Edge Functions (with rate limiting)
- LemonSqueezy: product published, webhook deployed
- Settings: password change block + Premium section
- Card records extended (attempts / correctCount / history)
- Mistake categorization (grammar / vocabulary / pronunciation), logged by AI in localStorage

**Active bug — fixed pending live re-test**
- Voice conversation mode "did nothing when started": confirmed on iPhone that mic capture + Whisper transcription actually work fine (the earlier getUserMedia/iOS-standalone timeout hypothesis was wrong — that defensive timeout code stays in as a harmless safety net, but wasn't the cause). The real cause: both `anthropic-chat` and `whisper-transcribe` were returning 401 ("სესია ვადაგასულია — გთხოვ თავიდან შედი ანგარიშზე"), and the client had **no retry-on-401 logic at all** — it fully trusted supabase-js's own background auto-refresh timer, which can miss its window after the PWA is suspended in the background for a while (iOS in particular) and comes back with an access token already past its `exp` claim. Fixed by adding `postToEdgeFunction()` (in `ჩემი-ინგლისურის-რვეული.html`, replaces the old direct `edgeFunctionHeaders(...).then(fetch...)` calls in chat, voice mode, and the vocabulary-practice mic): on a 401 it now calls `supabaseClient.auth.refreshSession()` once and retries before giving up. A 401 that persists after that means the refresh_token itself is genuinely dead (real re-login needed) — anything short of that should now self-heal silently. **Not yet re-tested live** — next step is confirming on-device that the "session expired" message no longer appears after the app has been backgrounded a while.
- Separate, deliberately deferred: voice mode doesn't transcribe every word correctly. To be tackled together with the voice-speed pass in the roadmap below (shorter silence wait, streaming reply, etc.) — not yet started.

**Payments, in progress**
- Premium checkout button in Settings appears; status needs verifying
- LemonSqueezy Store Activation required before real payments work
- Webhook testing in Test Mode

**Agreed next steps (2026-09-26)**
1. Fix the voice-mode bug.
2. Voice conversation upgrade (option A). User's goal: catch every word, answer by voice in good quality, also show text, and be fast.
   - Chat model: user chose `claude-sonnet-5` (replacing `claude-opus-4-8`).
   - Speech-to-text: replace `whisper-1` with `gpt-4o-transcribe`, pass lesson vocabulary as a `prompt` hint.
   - Reply voice: replace browser `speechSynthesis` with OpenAI TTS (natural voice) via an Edge Function.
   - Speed: silence wait 4s -> ~1.5s, prompt caching, stream the reply and start speaking from the first sentence.
   - Verify current OpenAI prices before implementing.
3. Then convert to personal use only: user disables new sign-ups in Supabase (Auth settings), hide Premium/checkout UI, set monthly spend limits on Anthropic and OpenAI. Note: monthly and yearly LemonSqueezy checkout URLs are currently identical.

Once the app is personal-only, the launch-oriented roadmap below is on hold.

**Roadmap**
1. Account deletion (critical, legally required)
2. Move profile data from localStorage to Supabase
3. Expand grammar / dialogue search
4. Dark mode
5. Testing and launch for 50,000 users
6. Long term: multilingual international platform

Keep this section current when work is finished.
