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

**Card / exercise voice — pushed live 2026-10-08** (commit 4f388c1, together with the voice-chat upgrade)
- Flip-card word pronunciation: tapping the English word (or a new 🔊 button beside it) speaks it via browser `speechSynthesis`, without flipping the card; works for every card in every Unit (single render path). `.flip-card.flipped .face.front { pointer-events: none; }` added so the hidden front's tap targets can't swallow the un-flip tap.
- Fill-in-the-blank exercise voice (grammar/dialogue/reading quiz items, same component for all of them): on "შემოწმება", speaks the full corrected sentence (correct answer: sentence only; wrong answer: "The correct answer is: X." then the sentence); "პასუხის ნახვა" speaks the sentence only. New `fillBlankSentence()` reconstructs the sentence from `item.prompt`'s `___` marker(s) + `item.answer`, stripping any trailing `(hint)` parenthetical; prompts with no `___` (true/false reading items, and "translate to Georgian" dialogue items where `item.answer` is Georgian, not English) are left unchanged rather than ever reading a non-English `item.answer` in an en-US voice. Full sentence is also shown as text with its own 🔊 replay button. New Settings toggle `exerciseSpeak` (default on) gates the automatic speech only — the replay button always works. All speech is fired synchronously from the click handler (never from inside a `.then()`) so iOS Safari accepts it as a user gesture. Verified with a headless-Chrome harness built from the actual extracted source (14/14 assertions), not just by inspection.
- Dialogue translate-item voice (the no-blank "თარგმნე ქართულად/ინგლისურად" quiz items specifically, e.g. "What's up?" → Georgian): the English side auto-speaks the moment a new question is shown (fired synchronously from whichever click changed the question — picking it from the list, "შემდეგი", "თავიდან დაწყება" — never from a re-render with no click behind it), with its own 🔊 replay button next to it; the Georgian instruction line is never read. On check/reveal: a Georgian answer is read in a `ka-GE` voice if `hasVoiceForLang("ka")`, otherwise the English prompt is repeated instead (never Georgian text in an en-US voice); an English answer (the not-yet-existing "translate to English" direction) is read directly, with the same "The correct answer is: X" prefix on a wrong check. Reuses `exerciseSpeak` (no new setting) and the existing fill-in-the-blank logic unchanged for dialogue items that still have a `___`. New shared `correctionSpeech(ok, revealed)` drives both the automatic speech and the feedback-row replay button so they always say the same thing; new `textIsGeorgian()` helper (Georgian Unicode range) decides prompt/answer language instead of trusting instruction wording. Verified with a second headless-Chrome harness lifting the real source (22/22 assertions, including that grammar/reading items and dialogue fill-blank items are provably unaffected).
- service-worker.js cache bumped to v27 for all of the above.

**Daily quiz + push notifications — deployed 2026-10-08, awaiting first test on the iPhone**
- Client: `renderDailyQuizView()` — 20 questions from every unit up to the furthest one practised in the app: vocabulary cards (multiple choice) plus grammar and dialogue items (typed; reading items excluded). `pickDailyQuizItems()` uses per-item history in `state.daily.items` (synced in `user_progress.daily`): a mistake returns after 2h, a correct answer rests 0.5/1/3/7/14/30 days, unseen items start from their unit-page result. Correct answers auto-advance; wrong ones wait for Next. `renderDailyAnalysis()` (home button "📊 ჩემი ანალიზი" and the result screen) lists the most-missed items. Home button "📝 დღის ტესტი" and `#quiz`, Settings switch "ტესტის შეტყობინებები" (`renderQuizPushRow()`, stores the Web Push subscription in `push_subscriptions`), `push` / `notificationclick` handlers in `service-worker.js`.
- Server: Edge Function `send-quiz-push` (npm:web-push, VAPID) is called with no credential by pg_cron job `quiz-push` at 5,8,11,14,17 UTC = 9,12,15,18,21 Tbilisi (migration `20261008010000_quiz_push_schedule.sql`). It protects itself: sends only in those local hours and once per hour slot (`push_send_log`). A POST with header `x-cron-secret: <CRON_SECRET>` bypasses both checks for a manual test.
- Secrets set on Supabase: `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. Local copies were only in a temp folder (`%LOCALAPPDATA%/Temp/claude/vapid/`) and may be gone; to test by hand again set a new `CRON_SECRET` with `npx supabase secrets set`. If the VAPID key pair is ever regenerated, update `VAPID_PUBLIC_KEY` in both the HTML and `send-quiz-push/index.ts`, and every device must re-enable the switch.
- `openai-tts` is deployed too, so voice chat now uses the natural AI voice.
- `service-worker.js` serves pages network-first (cache only offline), so a pushed change shows on the next launch; before 2026-10-08 it was cache-first and every update needed two launches. Still bump `CACHE_NAME` on each release.
- Verified live 2026-10-08 in the Claude Browser pane (it is signed in to the app there): flip-card rating advances to the next card; quiz and analysis views render. Push delivery to the iPhone confirmed by the user.
- A GitHub Actions schedule was tried first and dropped: the local git login lacks the `workflow` scope.
- Supabase CLI is logged in and linked on this PC (`npx supabase ...` works from the repo folder).
- A Claude desktop scheduled task `english-tutor-quiz` (5 quizzes a day in the Claude app, log in `tutor/progress.md`, git-ignored) exists as a stopgap; disable it once phone notifications are confirmed working.

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
   - Implemented 2026-09-26 (not streaming yet): Sonnet 5 with thinking disabled + effort low + top-level prompt caching; `gpt-4o-transcribe` with `transcriptionHint()` vocab prompt; silence wait 2s; new Edge Function `supabase/functions/openai-tts` (gpt-4o-mini-tts, voice "coral") used in voice mode, with fallback to browser voice if it fails; iOS audio unlocked on the mic tap. `openai-tts` must be deployed (`npx supabase functions deploy openai-tts --project-ref wddqjehzoicwkqyqfiqs`) — until then voice mode silently uses the browser voice. Streaming reply is still a possible next step.
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
