# KomenoTV car mode

## Authorized scope

The user requested implementation, validation, and deployment end to end on 2026-10-14.
The household URL on port 7000, its running service, files, database, and settings must remain intact.
The car frontend uses a separate HTTPS origin on the same host, port 7100 (confirmed free before deployment).
The existing read-only channel and live-stream APIs are reused; no second tuner/backend/database is installed.

## Acceptance

- 800x480 landscape layout; video retains its aspect ratio.
- Request exactly 480p HEVC (H.265), with an explicit unsupported/error state rather than silently switching codec.
- No comment overlay, comment WebSocket connection, or account/settings synchronization.
- Commander rotation selects channels. Commit only the final candidate after 500 ms without rotation.
- Hide only the bottom channel menu after 5 seconds without input. Rotation, channel focus, pointer input, and Back restore/reset it; idle hiding must not change the channel or stop playback.
- Press/Enter hides the car menu and expands video inside the available viewport. Manual fullscreen remains fullscreen during rotation.
- Back/Escape restores the menu without leaving the player or stopping it.
- Restore the last channel on re-entry/reconnection. Removed channels fall back to the first available channel.
- Support keyboard, wheel and channel-button focus so native rotary focus traversal can select a channel.
- Destroy the previous stream on a channel change, page exit, or backgrounding; reconnect when visible/online.
- Playback failures provide a visible retry action. No household configuration or authentication endpoints are proxied.
- Android Auto's system dock and Fermata's native chrome are outside the web UI's control.

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
