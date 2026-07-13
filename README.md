# ThetaBet — The First Betting SocialFi Protocol

*Turn sports tipsters into investable on-chain assets.*

> **DoraHacks — [Tether Developer Cup](https://dorahacks.io/)**  
> Tracks: **WDK** · **QVAC** · **PEAR**

---

## Demo videos

<div align="center">

<table>
<tr>
<td width="50%" align="center" valign="top">

### Qualification

[![Qualification — Tether Developer Cup](https://img.youtube.com/vi/EOCiyINNVZA/hqdefault.jpg)](https://youtu.be/EOCiyINNVZA)

**[▶ Qualification video](https://youtu.be/EOCiyINNVZA)**

Entry submission for the **Tether Developer Cup** hackathon.  
Wallet, Azuro betting, ERC-4626 vaults, Pear chat.

</td>
<td width="50%" align="center" valign="top">

### Quarter finals (Round 16)

[![Quarter finals — Round 16](https://img.youtube.com/vi/OpPGKfl4ZdI/hqdefault.jpg)](https://youtu.be/OpPGKfl4ZdI)

**[▶ Quarter finals video](https://youtu.be/OpPGKfl4ZdI)**

**Round 16** update: AI orchestrator, tipster notes, peer inference, vault chats, translator.

</td>
</tr>
</table>

</div>

---

## The pitch (DoraHacks)

**ThetaBet** is a **React Native wallet** built with **[Tether WDK](https://docs.wdk.tether.io)**. It ships a **built-in bookmaker** on **[Azuro Protocol V3](https://gem.azuro.org)** — live **football odds on-chain** on Polygon.

Users can **register as a tipster vault** or **subscribe to one**. Vaults are **ERC-4626**: fans discover tipsters, **stake USDT**, and receive share tokens. The tipster does not only give tips — they **bet a percentage of the pooled stake** through the vault on Azuro, so the community shares one bankroll, one gas bill, and one verifiable track record.

**Additional features in the app:**

| Layer | What it does |
|-------|----------------|
| **QVAC** | Local LLMs orchestrated on-device to suggest outcomes on the **Bets** match page — scouts, streamed analysis, picks locked to real Azuro markets |
| **Pear** | P2P **DMs** and **public / private group chat** so fans and tipsters interact without a central server |
| **WDK** | BIP-39/44 accounts, transaction signing, biometric unlock — everything that needs keys runs through the wallet worklet |

---

## What ThetaBet does

### Wallet (WDK)

Self-custodial **React Native** app: key generation, EVM signing, USDT on Polygon, biometric access, transaction history. One identity for bets, vaults, chat, and AI.

### Bookmaker (Azuro V3)

Embedded **football sportsbook** — browse fixtures, build a slip, place bets from the wallet. Odds and settlement are on-chain via Azuro liquidity pools and oracles.

### Tipster vaults (ERC-4626)

| Who | Action |
|-----|--------|
| **Tipster** | Register `@handle`, create vault, bet **% of pool** on Azuro for subscribers |
| **Fan** | Discover tipsters, stake USDT, hold shares, redeem pro-rata anytime |
| **Protocol** | All custody in `ThetaSingleton`; Ponder indexes ROI, win rate, TVL |

The tipster **plays through the vault** for the community instead of posting picks people must copy manually.

### Social (Pear)

- **Public channels** — open sports / discovery rooms  
- **Vault-gated chats** — investors only (signed share proof)  
- **Encrypted DMs** — `@handle` from on-chain registry  
- **Peer inference** — opt-in tipsters can run Match AI for remote users over P2P  

### AI (QVAC)

On-device models (Llama, Phi, Qwen via llama.cpp in a Bare worklet). **Match orchestrator** on the bet screen: web scouts → streamed preview → catalog-locked picks. Optional **translation** of tips and chat.

---

## What's new in the quarter finals

Changes since the **qualification** video:

| Feature | Description |
|---------|-------------|
| **Match orchestrator** | QVAC pipeline: parallel scouts, streamed analysis, picks tied to Azuro outcome catalog |
| **Tipster knowledge** | Profile thesis + per-match hints (voice/text); orchestrator uses them in analysis |
| **Peer inference** | Tipsters opt in as signed P2P inference providers; requesters browse peers on-device |
| **Vault-gated chats** | Private investor rooms per vault; wallet-signed share threshold to read/write |
| **Translator** | On-device translation for scout output, tips, and chat messages |
| **Inference USB tooling** | Dev scripts for phone ↔ terminal inference/DM over `adb` (WSL testing) |
| **Scout performance** | Faster preview tokens, skip broken rewrite pass, stable fallbacks |

**Still planned (not in demo):** micropayments for peer inference via **state channels** / token payment.

---

## Future work (next round)

| Area | Goal | Status |
|------|------|--------|
| **QVAC** | Fix worklet stability — QVAC inference intermittently fails in Bare worklets on device | 🔧 In progress |
| **Pear** | Stronger chat **persistency** via **[Autobase](https://docs.pears.com)** — need deeper integration | 📋 Planned |
| **Privacy (optional)** | Mixer-style **Circom2** + **drand** timelock so vault bets stay anonymous until reveal; vault funds centralized in `ThetaSingleton` today to support that design | ⏸️ Deferred — dropped for this round, remains on roadmap |

We **gave up on Circom2 / private bets** for the quarter-finals deadline. The singleton custody model is intentionally compatible with anonymous settlement later; it is **optional stretch**, not required for the current product.

---

## Why tipsters as financial products?

| Old world | ThetaBet |
|-----------|----------|
| Monthly subscription regardless of results | Tipster earns only when the vault grows |
| Screenshot track records | Every bet on-chain in `ThetaSingleton` |
| Manual copy-trading | Pooled vault — tipster bets once for everyone |
| Telegram + Discord + Twitter | Wallet, book, vault, and chat in one app |
| One tipster, all-in | Portfolio of vault shares across many tipsters |

---

## Hackathon tracks

| Track | What we built |
|-------|----------------|
| **WDK** | Self-custodial React Native wallet — keygen, signing, USDT, Polygon txs in a Bare worklet |
| **QVAC** | On-device LLM orchestrator, translation, optional peer inference provider |
| **PEAR** | Hyperswarm P2P chat, vault-gated channels, encrypted DMs, inference directory |

---

## Architecture

```
                          ┌──────────────────────────────────────────────────────────┐
                          │              Expo React Native App (Hermes)              │
                          │   Wallet · Azuro bets · Vaults · Chat · Match AI        │
                          └──────────┬────────────┬────────────┬────────────────────┘
                                     │            │            │
                              bare-rpc│       WDK  │       bare-rpc
                                     ▼            ▼            ▼
                          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
                          │ Pear P2P     │ │ WDK EVM  │ │ QVAC AI      │
                          │ Hyperswarm   │ │ signing  │ │ llama.cpp    │
                          │ inference    │ │          │ │ translation  │
                          └──────────────┘ └──────────┘ └──────────────┘
                                     │
                                     ▼ JSON-RPC / on-chain
┌────────────────────────────────────────────────────────────────────────────────────┐
│                         Polygon Mainnet · Azuro V3 · ThetaSingleton              │
│   TipsterVault (ERC-4626) · AzuroBet NFTs · Ponder indexer · GraphQL API         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Smart contracts (summary)

### ThetaSingleton

Master contract on [Polygon mainnet](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1#code):

- **Custody** — all USDT; vaults hold zero balance
- **Vault factory** — `createVault(name, symbol)` per tipster
- **Azuro bettor** — direct LP and gasless relayer (ERC-1271) paths
- **Name registry** — `@handle` + secp256k1 pubkey for Pear discovery

### TipsterVault (ERC-4626)

Share token delegating custody to the singleton: `deposit` / `redeem` / `totalAssets` via `ThetaSingleton`.

### Whitelist (mainnet safety)

Contract is **whitelist-gated** on Polygon mainnet (Azuro has no viable testnet liquidity). Only approved addresses can `createVault`, `deposit`, `placeBet`, etc. Whitelist opens when ready for public access.

---

## Repository structure

```
thetabet/
├── apps/mobile/          # Expo React Native app (wallet, bets, vaults, chat, AI)
│   ├── pear-end/         # Pear P2P + peer inference Bare worklet
│   ├── qvac/             # QVAC AI worker bundle
│   └── src/              # UI, Azuro, vault, QVAC, tipster-notes services
├── contracts/            # Foundry — ThetaSingleton, TipsterVault
├── ponder/               # Indexer + GraphQL API
└── tools/                # dev-stack, peer console, deploy scripts
```

---

## Getting started

**For hackathon reviewers:** expect **~20–40 minutes** on first install (Android SDK + native build). After that, relaunch takes **~2 minutes**.

You need **two terminals** every time you run the app:

1. **Ponder indexer** (vault rankings, tipster stats) — `npm run dev:stack`
2. **Metro + Android** — `npm run start:clean`

### What works without extra setup

| Feature | Reviewer notes |
|---------|----------------|
| **Launch app** | Follow steps below |
| **Browse football odds** | Azuro markets load from public APIs + Polygon RPC |
| **Pear public chat / DMs** | Onboarding → **Skip wallet (dev · 0xd3ad)** — no seed phrase, no API keys |
| **Match AI (QVAC)** | Settings → download a local model (~1–2 GB), then open a match on **Bets** |
| **Vault rankings UI** | Needs Terminal 1 (`dev:stack`) running |

### What needs a whitelisted wallet

`ThetaSingleton` on Polygon mainnet is **whitelist-gated** (see [Smart contracts](#smart-contracts-summary)). Without a whitelisted address you can still browse and demo chat/AI, but **vault deposit, withdraw, and on-chain betting** will show a whitelist error. That is expected for reviewers.

**WDK indexer API key** (`EXPO_PUBLIC_WDK_INDEXER_API_KEY`) is optional — copy `.env.example` → `.env` and leave the placeholder if you only use **Skip wallet**.

---

### Path A — Android emulator (recommended for reviewers)

No physical phone. No `cloudflared`. Ponder is reached at `10.0.2.2:42069` from the emulator.

#### 1. Prerequisites

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | ≥ 20 (**22** recommended) |
| **pnpm** | ≥ 9 |
| **Java JDK** | 17–21 |
| **Android SDK** | API **36**, platform-tools, build-tools **36.0.0** |
| **Android NDK** | **27.1.12297006** (required). **29.0.14206865** optional but recommended for QVAC |
| **Android emulator** | API 36 system image (via Android Studio Device Manager) |

**Linux (Debian/Ubuntu):**

```bash
# Node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22
corepack enable && corepack prepare pnpm@latest --activate
sudo apt install -y openjdk-17-jdk curl

# Android SDK — install command-line tools, then:
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "ndk;29.0.14206865" "system-images;android-36;google_apis;x86_64"
```

**macOS:**

```bash
brew install node openjdk@17 pnpm cloudflared
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

Add `ANDROID_HOME` and `PATH` to your shell profile.

#### 2. Clone and install

```bash
git clone https://github.com/SolidityDrone/thetabet.git
cd thetabet
pnpm install
cd ponder && npm install && cd ../apps/mobile
npm install --ignore-scripts
npm run link:bare
cp -n .env.example .env
```

#### 3. First-time build (~15 min)

Start an emulator (Android Studio → Device Manager), then:

```bash
cd apps/mobile
npm run bundle:pear
npm run bundle:qvac
npx expo prebuild --clean --platform android
npm run android          # builds debug APK and installs on emulator
```

#### 4. Run (every session)

**Terminal 1** — Ponder (repo root):

```bash
cd thetabet
npm run dev:stack
```

Wait for `Ponder ready at http://localhost:42069/graphql`.

**Terminal 2** — Metro (`apps/mobile`):

```bash
cd apps/mobile
npm run start:clean
```

Press **`a`** in the Metro terminal to open on the Android emulator, or:

```bash
npm run open:android
```

**In the app:** tap **Skip wallet (dev · 0xd3ad)** → explore **Bets**, **Channels**, **Profile**.

---

### Path B — Physical Android phone over USB

Use this for a real device. **USB + `adb reverse`** is enough for Ponder in most cases. Add the Cloudflare tunnel only if the Profile/vault tab cannot reach the indexer.

#### Extra prerequisites

- USB debugging enabled, `adb devices` lists the phone
- **cloudflared** — only for `dev:stack:tunnel` (optional on USB; see below)

```bash
# Linux — cloudflared (optional)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
```

**WSL2:** if `adb devices` is empty, attach USB with [usbipd-win](https://github.com/dorssel/usbipd-win) or use `adb.exe` from Windows.

#### Run (every session)

**Terminal 1** — pick one:

```bash
cd thetabet
npm run dev:stack              # USB: adb reverse tcp:42069 (try this first)
# npm run dev:stack:tunnel     # optional: Cloudflare URL → tunnel.generated.ts
```

If using the tunnel, wait for `Tunnel URL written: https://….trycloudflare.com` **before** starting Metro.

**Terminal 2** — Metro + USB:

```bash
cd apps/mobile
adb devices
adb reverse tcp:8081 tcp:8081
npm run start:clean
```

**Terminal 3** (or after Metro is up):

```bash
cd apps/mobile
npm run open:android
```

| Step | Command |
|------|---------|
| 1 | `npm run dev:stack` (or `:tunnel`) — wait until Ponder is ready |
| 2 | `adb reverse tcp:8081 tcp:8081` |
| 3 | `npm run start:clean` |
| 4 | `npm run open:android` |

Large APK install over slow USB: `npm run install:android` instead of `npm run android`.

---

### Rebuild worklets (after editing `pear-end/` or `qvac/`)

```bash
cd apps/mobile
npm run bundle:pear
npm run bundle:qvac
# reload app; if native addons changed:
npm run link:bare && npm run android
```

---

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| White screen after splash | `adb reverse tcp:8081 tcp:8081` → `npm run start:clean` → `npm run open:android` |
| Profile / vault tab empty | Start Terminal 1 (`npm run dev:stack`); on USB try `dev:stack:tunnel` and reload app |
| Port 8081 busy | `npm run kill:metro` then `npm run start:clean` |
| Ponder won't start | `npm run dev:stack:reset` |
| `ADDON_NOT_FOUND` in logcat | `npm run link:bare` → `npx expo prebuild --clean --platform android` → `npm run android` |
| Import error `tunnel.generated` | File is in repo with an empty default; pull latest `main` |

### Optional — P2P from terminal

```bash
cd apps/mobile
npm run pear:chat -- --vault 0xYourVault --bypass-tag <tag>
npm run pear:dm:dev
```

More detail: `apps/mobile/README.md`.

---

## Live deployment

| Resource | Link |
|----------|------|
| ThetaSingleton | [`0x2D2339Cd...`](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1) |
| Qualification demo bet | [tx `0x9b98da17...`](https://polygonscan.com/tx/0x9b98da175a2379dc36dfe1984a28dd3af41c30ef43680ed8daef48ac462a61cb) |
| Ponder start block | 89,896,604 |

---

## Environment variables

Copy `apps/mobile/.env.example` → `apps/mobile/.env`.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_WDK_INDEXER_BASE_URL` | WDK transaction history |
| `EXPO_PUBLIC_WDK_INDEXER_API_KEY` | WDK API key |
| `EXPO_PUBLIC_PONDER_URL` | Override Ponder GraphQL endpoint |

---

## References

- [Pear docs](https://docs.pears.com)
- [WDK docs](https://docs.wdk.tether.io)
- [Azuro Protocol](https://gem.azuro.org)
- [QVAC SDK](https://qvac.ai)
- [Ponder](https://ponder.sh)

## License

MIT
