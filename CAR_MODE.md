# KomenoTV car mode

## Authorized scope

The user requested implementation, validation, and deployment end to end on 2026-10-14.
The household URL on port 7000, its running service, files, database, and settings must remain intact.
The car frontend uses a separate HTTPS origin on the same host, port 7100 (confirmed free before deployment).
The existing read-only channel and live-stream APIs are reused; no second tuner/backend/database is installed.

## Acceptance

Latest commander behavior was requested by the user on 2026-10-15 and supersedes the original auto-tuning/fullscreen controls.

- 800x480 landscape layout; video retains its aspect ratio.
- Exactly 480p HEVC (H.265), explicit unsupported/error state, no silent codec fallback.
- No comments, comment WebSockets or account/settings synchronization.
- The channel menu starts hidden. Only rotation opens it; wheel and Tab/Shift+Tab represent rotary input.
- Reverse rotation relative to the previous implementation. Rotation changes only the candidate, never the playing station.
- Press/Enter/Space commits a different candidate and starts that station. A press with no new candidate toggles playback/stop of the current station.
- Stop closes the live connection. A later press resumes the same station. A user stop survives online/visibility recovery.
- After 5 seconds without rotation, hide the menu and discard any unconfirmed candidate.
- Do not handle Back, Escape, Backspace, arrows or PageUp/PageDown. Do not insert browser history entries or select from focus events.
- Restore the last committed station on re-entry; removed stations fall back to the first available station.
- Release the previous stream on station change, page exit or backgrounding, with generation guards for asynchronous startup.
- No household settings/authentication endpoints are proxied. Native Android Auto/Fermata bars remain outside the web UI's control.

## Code and checks

- client/src/views/Car/Watch.vue: car-only screen, existing mpegts.js and Channels API client.
- client/src/utils/CarControls.ts: selection, debounce and menu state; Node built-in regression tests.
- client/src/stores/SettingsStore.ts: local-only car_last_channel_id, excluded from synchronized settings.
- client/src/router/index.ts: car build selects the car view at /tv/; the normal build preserves existing routes.
- scripts/car-gateway.mjs: static frontend plus an allowlisted GET-only proxy to the existing loopback API.
- scripts/Start-KomenoTV.ps1: isolated background gateway and Akebi HTTPS listener, without restarting port 7000.

From client/, using Node 20 and the existing Yarn v1 runtime:

    corepack yarn test:car
    corepack yarn lint
    corepack yarn typecheck
    corepack yarn build:car

Verify proxy security with real local HTTP tests, then verify the actual 800x480 browser screen and HEVC playback.
Household HTML hash and service PIDs were recorded and match before/after deployment. Phone/DHU input verification remains pending. See HANDOFF.md for measured results.

## Deployment boundary

Use only loopback for the internal gateway and only the existing Tailscale IPv4 address for the new HTTPS listener.
Preserve upstream MIT notices. Keep runtime logs/PIDs out of Git. Do not change the production server configuration or service.
The car build writes to client/dist-car/; the normal tracked client/dist/ is preserved.
