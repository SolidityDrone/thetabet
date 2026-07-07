# ThetaBet Mobile

Expo 54 + WDK wallet starter + **Pear P2P chat** (Bare worklet via `react-native-bare-kit`).

## Setup

```bash
nvm use 22
cd apps/mobile
npm install --ignore-scripts
npm run link:bare
npm run bundle:pear
cp -n .env.example .env    # optional WDK indexer API key
npx expo prebuild --clean --platform android
npm run android
npm start              # frees port 8081, then starts Metro there
npm run open:android   # adb reverse + localhost deep link (port 8081)
```

Use **npm** in this folder only. After any `npm install`, run `npm run link:bare` again before rebuilding native.

## Dev wallet skip

On onboarding, tap **Skip wallet (dev · 0xd3ad)** to jump straight into chat with stub address:

`0xd3ad000000000000000000000000000000dead` on Polygon Amoy.

## Pear chat

- **Channels** tab: create public/private Hyperswarm channels, join by topic key
- **Tipster** tab: onboard as tipster (public discovery + private fan channel)
- **Wallet** tab: dev stub or full WDK wallet

Rebundle the Pear worklet after editing `pear-end/`:

```bash
npm run bundle:pear
```

Test P2P against WSL peer (`tools/peer`):

```bash
cd tools/peer
node index.mjs --topic <hex-topic-key> --name "WSL peer"
```

## Metro started on 8082 (8081 busy)?

A leftover Metro from a prior terminal session holds **8081**. `npm start` now runs `kill:metro` first and pins `--port 8081`.

```bash
npm run kill:metro     # or from repo root: npm run mobile:kill-metro
npm start
npm run open:android
```

If you intentionally run Metro on another port:

```bash
METRO_PORT=8082 npm run open:android
```

## White screen after splash?

**1. Dev client cached a LAN Metro URL** (common on WSL + USB):

```bash
adb reverse tcp:8081 tcp:8081
npm run open:android
```

**2. `isEdgeToEdge is not a function` JS crash** — fixed in `metro.config.js` (do not add `.mjs` to `sourceExts`). If you still see it after a metro config change:

```bash
npm run start:clean
npm run open:android
```

**3. Native addon missing** — if logcat shows `ADDON_NOT_FOUND` / `sodium-native`:

```bash
npm run link:bare
npx expo prebuild --clean --platform android
npm run android
```

Launch with localhost Metro URL if the dev client cached a LAN IP:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d "exp+thetabet://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" \
  io.thetabet.app
```
