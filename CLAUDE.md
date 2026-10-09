# Lumen English

Georgian users' English-learning PWA. Always reply to the user in Georgian script (ქართული ასოები), not Latin transliteration.

## Status (updated 2026-09-26)

**Content rule (decided by the user 2026-10-08): only material from the textbook**
- The source is the user's textbook "Speaking Tags" (compiled by Aleksandre Lomadze), photographed as `IMG_*.HEIC` in this folder (git-ignored). Read them with Python `pillow_heif` + PIL. Do not add vocabulary, dialogues, readings or exercises that are not on those pages; an earlier nine-unit version had invented filler and it was removed.
- `UNITS` follows the book one to one: U1 greetings/introduction (pp. 22-29), U2 family/friends/relationships (30-37), U3 routines, likes and dislikes (38-48), U4 jobs (49-55), U5 personality (56-63), U6 shopping (64-71), U7 food (72-...).
- Photographed pages: 22-48 complete, then only 50, 51, 54, 57, 58, 59, 61, 69, 70, 73, 74, 75, 78. So U4-U7 have no dialogue/reading topics yet (U6 has vocabulary only) and show a "not added yet" note in those sections; every unit still shows the same four sections and seven progress tiles (the user wants identical structure in all units).
- Book material in the photos that is NOT in the app yet: U1 personal profile (p. 29 A); U2 formal/informal introduction phrases (p. 33), Megan's email exercise (p. 31), wrap-up A and B (p. 37); U3 wrap-up A and B (p. 48), likes "check the items" practice (p. 42); U4 articles B practice (p. 51); U5 qualifiers and matching practice (pp. 58-59), conjunctions B practice (p. 57); U6 reading questions (pp. 69-70, the text itself starts on the missing p. 68); U7 quantifiers B items 6-8 check, listening pages are audio-only.

**Page reader — built 2026-10-08, first real reading still to be done by the user**
- Admin view (`#admin`, or Settings -> admin button; admin account only), `renderAdminView()`: upload textbook photos (HEIC works) -> `readPage()` makes two `claude-opus-5` calls through `anthropic-chat` (transcribe, then verify against the photo) -> blocks shown beside the photo, with numbering-gap warnings, the model's notes, what the second pass changed, and the cost. Saved in `page_scans` (migration `20261008030000`).
- Rules the user set: printed text only; handwriting ignored (filled blanks come out as `___`); nothing solved, translated or added; nothing printed may be missed. Unreadable print is marked `[ვერ იკითხება]`, never guessed.
- Listening rule (user, 2026-10-09): nothing from the book's LISTENING sections goes into the app, because the recordings are not available: not the questions answered after a recording and not the gapped dialogues completed while listening. `listeningFlagsByScan()` marks those blocks (from a LISTENING banner to the next section banner, carried across consecutive pages, plus any block whose instruction says to listen); the reader shows them dimmed. The future placement step must skip every flagged block. The three dialogues that had come from listening sections (`dialogueClub`, `dialogueFriends`, `dialogueFrequency`) were removed from the app.
- This step is reading only. Placing scanned material into units is the next stage and has not been designed in code yet; the user wants it automatic eventually.
- Not verified end to end: the view loads on the live site, but no photo has been read yet (the Browser pane cannot be handed a local file). Watch for the Edge Function timing out on dense pages (no streaming through the proxy) and for the 50-requests-a-day limit: each page costs two requests.
- The user replaced the old photos with a new, more complete set on 2026-10-08 (`IMG_9613`-`IMG_9680`, 67 files); the page list in "Content rule" above describes the old set and should be redone from the new one.

**Done**
- 7 Units (see "Content rule" below), 3 exercise modes, voice conversation mode, Settings, progress sync
- "Calm Focus" design + PWA (works offline)
- Supabase: auth, RLS, admin/user roles, cross-device progress
- API keys moved to Supabase Edge Functions (with rate limiting)
- LemonSqueezy: product published, webhook deployed
- Settings: password change block + Premium section
- Card records extended (attempts / correctCount / history)
- Mistake categorization (grammar / vocabulary / pronunciation), logged by AI in localStorage

**Resolved 2026-10-08: the Supabase secret `ANTHROPIC_API_KEY` had expired** (the old key was created with a 30-day expiry and ran out on 2026-08-21; the user created a new non-expiring key `english-app` and set it, and a test call through `anthropic-chat` returned 200). Kept here because it explains the history:
- Verified from the signed-in app: the user's Supabase session is valid, `anthropic-chat` accepts it, and Anthropic itself answers 401 "API key is invalid". Every AI feature that goes through `anthropic-chat` (chat, voice chat replies, page reader) fails until the user creates a new key at console.anthropic.com and stores it with `npx supabase secrets set ANTHROPIC_API_KEY=...` (their job: never ask for the key in chat). OpenAI-based functions (transcription, TTS) use a different key and are not affected.
- This was the real cause of the long-running "სესია ვადაგასულია" message: the proxy passed Anthropic's 401 through and the app read every 401 as an expired session. The retry-on-401 work described below was aimed at the wrong cause (it is harmless and stays). The proxy now answers 502 for a rejected key and the app shows `AI_KEY_REJECTED_MESSAGE`.

**Earlier diagnosis of the "session expired" message (superseded by the blocker above)**
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
