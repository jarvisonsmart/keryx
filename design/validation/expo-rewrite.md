# Expo rewrite validation, 2026-09-27

Branch: `expo-rewrite`. No push, PR, deployment, published demo change, or
production key change. This report distinguishes observed behavior from code
review and automated core tests. It is **not full platform sign-off**.

The committed decision trail is [expo-rewrite-decisions.tsv](expo-rewrite-decisions.tsv).
Bare evidence filenames there refer to `/tmp/keryx-expo-audit/`.
Local evidence is in `/tmp/keryx-expo-audit/`. The disposable company and keys
are `/tmp/keryx-demo` and `/tmp/keryx-demo-keys`; keys are outside this repository.
The company was exposed through a temporary HTTPS tunnel for staging FCM.
One mistaken `make verify` fixture override briefly created disposable ignored
`.demo-sdk-keys` inside the working directory. They were moved outside immediately
after discovery and were never tracked; later runs use explicit external paths.

## Verification matrix

`PASS` means the stated scope was observed. `FAIL → FIXED` refers to a reproduced
regression and its subsequent check. `OPEN` means requested proof is still
missing, not a confirmed product failure. Web observations below are desktop
Firefox unless installed mode is explicitly stated. Core tests are not device
transport tests.

| Scenario | Android / FCM emulator | iOS simulator | Web PWA |
|---|---|---|---|
| Paste, origin confirmation, consent, first-company flow | PASS; real HTTPS company | PASS; real HTTPS company, unavailable-push continuation | PASS; paste and `?domain=&p=` deep link |
| Keyboard does not consume Continue or hide invalid-link errors | FAIL → FIXED; `e201345`, `1737e4e`; release error visible | PASS release invalid-link error visible after shared fix | PASS invalid-link error visible |
| Cancel pairing returns to the saved single company | FAIL → FIXED `3ec2dc5`; Release UI | FAIL → FIXED; Release UI | PASS actual Firefox E2E |
| Denying notification permission leaves pairing usable | Shared fix; denial not repeated | PASS unavailable-device path; denial distinct | FAIL → FIXED; `e201345`, Firefox denied permission |
| Camera permission/scanner | PASS permission/scanner screen; camera QR capture not proved | PASS scanner screen; simulator QR capture unavailable | PASS jsQR decodes injected video QR, real origin/consent and stopped tracks; physical camera not proved |
| Later-company silent path | FAIL → FIXED `85ce367`; release second company skips enable screen | No usable push transport here | PASS real WebPush permission/registration; later company skips enable screen |
| Verified rich content and SVG logo | PASS, release UI | PASS, debug UI | PASS |
| External link sheet displays actual domain | PASS, `Open example.com` | PASS, `Open example.com` | PASS, `Open example.com` |
| Hash-pinned images and media toggle | PASS toggle; hash rejection in core tests | PASS toggle | FAIL → FIXED; hero and inline image both hidden, `2055109` |
| Verified attachment bytes | PASS native share sheet with `audit.txt`; byte integrity in core/iOS checks | PASS native share sheet and exact cached 27 bytes | FAIL → FIXED; actual downloaded bytes and exactly one request, `ed50b34` |
| Signed in-place item update | PASS screenshot | PASS screenshot | PASS, Updated badge |
| Private order feed | PASS visible signed order card | PASS signed private order after removal/re-pair | PASS, verified private item in IndexedDB |
| Read-on-scroll and Contacts counts | PASS Contacts counts observed; scrolling lowered original company unread from 10 to 7 | PASS read flag changed on scroll; Contacts 11/9 match SQLite | PASS Contacts counts match IndexedDB; scrolling lowers unread from 6 to 1 |
| Language/tag filters, channel toggle, removal | PASS cs/demo filters, channel removal from feed, second-company removal | PASS filters/channel toggles/removal | PASS, removed companies/items/media all empty |
| Suspended identity hides content, Remove only | PASS independently signed unchainable root; no re-pair/content | PASS independently signed unchainable root; Remove succeeds | PASS, independently signed unchainable root |
| Rebrand requires explicit re-pair | PASS signed name change hides content and requires new QR | PASS signed name change hides content and requires new QR | PASS, master-signed company-name change |
| Expiry keeps saved messages | PASS signed expired timestamp | PASS signed expired timestamp | PASS, signed expired timestamp |
| Offline start and restart persistence | PASS release process restart with Wi-Fi/data disabled; cached content and media preference retained | FAIL → FIXED SQLite keys; Release cached startup and media preference with company server paused (not all-network isolation) | PASS offline reload and IndexedDB persistence |
| Text scaling | PASS live OS font scale 1.3; Contacts text wraps without clipping; restored 1.0 | FAIL → FIXED live Dynamic Type clipping, `74ceb09` | FAIL → FIXED root text-size scaling, `2f7de29` |
| Permission and self-test | PASS permission, neutral pending, final release green from staging FCM | PASS graceful unavailable state; no Firebase plist | PASS real Firefox WebPush enable flow |
| Real signed wake-up, background notice | PASS staging relay → FCM → generic channel notice | NOT TESTABLE real APNs: no identity/plist; simulator injection remains OPEN | PASS installed Firefox Android: harness → Mozilla WebPush → OS generic channel notice |
| Killed application native gate and notice | PASS staging FCM, release APK; no process before publish | OPEN: simctl delivery never reached callback | PASS browser main process absent after `am kill`; Mozilla WebPush restarts Firefox and displays new notice |
| Open app sync and foreground queue drain | PASS release killed queue drain before five-minute poll; separate active FCM delivery shows new signed item | OPEN due simulator delivery gap | PASS installed Firefox foreground shows the new signed item after harness WebPush; startup refresh also possible |
| Replay, tamper, authorization expiry | PASS JVM real Go-envelope tests; not malformed live FCM injection | PASS standalone Swift real Go-envelope tests; not simctl integration | PASS installed Mozilla delivery: valid notice, unchanged after replay/tampered sequence, fresh valid control updates notice; JS tests cover remaining malformed cases |
| Unfollow stops notices | PASS staging publishes to unfollowed Security and followed News; only News notice arrives | Core gate; transport OPEN | PASS installed harness WebPush: disabled Security sent zero, followed News updated its notice; direct valid Security injection also leaves its notice unchanged |
| Heartbeat and missing registration recovery | FCM topic leg has no endpoint registration/heartbeat by design | FCM/APNs topic leg likewise | PASS actual 204 heartbeat, deleted relay row, 404 then new 200 registration |
| Manifest, scope, `/keryx/`, update reload once | N/A native | N/A native | FAIL → FIXED first-open tab skipped later updates (`1ad5666`); real Firefox now proves first install no reload and two updates exactly one reload each; installed Firefox task updates on foreground |
| Installed standalone PWA | N/A native | N/A native | PASS Firefox Android HTTPS PWA launcher/window; Chrome WebAPK rejected by Play Store `unknown_account` |
| Application ID / signing / cleartext | PASS generated release ID and signingReport probe; release HTTP pairing rejected in the installed APK; release cleartext disabled; explicit debug hosts only | N/A Android rules | N/A |
| CI workflows | Reviewed Expo prebuild/module test/signing flow; not executed | No iOS delivery CI proof | Reviewed Expo export/Pages base; not executed |

UnifiedPush was not exercised on a de-Googled device. Neither physical Samsung
nor Graphene full-circle test was run. The staging relay and its VAPID key were
not changed.

## Notification evidence and limits

- **Android killed:** `fcm-killed.log` records staging FCM acceptance for sequence
  `1790525633`. `android-killed-push.xml` records persisted native queue/sequence.
  `android-killed-notification.txt` contains **New update in Security alerts**
  under `keryx-YCf11emEevcgiQrR4SmeWMltqo6GOS0VOrUbRii0Ltc`. The app had no process
  before publishing. This initial proof used the debug APK. A later release proof is in
  `fcm-final-release-killed.log` (sequence `1790530805`) and
  `android-final-killed-notice.txt` (notice at `1790530810258`). The release
  process was absent after `am kill` before publishing; FCM started it.
- **Android background:** `fcm-background-second.log` records staging FCM
  acceptance for sequence `1790527606`; `android-second-background-notification.txt`
  records the updated channel-tagged notice at `1790527610165` while Launcher stayed
  resumed. This used a release APK. The earlier file
  `android-background-notification.txt` contains no Keryx notice and is not proof.
- **Android foreground/background lifecycle:** `android-lifecycle-background-publish.log`
  records staging FCM sequence `1790531934`; the background notice title is **Keryx**,
  proving the native path. `android-active-publish.log` records a newly signed News
  item and sequence `1790532044`; `android-active-receive.log` observes it before
  periodic refresh, and `android-lifecycle-active-notice.txt` has the JS title
  **Trezor Company s.r.o.**. This validates foreground routing after `2aa097f`.
- **Android unfollow:** `android-unfollow-security.log` and
  `android-unfollow-control.log` sent to Security and News through staging FCM.
  `android-unfollow-later.txt` contains only the followed News notice.
- **Web:** `web-e2e-complete.log` on the latest export proves the local harness's signed wake-up traversed
  Mozilla WebPush and produced heartbeat 204. Restarting the harness without its
  registration DB produced foreground heartbeat 404, a fresh registration POST
  200, a changed registration ID, and no red banner. Headless Firefox cannot prove
  the OS notification display. The first final rerun used port 4180, which the
  harness's fixed CORS origin does not allow; rerunning at 4173 passed.
- **Installed PWA:** `pwa-background-publish.json` records one WebPush send and no
  failures. `pwa-background-notice.txt` records Firefox’s actual OS notice **New
  update in Security alerts** at `1790529899251`; `harness-public.log` records its
  heartbeat 204. `pwa-live.png` and `firefox-public-shortcut.txt` prove the HTTPS
  installed window and PWA launcher. A lost adb port reverse initially prevented
  registration; restoring it allowed the self-test/enable flow to complete.
- **Installed update:** `pwa-stamp-current.png` shows Build85ce367 before background.
  After exporting Build0c79650 and selecting the same Firefox task 57 through
  Recents, `pwa-updated-final.png` shows Build0c79650. The activity record stayed
  `147154675`, and the settings sheet closed as the page reloaded. No process
  restart, browser navigation or manual refresh was used.
- **Installed unfollow:** after the switch visibly removed Security content,
  `pwa-unfollow-security-fixed.log` records zero sends and
  `pwa-unfollow-control-fixed.log` records one News send.
  `pwa-unfollow-final-notices.txt` shows News at `1790532349105`, while the old
  Security notice stays at `1790532225125`. The first attempt missed the switch
  and is not counted as unfollow evidence.
- **Installed negative envelopes:** a temporary local sender used the harness VAPID
  key and the single owned Firefox subscription, with envelopes signed through
  `pub notify` and encrypted by the relay’s actual WebPush implementation.
  `pwa-gate-valid.log`/`pwa-gate-valid-notice.txt` show valid sequence `1790532556`
  and notice `1790532567406`. Replay and a changed sequence with unchanged
  signatures were accepted by Mozilla (`pwa-gate-replay.log`, `pwa-gate-tamper.log`);
  `pwa-gate-negative-notices.txt` shows no notice timestamp change during the
  observation window. A fresh valid control `1790532634` updated the notice to
  `1790532635685`. A signed Security envelope was later sent directly despite
  unfollowing (`pwa-gate-unfollowed.log`, sequence `1790532751`); its old notice
  stayed at `1790532225125`, while a News control updated to `1790532882815`
  (`pwa-unfollowed-raw-control-notice.txt`). This is notice-display evidence, not packet-level receipt
  telemetry for the rejected payloads.
- **Installed killed process:** `pwa-after-kill-pid.txt` is empty after `am kill`
  (timed in `pwa-killed-timing.txt`). `pwa-killed-publish.log` sent sequence
  `1790532688`; Firefox restarted with PID8808 and the generic News notice
  changed to `1790532696521` (`pwa-killed-notice.txt`). No PWA UI launch intervened.
- **iOS:** `swift-gate.log` proves the Swift verifier against a Go-signed envelope,
  replay, duplicate/escaped members, fractional counters, unknown fields, tampered
  sequence, expiry, and stale mirror updates. Malformed signature encodings were
  not separately exercised by this Swift harness.
  `simctl push` reported delivery, but the module callback, queue advance and notice
  were not observed. Background-fetch mode, registration and ad-hoc entitlement
  experiments did not establish delivery. Those temporary source changes were
  reverted; no simulator-only workaround was shipped. See `ios-callback.log`,
  `ios-signed-push.log`, and `ios-native-signed-push.json`.

## Bugs and fixes

| Symptom / root cause | Fix | Commit |
|---|---|---|
| Old web driver selectors no longer proved Expo state; macOS harness state was deleted from the wrong temp directory | Semantic/test-ID assertions and isolated TMPDIR | `c989c61` |
| iOS item/relay compound keys collided because SQLite's bridge truncates NUL-bound strings; JSON `$bytes` fields in publisher content were interpreted as transport markers | Encode storage keys, migrate intact row values, decode bytes only in media records | `86ad102` |
| Overlapping SQLite exclusive writes raised database locked | Serialize mutations | `94bb173` |
| Duplicate JSON members, noncanonical counters/signatures, expired authorization, concurrent replay and stale mirrors could evade or weaken gates | Strict JS/Java/Swift envelope parsers, authorization deadlines, atomic sequence advancement and native high-water preservation | `afc7213` |
| Unverifiable push recovery could fetch content before verification | Persist payload; metadata-only budgeted recovery, reverify before sequence/content, coalesce sync | `afc7213` |
| Same-hash cached public items bypassed current signature authorization; invalid cached content survived | Reverify cached items, remove failures | `bdc6fd1` |
| No independent foreground refresh without push | Startup/resume and active polling of companies due for refresh | `ee711e2` |
| Media URI cache ignored verified bytes; stale image could survive changed hash or remote-media disable | Bind URI to URL, bytes hash and MIME; invalidate image hook requests and hide hero too | `2055109` |
| Web pixel font sizes ignored root text-size preference | rem-based web text seam | `2f7de29` |
| First Continue tap only dismissed keyboard; permission denial trapped first pairing | Handled keyboard taps/insets; leave enable screen after denial | `e201345` |
| Debug cleartext was allowed for arbitrary origins | Deny by default; explicit local hosts only | `473e482` |
| Preview could not serve an Expo `/keryx/` export correctly; missing assets returned HTML | Strip configured base and return asset 404 | `5d4b7bb` |
| Absolute SDK fixture path override was prefixed with repository root | Resolve with Make `abspath` | `7a6713a` |
| Live iOS text-size change enlarged glyphs inside stale layout boxes | Remeasure native Text/TextInput when font scale changes | `74ceb09` |
| Network sync overwrote local channel/preferences changes or restored removed company | Compare starting company and atomically commit company/items only if still current | `8d8704e` |
| Unavailable channel role skipped cached signature checks after fresh master authorization | Check cached public signatures independently of role availability | `b73e87d` |
| Hash-verified attachment was reopened remotely, allowing different bytes | Download/share the exact verified bytes | `ed50b34` |
| Metadata-only recovery could update authorization without dropping invalid cached public items | Apply local cached verification and deletion during recovery, without fetching content | `20b226d` |
| Fast FCM self-test cleared its receipt before the UI checked for green | Use the delivered result for the current enable/retry tail | `99c3e78` |
| Private feed version/closure mutation changed the starting snapshot, causing guarded sync to reject valid results | Clone private feed entries before mutation; actual 404 closure commits and leaves input unchanged | `b4fd2ee` |
| Harness accepted only localhost PWA origin, blocking installed HTTPS test windows | Add an explicit `-app-origin` harness option and pass the driver origin | `63cf2bd` |
| Granted permission with failed registration was described as permission denial during pairing | Show the failing registration/topic/endpoint step | `b81df91` |
| Native reads overlapped separate exclusive transaction connections and failed with SQLite locked | Queue complete reads and writes; real simulator probe went from 5/120 failures to zero | `9004364` |
| First-open PWA tab treated every later controller change as initial installation, never reloading | Remember initial control; add real Firefox same-tab two-update regression | `1ad5666` |
| Failure copy exposed the protocol term “wake-up” | Use “notification” in both pairing and banner | `13eb1a7` |
| Later company reached enable screen despite granted permission because its topics were checked before subscription | Apply the live topic union before checking; preserve pending self-test topic | `85ce367` |
| Attached JS listener could suppress native notices while background JS was suspended | Gate JS delivery on native foreground state; retain durable queue | `2aa097f` |
| Rebrand screen trapped users away from their other companies | Add Back when multiple companies are followed; actual Android return passed | `0c79650` |
| Invalid-link error was hidden under the native keyboard | Dismiss keyboard before parsing; visible errors checked in both native release builds and web | `1737e4e` |
| Cancelling pairing with one saved company showed the empty welcome screen; initial routing effect did not rerun | Return directly to the saved company; inherited from main | `3ec2dc5` |

The native persistence fix was checked after a clean restart. A delayed mixed-I/O
probe against actual simulator SQLite reproduced five errors in 120 operations;
the same probe completed without errors after `9004364`. The temporary app-entry
probe was removed, and its source/logs are retained in the local evidence folder.

## Historical regression ledger

The first 80 commits on `main` were inventoried. Relevant fixes/features are listed
below; release bumps, documentation and unrelated tooling changes are omitted.
`Core` means the applicable tests ran in `make verify`/Vitest, not every platform UI.
`Code` means the behavior remains in source but the requested runtime proof is open.

| Main commit | Edge case | Rewrite check and outcome |
|---|---|---|
| `e19b848` | Release certificate must not change every build | Generated Gradle release selects env keystore in signingReport; CI signing reviewed. Real CI keystore not used locally. |
| `73542cc` | Concurrent topic diffs, partial failure persistence, mirror before transport, live union after self-test | Core FCM tests; native serial topic code reviewed; real toggle-during-test device proof open. |
| `242dd07` | Resume drains queued push; slow test stays neutral; pending test topic is allowed | Core FCM/notify tests; killed release FCM queue produced a new item on resume before periodic refresh was due. |
| `9af0c72` | Later-company skip uses native transport permission | Transport permission retained, but missing topic synchronization fixed in `85ce367`; actual later-company Android path passes. |
| `29a632e` | FCM union, UnifiedPush fallback, nonce handling | Core FCM tests; real staging FCM delivery; fallback device open. |
| `a709f62` | Native FCM receiver and exact topic subscription set | Real FCM killed/background notices; JVM topic tests. |
| `2a56215` | Capability → topic subscription → ready self-test handshake | Relay and FCM tests; Android pending observed; green observed on final release. |
| `5a577eb` | User text-size preference | Regressions fixed in `2f7de29`/`74ceb09`; browser and live iOS screenshots. |
| `a9371a4` | Present non-string media hashes never throw | Core malformed-image/attachment hash tests pass. |
| `5d28253` | Invalid init logo must not mint keys | Unchanged SDK; publisher test passes in make verify. |
| `9ed68ad` | Always fetch linked logo and verify provided hash | Unchanged CLI code reviewed; SDK tests pass; no separate CLI mismatch UI test. |
| `77fe4a1` | pub validate checks published media hash syntax | Unchanged SDK tests and real pub validation pass. |
| `78b14bc` | Non-string/empty/null attachment hashes rejected | SDK and client core tests pass. |
| `b6d36d2` | SHA-256 fields require lowercase hex | SDK and client core tests pass. |
| `c1ae473` | Notice names channel and is keyed by channel topic | Real Android channel notice/tag; web/Swift gate tests. |
| `bce5e3c` | Avoid invoking unsupported native mirror on web/iOS Capacitor | Expo now supports both native platforms; web bridge stays separate. Swift mirror tested. |
| `d21aa7f` | Open-app native wake-up triggers content sync | New item after killed release FCM appeared on foreground drain before the periodic refresh deadline; separate active FCM receipt also displayed a new signed News item before periodic refresh. |
| `5aa1c11` | ntfy registration, native gate/queue/ack | JVM gate and FCM queue proof; ntfy transport remains untested. |
| `f7360a3` | Android package visibility for UP distributor probe | Module manifest queries retained; AOSP/ntfy runtime open. |
| `7103dfc` | Worker does no content sync; page owns verification/recovery | Core recovery tests; fixed metadata-only recovery before content. |
| `4530713` | First company blocked until Android transport exists | Code retained for no-transport; iOS unavailable differs intentionally; AOSP runtime open. |
| `0c38bce` | Probe FCM vs UP and route installation CTA | Code reviewed; FCM selected on Play emulator; no-GMS case open. |
| `004cebc` | Real heartbeat/full-circle drivers | Expo/macOS driver fixed; final local Firefox E2E passes. Production driver adapted, not run against real demo. |
| `46a9e68` | Default, unregistered and failed banners have working CTAs | Native enable used; browser denied/enable flows used; all failure CTAs not separately exercised. |
| `c60b4c8` | Match missing registration by typed RelayGone | Core notify recovery tests pass. |
| `aa5b333` | Foreground checks registration | Real Firefox reload 404 → fresh registration. |
| `3446be7` | Gone heartbeat leads to recovery | Shared recovery tests and real Firefox driver pass; recovery is now page-owned. |
| `2f928cd` | Concurrent callers share one recovery | Core relay registration tests pass. |
| `f78f72c` | 404/410 typed as RelayGone | Core relay/notify tests pass. |
| `1f68711` | Timestamp refresh increments version | SDK regression test; signed expiry fixture refresh performed. |
| `296bd98` | Green banner only belongs to current enable flow | Code/core checked; fast FCM receipt cleanup exposed an additional UI fix; device green observed on final release. |
| `3d6bdff` | User-facing text says notifications | Browser/native UI observed; remaining failure copy corrected in `13eb1a7`. |
| `6cf5462` | Turn-on progress is centered and visible | Shared busy button/progress code reviewed; native pending screen observed. |
| `9b17099` | Explain permission need before OS prompt | Pairing UI observed on Android/iOS/web. |
| `5e5c83c` | Subscribe stays busy during TUF work | Consent path observed; busy disables actions in shared Button. |
| `b2f9cdb` | Tap date reveals exact local time | Format tests pass; device tap assertion open. |
| `d1fcaa3` | Build git stamp visible | Local `dev` stamp observed; EXPO_PUBLIC_GIT_COMMIT/CI injection reviewed. |
| `2c770fe` | Dead endpoint obtains fresh subscription | Core 410 recovery tests; real deleted-registration test passes. Actual dead push-service endpoint not induced. |
| `1b5637c` | pub notify waits for served versions | Real staging publishes report deployed timestamp/snapshot/targets/channel versions before notify. |
| `4acf540` | Timestamp URL nonce defeats stale CDN | Core fetch path retained and exercised by real sync. |
| `b1ca962` | Worker message refreshes UI, green timer independent, versioned metadata URLs | Core/source check; Firefox delivery/recovery and real signed refresh passed; green timing device open. |
| `2475adc` | Metadata cache revalidation | Core/source plus real signed refresh. |
| `f80fb74` | Same-topic replacement alerts again | `renotify` retained in worker; Android same-tag update observed; audible alert not measured. |
| `17abbf3` | Publisher signs exact relay envelope | Real pub notify through staging; cross-stack Go fixtures. |
| `7958232` | Successful relay refresh reserves one-minute interval, not 12 hours | Unchanged relay code and tests; staging refresh accepted test company. |
| `9934aa8` | Demo tool cannot overwrite existing keys | Unchanged guard reviewed; disposable demo only; no overwrite attempt against real keys. |
| `0eba28e` | New SW activates and reloads once | Real Firefox first install zero reloads, update one reload. The first-open tab variant failed and is fixed by `1ad5666`; installed Firefox task also moved from Build85ce367 to Build0c79650 on foreground without restart/manual refresh. |
| `01c5248` | Notification state visible with one company; late self-test polling | Shared banner present and pending observed; core tests pass. |
| `cb8e556` | Slow self-test remains neutral and listens | Core nonce/pending tests and Android pending screen; late green device proof open. |
| `1dc2ae6` | Relay self-test crosses actual encrypt/decrypt path | make verify relay E2E passes. |
| `7af2f6c` | First company enables notifications; later healthy additions skip | First-company flows observed; later-company FCM ordering regression fixed in `85ce367`, then release runtime passed. |
| `b92a690` | Root rotation drops retired master signature | SDK rotation test passes; disposable independent root rotation used in suspension test. |
| `59dcf4a` | State machine identifies failing leg and validates nonce | Core notify tests pass; every red UI leg not induced on devices. |
| `de8161e` | One app-wide registration covers union of followed companies | Core registration union tests; real Firefox registration/recovery. |

## Final automated checks

`make-verify-complete.log`: SDK vet/tests, relay tests/E2E, demo validation and
all 134 client tests against both demo and SDK artifacts passed. The later
`make-verify-latest.log` passes the same full suite with 136 client tests against
both fixture sets; `tsc-latest.log` and `tsc-ui-latest.log` pass.
`android-pairing-final-build.log`: module JVM tests and release APK passed.
`ios-release-final-build.log`: iOS Release simulator build succeeded and was installed.
After lifecycle and navigation fixes, `android-complete-build.log` and
`ios-complete-build.log` pass the Release builds; JVM and Swift gate checks pass.
`web-e2e-complete.log` repeats real Mozilla delivery/recovery on the latest export;
`web-update-complete.log` repeats first-install/two-update checks;
`web-camera.log` checks real jsQR decoding from injected video frames.
`web-later.log` repeats real push/recovery, pairs a second signed company without
the enable screen, matches both Contacts counts to IndexedDB, and observes the
first count decrease from 6 to 1 on scroll.

After the final keyboard fix, `tsc-keyboard.log`, `vitest-keyboard.log` (136 tests),
`android-keyboard-build.log`, `ios-keyboard-build.log` and `web-keyboard-build.log`
pass. Both native invalid-link visibility assertions and the web assertion passed.
The later cancellation assertion exposed another real navigation bug rather than
a test-selector issue. After fixing it, `android-cancel-fixed.log` and
`ios-cancel-fixed.log` pass the complete invalid-input, two-Back, saved-company flow.
`android-cancel-build.log`, `ios-cancel-build.log`, `web-cancel-build.log`,
`tsc-cancel.log` and `vitest-cancel.log` (136 tests) pass. The expanded committed
Firefox driver also passes against this export (`web-cancel-e2e.log`), including
pairing cancellation, actual Mozilla delivery/heartbeat and missing-registration recovery.

## Remaining verification

Installed-PWA notification display and update-on-foreground are proven. Full
sign-off still needs the native flows marked OPEN, a working iOS silent-push injection path (or signed device with
Firebase/APNs setup), and an AOSP/Graphene device with ntfy. Physical-phone
production E2E was not substituted with emulator/core-test results. CI workflows
were read, not run. No published demo anchor should be changed to perform these tests.

## Review notes

Independent review found no unsupported remaining sign-off claim. Negative WebPush
tests establish provider acceptance, unchanged notices and positive controls, not
receipt telemetry for each rejected packet. iOS callback/notice integration,
UnifiedPush, physical-phone production E2E and CI execution remain unproved.

## Cleanup

The servers, tunnels and adb mappings created for this run are stopped/removed
at completion. Pre-existing emulators, simulators, adb server and Metro8081 are
left running. `cleanup-final.json` confirms no listeners on the eight test ports
and no adb reverse mappings. Android font scale and connectivity, and iOS text size, are restored.
Disposable signed fixtures and local evidence remain outside the repository.
