# ThetaBet — The First Betting SocialFi Protocol

*Turn sports tipsters into investable on-chain assets.*

[![Demo video](https://img.youtube.com/vi/EOCiyINNVZA/0.jpg)](https://youtu.be/EOCiyINNVZA)

> **DoraHacks submission** — opted in for tracks **QVAC**, **WDK**, and **PEAR**.  
> [View on DoraHacks](https://dorahacks.io/)

---

## What is ThetaBet?

ThetaBet is a **fan-to-creator social betting network** built on **Polygon** and **Azuro Protocol**. It reimagines what it means to "follow" a sports tipster — turning a passive subscription into an **investable position** with real, verifiable on-chain returns.

Instead of paying a tipster a monthly fee for picks (where you lose money whether they win or lose), fans **deposit into a tipster's on-chain vault**, receive **ERC-4626 share tokens** representing their pro-rata stake, and the tipster bets the vault's pooled funds on Azuro. When the tipster wins, the vault grows and every share is worth more. When they lose, everyone shares the loss proportionally.

This creates a fundamentally different incentive structure:
- **Tipsters** are economically bonded to their performance — they cannot withdraw principal, only bet.
- **Fans** hold liquid shares that can be redeemed at any time for a pro-rata slice of the vault's PnL.
- **Every bet, win, and loss is on-chain** — no cherry-picked screenshots, no fake track records.
- **Tipsters become financial products** — any wallet can hold shares in multiple vaults simultaneously, diversifying across tipsters like a portfolio of hedge funds.

The communication layer — built entirely on **Pear (Holepunch) P2P** — gives each vault a **token-gated private channel** where the tipster and their investors discuss strategy, share analysis, and build community. Public channels, direct messages, and handle-based discovery complete the social experience. **No servers, no central relay, no data leaks.**

On-device **AI match analysis** via **QVAC** runs a local LLM (downloaded from Hugging Face, inferred in a Bare worklet via llama.cpp for Android NDK r27) — no cloud dependency, no API keys, no data leaving the phone.

---

## Problem: Following Tipsters Is Broken

The sports betting creator economy today suffers from structural flaws:

| Problem | Consequence |
|---------|------------|
| **Fixed subscription fees** | You pay the tipster regardless of performance — negative expected value from day one. |
| **No verifiable track record** | Tipsters cherry-pick winning screenshots. Losers disappear. No on-chain audit trail. |
| **Manual copy-trading** | You must replicate every bet yourself — slow, error-prone, gas-inefficient. |
| **No portfolio diversification** | You put all your trust (and money) in one tipster. No way to spread risk. |
| **Fragmented communication** | Telegram for picks, Discord for chat, Twitter for hype — siloed, no integration with the betting layer. |
| **No secondary markets** | Your position in a tipster is non-transferable. You cannot exit early or trade it. |

## Solution: Tipsters as Financial Products

ThetaBet solves every point above:

1. **Zero fixed fees.** The tipster earns nothing unless the vault grows. Their incentive is pure performance.
2. **On-chain accounting.** Every bet is recorded in `ThetaSingleton`. Vault metrics (total assets, win rate, PnL, open bets) are indexed by **Ponder** and exposed via REST API. Verifiable by anyone on PolygonScan.
3. **Pooled liquidity.** The tipster bets the entire vault, not individual fan allocations. Gas costs are shared. Positions are managed as a single portfolio.
4. **Multi-vault portfolios.** A fan can hold shares in 10 different vaults simultaneously — treat tipsters like asset classes.
5. **Unified P2P communication.** The chat layer is built into the app — public channels for discovery, private token-gated channels for each vault, E2E encrypted DMs. All P2P, no servers.
6. **Liquid shares.** Vault shares are ERC-20 tokens — in theory transferable, always redeemable.

### The Virtuous Flywheel

A winning tipster's vault grows in value → existing fans see their shares appreciate → word spreads → new fans deposit → vault size increases → tipster can place larger bets → potential returns compound → the cycle repeats. Conversely, a losing tipster gets redeemed into irrelevance. **The market self-corrects.**

---

## DoraHacks Track Submissions

| Track | Implementation | Technical Detail |
|-------|---------------|------------------|
| **QVAC** | On-device LLM inference via `@qvac/sdk` | llama.cpp compiled for Android NDK r27, running in a third Bare worklet. Models (Llama 3.2, Phi-3, Qwen 2.5) downloaded from Hugging Face and run 100% offline. Match analysis agent with optional web research — no cloud dependency, no data leaves the device. |
| **WDK** | Self-custodial wallet via `@tetherto/wdk-react-native-provider` | BIP-39/44 key generation, EVM transaction signing, `signMessage`/`sendTransaction` through a dedicated Bare worklet. Supports Polygon mainnet. Bet Token (USDT) balances, transaction history, biometric lock, multi-account derivation. |
| **PEAR** | P2P chat via Holepunch stack (Hyperswarm, Hypercore, Corestore) | Runs in a dedicated Bare worklet via `react-native-bare-kit`. Hyperswarm DHT peer discovery, Hypercore append-only logs for message persistence, Corestore on-device storage. Token-gated private channels, public discovery channels, E2E encrypted DMs via Ed25519 key exchange, handle-based identity resolution against on-chain `TipsterNameRegistered` events. |

---

## Communication Layer

ThetaBet's chat is not a bolt-on — it is the primary user interface, deeply integrated with the on-chain betting layer.

### Channel Types

| Type | Access | Use Case |
|------|--------|----------|
| **Public channels** | Anyone can join (announced Hyperswarm topic) | General sports discussion, tipster discovery, market talk |
| **Private vault channels** | Token-gated: `balanceOf(fan) >= threshold` on the vault's ERC-20 | Tipster shares picks, analysis, and strategy with their investors only |
| **Direct messages** | E2E encrypted via Ed25519 key exchange | Private conversations between any two users |

### Identity

- Each user generates an **Ed25519 keypair** on first launch, persisted in the Bare worklet.
- Users can register an on-chain **@handle** (3–20 chars, `[a-z0-9_]`) via `ThetaSingleton.registerTipsterName()`, which also publishes a secp256k1 public key for P2P discovery.
- Handle resolution: `@name → wallet address → pubKeyX/pubKeyY` read from the singleton — no centralized directory.

### DM Protocol

1. User A looks up `@userB` → singleton returns their wallet address and secp256k1 public key.
2. Worklet derives a shared E2E key via Ed25519 Diffie-Hellman (`deriveDmKey`).
3. Contact request is sent over a per-user DHT topic (`thetabet-contact:<address>`).
4. On acceptance, both sides create a dedicated Hypercore for the DM thread (`thetabet-dm-out:<dmId>`, `thetabet-dm-in:<dmId>`).
5. Messages are encrypted with `encryptText(plaintext, sharedKey)` before appending to the core; decrypted on the receiving end with `decryptText(ciphertext, sharedKey)`.

---

## Architecture

```
                          ┌──────────────────────────────────────────────────────────┐
               │              Expo React Native App               │
                          │                                                          │
                          │  ┌──────────────────────────────────────────────────┐   │
                          │  │             RN UI Layer (Hermes)                 │   │
                          │  │   Chat · Wallet · Vaults · Bet Slip · AI Agent  │   │
                          │  └──────────┬────────────┬────────────┬─────────────┘   │
                          │             │            │            │                 │
                          │    bare-rpc │ WDK hooks  │ bare-rpc   │                 │
                          │             ▼            ▼            ▼                 │
                          │  ┌────────────┐ ┌──────────┐ ┌────────────┐            │
                          │  │Bare wkt #1 │ │Bare wkt  │ │ Bare wkt   │            │
                          │  │ Pear P2P   │ │ #2 WDK   │ │ #3 QVAC AI │            │
                          │  │Hyperswarm  │ │ EVM eng  │ │ llama.cpp  │            │
                          │  │Corestore   │ │signMsg   │ │ LLM inf.   │            │
                          │  └────────────┘ └──────────┘ └────────────┘            │
                          └──────────────────────┬──────────────────────────────────┘
                                                 │ JSON-RPC
                                                 ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              Polygon Mainnet (chain 137)                          │
│                                                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────┐  │
│   │                         ThetaSingleton                                    │  │
│   │  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐  │  │
│   │  │  Custody      │  │  Vault Factory   │  │  Azuro Bettor              │  │  │
│   │  │  All USDT      │  │  createVault()   │  │  placeBet()/settleBet()    │  │  │
│   │  │  sits here     │  │  one per tipster  │  │  prepareVaultBet()        │  │  │
│   │  └──────────────┘  └──────────────────┘  │  ERC-1271 isValidSignature()│  │  │
│   │                                           └─────────────────────────────┘  │  │
│   └─────────────────────┬──────────────────────────────────────────────────────┘  │
│                          │                                                         │
│                creates   │          bets via LP.betOrder / LP.bet                  │
│                          ▼                                                         │
│                 ┌──────────────┐   ┌─────────────────────────────────────────┐    │
│                 │TipsterVault  │   │  Azuro v3 Protocol                      │    │
│                 │[1..N]        │   │  LP + Core + Relayer                   │    │
│                 │ERC-4626 share│   │  AzuroBet NFT (ERC-721, positions)     │    │
│                 │no funds held │   │  Condition resolution (oracle)          │    │
│                 └──────────────┘   └─────────────────────────────────────────┘    │
│                           │                                                       │
│                           ▼                                                       │
│                 ┌──────────────────┐                                              │
│                 │ Ponder Indexer   │                                              │
│                 │ PostgreSQL       │                                              │
│                 │ REST API (Hono)  │                                              │
│                 └──────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

### ThetaSingleton (`contracts/src/ThetaSingleton.sol` — [PolygonScan](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1#code))

The master contract (single instance on Polygon mainnet). Responsibilities:

- **Custody** — holds all USDT. Vaults hold *zero* balance.
- **Vault factory** — `createVault(name, symbol)` deploys a `TipsterVault` ERC-4626 share token. One vault per tipster.
- **Per-vault accounting** — `vaultFreeBalance[vaultId]`, `vaultTotalAssets(vaultId)` aggregates free balance + unsettled bet exposure + claimable payouts.
- **Azuro bettor** — two bet paths:
  - *Direct LP*: `placeBet(core, amount, order, data)` calls `LP.betOrder`, records the AzuroBet NFT.
  - *Relayer (gasless)*: `prepareVaultBet(stake, orderHash, expiresAt)` reserves liquidity, implements **ERC-1271** so the Azuro relayer can submit orders with the singleton as `bettor`. The tipster signs an EIP-712 order off-chain; the singleton validates via `isValidSignature`.
- **Bet lifecycle** — `syncVault()` scans open bets against Azuro conditions:
  - Canceled → stake refunded to free balance.
  - Won → `LP.withdrawPayout` called, payout credited to free balance.
  - Lost → marked lost, stake deducted from total assets.
- **Name registry** — `registerTipsterName(name, pubKeyX, pubKeyY)` — unique `@handle` with secp256k1 public key for P2P discovery.

### Whitelist (Security Gate)

**The ThetaSingleton contract is whitelist-gated.** Because Azuro Protocol has no viable testnet market (Azuro Amoy lacked liquidity), the contract was deployed directly on Polygon mainnet. To prevent unauthorized access to a mainnet contract, only whitelisted addresses can call user-facing entry points (`createVault`, `deposit`, `placeBet`, `prepareVaultBet`, etc.).

The only whitelisted address is the deployer / tipster account:
```
0xe257cf8ECa1aF94117bEe3809F705bC6e51CbD5c
```
[View on PolygonScan](https://polygonscan.com/address/0xe257cf8ECa1aF94117bEe3809F705bC6e51CbD5c)

This address signed the bets shown in the demo video.

Only the deployer (`0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D`) can add or remove whitelisted addresses via `whitelistAddress()` / `removeWhitelistAddress()`. Anyone else calling `createVault()` or `placeBet()` will get `NotWhitelisted()`.

This is a deliberate safety mechanism — the whitelist will be opened when the protocol is ready for public access.

### TipsterVault (`contracts/src/TipsterVault.sol`)

An ERC-4626 share token that *delegates* all custody to the singleton:

- `deposit(assets, receiver)` → transfers USDT to singleton → `singleton.depositFor()` → mints shares.
- `redeem(shares, receiver, owner)` → burns shares → `singleton.withdrawAssets()` → receives USDT from singleton.
- `totalAssets()` → `singleton.vaultTotalAssets(vaultId)`.
- `maxWithdraw(owner)` → limited to the vault's liquid free balance (assets not currently in play).

---

## Bet Flows

### Deposit → Bet → Settle → Redeem (Direct LP Path)

```
  Fan              TipsterVault        ThetaSingleton         Azuro LP
  │                     │                    │                   │
  │ deposit(amount)     │                    │                   │
  │────────────────────>│                    │                   │
  │                     │ depositFor()       │                   │
  │                     │───────────────────>│                   │
  │<────shares─────────│                    │                   │
  │                     │                    │                   │
  │                     │                    │ placeBet()        │
  │                     │                    │──────────────────>│
  │                     │                    │<──AzuroBet NFT────│
  │                     │                    │                   │
  │                     │    [condition resolves on Azuro]       │
  │                     │                    │                   │
  │                     │                    │ settleBet()       │
  │                     │                    │──────────────────>│
  │                     │                    │<───payout────────│
  │                     │                    │                   │
  │ redeem(shares)      │                    │                   │
  │────────────────────>│                    │                   │
  │                     │ withdrawAssets()   │                   │
  │                     │───────────────────>│                   │
  │<───────USDT────────│                    │                   │
```

### Relayer Path (Gasless, Used for Live Bets)

1. Tipster's app computes `getBetTypedData(selection)` via `@azuro-org/toolkit`.
2. Tipster signs the EIP-712 order with their WDK wallet (`signAzuroTypedData`).
3. Tipster calls `singleton.prepareVaultBet(stake, relayerFee, orderHash, expiresAt)` — reserves vault liquidity.
4. Tipster's app submits the signed order to the Azuro relayer API (`createVaultBetOrder`).
5. Azuro relayer calls `LP.betOrder(core, order, bettor=singleton, data)`.
6. Azuro Core calls `singleton.isValidSignature(orderHash, tipsterSignature)`.
7. Singleton looks up the pending vault bet by `orderHash`, recovers the tipster EOA address from the signature, verifies it matches `pending.tipster`, returns `ERC1271_MAGIC`.
8. LP mints the AzuroBet NFT to the singleton.
9. Tipster calls `singleton.completeVaultBet(vaultId, tokenId, conditionId, outcomeId, stake)` to finalize accounting.

---

## Ponder Indexer

ThetaBet uses **Ponder** (v0.16.7) to index ThetaSingleton events into a queryable database.

**Indexed entities:**
- `vault` — per-vault metrics: free balance, total assets, share supply, open/claimable/settled counts, total staked, total payout
- `vault_bet` — bet lifecycle: stake, payout, lifecycle (Open/WonClaimable/Lost/Canceled/Claimed), timestamps
- `investor_position` — per-user share balances across all vaults (tracked via `Transfer` events on TipsterVault)
- `tipster_name` — on-chain handle registry
- `deposit_event` / `withdraw_event` — capital flow audit trail

The REST API (Hono) exposes GraphQL for the mobile app to query vault rankings, tipster leaderboards, and position data.

---

## Live Deployment

- **ThetaSingleton:** [`0x2D2339Cd...`](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1) — single master contract on Polygon mainnet
- **Demo bet shown in video:** [tx `0x9b98da17...`](https://polygonscan.com/tx/0x9b98da175a2379dc36dfe1984a28dd3af41c30ef43680ed8daef48ac462a61cb) — direct bet on Azuro V3
- **Ponder start block:** 89,896,604

---

## Repository Structure

```
thetabet/
├── apps/
│   └── mobile/                          # Expo React Native app
│       ├── src/
│       │   ├── app/                     # Expo Router screens
│       │   │   ├── (tabs)/              # Tab navigator: channels, wallet, vaults, profile
│       │   │   ├── bet/event/[id].tsx   # Azuro event detail + bet slip
│       │   │   ├── settings.tsx         # Wallet + AI model settings
│       │   │   └── authorize.tsx        # Wallet authorization flow
│       │   ├── components/              # UI: bet slip, odds badges, event cards, AI sheet
│       │   ├── config/                  # Contract addresses, Azuro config, chain params
│       │   ├── context/                 # React context: app mode, confirm sheet, wallet
│       │   ├── hooks/                   # Custom hooks
│       │   ├── services/                # Business logic
│       │   │   ├── azuro/               # Bet placement, feed, vault-bet-api, onchain-feed
│       │   │   ├── qvac/               # QVAC client, model manager, settings, web research
│       │   │   └── wdk-evm.ts           # WDK transaction/signing helpers
│       │   ├── types/                   # Shared TypeScript types
│       │   └── utils/                   # Error formatting, number helpers
│       ├── pear-end/                    # P2P chat Bare worklet
│       ├── qvac/                        # QVAC AI worker bundle
│       ├── plugins/                     # Expo config plugins
│       └── scripts/                     # Build + dev tooling
├── contracts/                           # Foundry project
│   ├── src/
│   │   ├── ThetaSingleton.sol          # Master contract
│   │   ├── TipsterVault.sol            # ERC-4626 share token
│   │   ├── config/PolygonConfig.sol    # Polygon Azuro addresses
│   │   └── interfaces/                 # IAzuroLP, IAzuroCore, IERC1271
│   ├── test/                           # Singleton.t.sol, Vault.t.sol, AzuroIntegration.t.sol
│   └── script/                         # DeployPolygon.s.sol, DeployAnvil.s.sol
├── ponder/                              # Ponder indexer
│   ├── src/
│   │   ├── index.ts                    # Event handlers
│   │   └── api/index.ts               # GraphQL API (Hono)
│   ├── ponder.schema.ts                # Database schema
│   └── deployments/                    # polygon.json, anvil.json
└── tools/
    ├── dev-stack.sh                    # Dev stack: Anvil + Ponder + Cloudflare tunnel
    ├── peer/                           # WSL Node peer for single-device P2P testing
    └── scripts/
```

---

## Getting Started

### Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| Node.js | >= 20 | Tested with 20.x and 22.x |
| pnpm | >= 9 | `npm install -g pnpm` |
| Foundry | nightly | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Java | >= 17, <= 21 | Required by Android Gradle plugin |
| Android SDK | 36 + Build Tools 36.0.0 | Set `ANDROID_HOME` |
| Android NDK | 27.1.12297006 | Installed via SDK Manager |
| ADB | latest | In platform-tools from Android SDK |
| bash | >= 4.x | macOS: `brew install bash` (default is 3.2) |
| cloudflared | **Required** | `brew install cloudflared` (macOS) / `apt install cloudflared` (Linux/WSL) |

### macOS

```bash
brew install bash node pnpm cloudflared
curl -L https://foundry.paradigm.xyz | bash
foundryup
git clone https://github.com/SolidityDrone/thetabet.git
cd thetabet
pnpm install
```

### Linux / WSL2

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
nvm install 20
corepack enable && corepack prepare pnpm@latest --activate
curl -L https://foundry.paradigm.xyz | bash
foundryup
sudo apt update && sudo apt install cloudflared openjdk-21-jdk
git clone https://github.com/SolidityDrone/thetabet.git
cd thetabet
pnpm install
```



### Android SDK

**Linux / WSL2:**

```bash
# Install cmdline-tools if not already present
mkdir -p $HOME/Android/Sdk
cd $HOME/Android/Sdk
curl -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-12266719_latest.zip
unzip -q cmdline-tools.zip && rm cmdline-tools.zip
mv cmdline-tools latest  # rename for sdkmanager path
mkdir -p cmdline-tools && mv latest cmdline-tools/

export ANDROID_HOME=$HOME/Android/Sdk
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "platform-tools"
echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.bashrc
```

**macOS:**

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "platform-tools"
```

### Build and Run the Mobile App

```bash
cd apps/mobile

# 1. Generate the Pear-end P2P worklet bundle
pnpm bundle:pear

# 2. Generate the QVAC AI worker bundle (~30s)
pnpm bundle:qvac

# 3. (First time only) Build native Android app + install on device
#    Gradle — takes 5-15 min first time, cached afterward.
pnpm android

# 4. Start Metro bundler with cache clear
pnpm start:clean

# 5. (Different terminal) Bridge device to Metro
adb reverse tcp:8081 tcp:8081
```

The dev-client app opens on your Android device and connects to Metro over USB. JS changes hot-reload instantly.

### Run the Ponder Indexer

The indexer connects to Polygon mainnet, indexes ThetaSingleton events, and exposes a GraphQL API consumed by the mobile app. The physical device reaches it via a **Cloudflare tunnel**:

```bash
# Start Ponder + Cloudflare tunnel (the only supported mode)
USE_TUNNEL=1 pnpm dev:stack:tunnel
```

What happens:
1. Ponder starts at `http://localhost:42069` and begins indexing from block 89,896,604.
2. `cloudflared` creates a public `.trycloudflare.com` tunnel URL pointing to localhost.
3. The tunnel URL is written to `apps/mobile/src/config/tunnel.generated.ts` and synced into the app's config.
4. The mobile app reads this URL and queries the indexer through Cloudflare, even when the device is on mobile data.

**`cloudflared` is mandatory** — the indexer is not publicly accessible otherwise. Install it before running the dev stack.

Each tunnel run generates a fresh URL. After it starts, reload the mobile app to pick up the new endpoint.

### Deploy Contracts

```bash
# Local Anvil fork (for development)
pnpm contracts:anvil-fork
pnpm contracts:anvil-deploy

# Polygon mainnet (requires real POL + keystore)
pnpm contracts:deploy-polygon
```

**Whitelist note:** After deploying a new ThetaSingleton, the deployer must whitelist addresses manually:

```solidity
// Only callable by deployer (0xDD7D64...)
singleton.whitelistAddress(0xe257cf8ECa1aF94117bEe3809F705bC6e51CbD5c);
```

Without whitelisting, every user-facing call (`createVault`, `deposit`, `placeBet`, etc.) reverts with `NotWhitelisted()`.

### Deployer Setup

```bash
cast wallet import kondor --private-key <your-private-key>
pnpm contracts:deploy-polygon
```

---

## Cloudflare Tunnel (Required for Ponder)

```
Device (4G/5G) ──► Cloudflare ──► cloudflared ──► Ponder (localhost:42069)
```

```bash
# Install cloudflared
macOS:   brew install cloudflared
Linux:   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
WSL2:    sudo apt install cloudflared

# Run
USE_TUNNEL=1 pnpm dev:stack:tunnel
```

The tunnel is the bridge between your device (on any network) and your local Ponder instance. Without it, the mobile app cannot query the indexer remotely.

---

## P2P Testing Without a Second Phone

```bash
pnpm peer -- --topic <hex-topic-key> --name "Dev peer"
```

Starts a Bare-compatible Node process that joins the same Hyperswarm topic as the phone — message exchange, DM testing, and channel persistence validation with a single Android device.

---

## Environment Variables

Copy `.env.example` → `.env`:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `EXPO_PUBLIC_PONDER_URL` | No | Auto-generated tunnel URL | Ponder GraphQL endpoint (overrides tunnel) |
| `EXPO_PUBLIC_PONDER_USE_LOCAL` | No | — | Set `1` to force `http://127.0.0.1:42069/graphql` |
| `EXPO_PUBLIC_WDK_INDEXER_BASE_URL` | Yes | `https://wdk-api.tether.io` | WDK indexer for transaction history |
| `EXPO_PUBLIC_WDK_INDEXER_API_KEY` | Yes* | — | WDK API key for transaction history |
| `EXPO_PUBLIC_THESPORTSDB_API_KEY` | No | `3` | League/team logos (free test key) |
| `EXPO_PUBLIC_API_FOOTBALL_KEY` | No | — | Live match data from api-sports.io |

\* Without a WDK API key, the wallet still works (send/receive via direct RPC) but transaction history is unavailable.

---

## Portability Notes

| Platform | Status |
|----------|--------|
| **WSL2 / Ubuntu** | ✅ Primary development environment |
| **Native Linux** | ✅ Verified |
| **macOS** | ✅ Requires `brew install bash` (default macOS bash 3.2 doesn't support `pipefail`) |
| **Windows (native)** | ⚠️ Not tested — WSL2 recommended |

### Portability fixes applied

| Original issue | Fix |
|----------------|-----|
| `pack.imports.json` had absolute paths locked to `/home/drone/projects/...` | Regenerated dynamically by `pnpm bundle:pear`; removed from git |
| `tunnel.generated.ts` had stale Cloudflare tunnel URL | Removed from git; regenerated per-session |
| `dev-stack.sh` hardcoded `$HOME/.nvm/versions/node/v20.19.2` | Uses system PATH with NVM fallback |
| `package.json` hardcoded `v20.19.2` in `ponder:dev` script | Removed — uses system Node |
| `deploy-polygon.sh` used `${var,,}` (bash 4+ only) | Replaced with portable `tr` |
| `dev-stack.sh` used `seq` (not on macOS) | Replaced with portable loop syntax |
| `generate-imports.mjs` missing `sodium-universal` and `bare-kit` | Added missing module mappings |

---

## License

MIT

---

## References

- [Pear docs](https://docs.pears.com)
- [WDK docs](https://docs.wdk.tether.io)
- [Azuro Protocol](https://gem.azuro.org)
- [QVAC SDK](https://qvac.ai)
- [Ponder](https://ponder.sh)
