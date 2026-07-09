# ThetaBet — The First Betting SocialFi Protocol

*Turn sports tipsters into investable on-chain assets.*

[![Demo video](https://img.youtube.com/vi/EOCiyINNVZA/0.jpg)](https://youtu.be/EOCiyINNVZA)

> **DoraHacks submission** — opted in for tracks **QVAC**, **WDK**, and **PEAR**.  
> [View on DoraHacks](https://dorahacks.io/) · [Technical specification](./SPEC.md)

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
| **WDK** | Self-custodial wallet via `@tetherto/wdk-react-native-provider` | BIP-39/44 key generation, EVM transaction signing, `signMessage`/`sendTransaction` through a dedicated Bare worklet. Supports Polygon mainnet + Amoy. Bet Token (USDT / Azuro Bet Token) balances, transaction history, biometric lock, multi-account derivation. |
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
                          │               Expo React Native App (Android)            │
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

### ThetaSingleton (`contracts/src/ThetaSingleton.sol`)

The master contract (single instance per chain). Responsibilities:

- **Custody** — holds all USDT (Bet Token). Vaults hold *zero* balance.
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
- **Whitelist gate** — mainnet: only whitelisted addresses can interact. Deployer controls the list via `whitelistAddress`/`removeWhitelistAddress`.

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

## Live Deployments

### Polygon Mainnet

| Contract | Address | Explorer |
|----------|---------|----------|
| ThetaSingleton | `0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1` | [PolygonScan](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1) |
| Bet Token (USDT) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | — |
| Azuro LP | `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8` | — |
| Azuro Core | `0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7` | — |
| Azuro Relayer | `0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d` | — |
| Deployer | `0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D` | — |

Indexer start block: **89,896,604**.

### Polygon Amoy (Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| ThetaSingleton | `0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c` | [AmoyScan](https://amoy.polygonscan.com/address/0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c) |
| Bet Token | `0xCf1b86ceD971b88C042C64A9c099377e2738073C` | — |
| Azuro LP | `0x0a75395Ff15d9557424b632cEBCac448D66F9779` | — |
| Azuro Core | `0xCD0Db5ef28C3Bd3a69283372dE923Eb4DA0585F6` | — |
| Azuro Relayer | `0x48c9bE88706F22838070eE7C4bC74Ad7A8eeF114` | — |

Indexer start block: **41,550,782**.

---

## Repository Structure

```
thetabet/
├── apps/
│   └── mobile/                          # Expo React Native app (Android)
│       ├── src/
│       │   ├── app/                     # Expo Router screens
│       │   │   ├── (tabs)/              # Tab navigator: channels, wallet, vaults, profile
│       │   │   ├── bet/event/[id].tsx   # Azuro event detail + bet slip
│       │   │   ├── settings.tsx         # Wallet + AI model settings
│       │   │   └── authorize.tsx        # Wallet authorization flow
│       │   ├── components/              # UI: bet slip, odds badges, event cards, AI sheet
│       │   ├── config/                  # Contract addresses, Azuro config, chain params
│       │   ├── context/                 # React context: app mode, confirm sheet, wallet
│       │   ├── hooks/                   # useWalletPortfolio, useAzuroEvent, useProfileVaults
│       │   ├── services/                # Business logic
│       │   │   ├── azuro/               # Bet placement, feed, vault-bet-api, onchain-feed
│       │   │   ├── qvac/               # QVAC client, model manager, settings, web research
│       │   │   └── wdk-evm.ts           # WDK transaction/signing helpers
│       │   ├── types/                   # Shared TypeScript types
│       │   └── utils/                   # Error formatting, number helpers
│       ├── pear-end/                    # P2P chat Bare worklet
│       │   ├── index.mjs               # RPC handler entry point
│       │   ├── chat.mjs                # PearChat class: channels, swarm, corestore
│       │   ├── dm.mjs                  # DM protocol: contacts, E2E encryption, handle discovery
│       │   ├── crypto.mjs              # Ed25519 key exchange, encrypt/decrypt, sign/verify
│       │   ├── identity.mjs            # Key generation + persistence
│       │   ├── socket-framer.mjs       # JSON frame protocol over hyperswarm sockets
│       │   └── commands.mjs            # RPC command constants
│       ├── qvac/                       # QVAC AI worker bundle
│       │   ├── worker.entry.mjs       # QVAC worker entry (no plugins, for download)
│       │   ├── worker.bundle.js       # Generated: no-plugins bundle
│       │   ├── worker.full.bundle.js  # Generated: with LLM plugin for inference
│       │   └── addons.manifest.json   # Native addon manifest
│       ├── plugins/                    # Expo config plugins
│       │   ├── withAndroidNdk27.js     # Pin NDK 27 for QVAC compatibility
│       │   └── withAndroidCleartextLocalhost.js  # Allow cleartext to localhost for dev
│       ├── scripts/                    # Build + dev tooling
│       │   ├── bundle-pear.mjs        # bare-pack pear-end worklet
│       │   ├── bundle-qvac.mjs        # QVAC worker bundler
│       │   ├── generate-imports.mjs   # Generate pack.imports.json for pear-end
│       │   ├── patch-bare-kit-link.mjs # Patch react-native-bare-kit's linker
│       │   ├── link-bare-addons.mjs    # Link native addons for Bare worklet
│       │   └── open-android.mjs       # adb reverse + dev-client deep link
│       └── app.json                   # Expo config
├── contracts/                          # Foundry project
│   ├── src/
│   │   ├── ThetaSingleton.sol         # Master contract
│   │   ├── TipsterVault.sol           # ERC-4626 share token
│   │   ├── config/
│   │   │   ├── AmoyConfig.sol         # Amoy Azuro addresses
│   │   │   └── PolygonConfig.sol      # Polygon Azuro addresses
│   │   └── interfaces/
│   │       ├── IAzuroLP.sol           # Azuro LP interface
│   │       ├── IAzuroCore.sol         # Azuro Core interface
│   │       └── IERC1271.sol           # ERC-1271 signature validation
│   ├── test/
│   │   ├── Singleton.t.sol            # ThetaSingleton unit tests
│   │   ├── Vault.t.sol                # TipsterVault unit tests
│   │   └── AzuroIntegration.t.sol     # Amoy fork integration tests
│   └── script/
│       ├── DeployPolygon.s.sol        # Mainnet deploy script
│       ├── DeployAmoy.s.sol           # Amoy testnet deploy script
│       ├── DeployAnvil.s.sol          # Local Anvil deploy script
│       └── *.sh                       # Shell wrappers for deploy flows
├── ponder/                             # Ponder indexer
│   ├── src/
│   │   ├── index.ts                   # Event handlers (VaultCreated, VaultMetrics, etc.)
│   │   └── api/index.ts              # GraphQL API (Hono)
│   ├── ponder.schema.ts               # Database schema
│   ├── abis/                          # Generated ABIs
│   └── deployments/                   # Deployment addresses per network
│       ├── polygon.json
│       ├── amoy.json
│       └── anvil.json
└── tools/
    ├── dev-stack.sh                   # Local dev stack (Anvil + Ponder + Cloudflare tunnel)
    ├── peer/                          # WSL Node peer for single-device P2P testing
    ├── scripts/
    │   ├── sync-deployment.mjs        # Sync deployment to app config
    │   └── ...
    └── ...
```

---

## Getting Started

### Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| Node.js | >= 20 | Tested with 20.x and 22.x |
| pnpm | >= 9 | `npm install -g pnpm` |
| Foundry | nightly | `curl -L https://foundry.paradigm.xyz | bash && foundryup` |
| Java | >= 17, <= 21 | Required by Android Gradle plugin |
| Android SDK | 36 + Build Tools 36.0.0 | Set `ANDROID_HOME` |
| Android NDK | 27.1.12297006 | Installed via SDK Manager |
| ADB | latest | In platform-tools from Android SDK |
| bash | >= 4.x | macOS: `brew install bash` (default is 3.2) |
| cloudflared | latest | Optional — only for tunnel mode (`brew install cloudflared`) |

### macOS Quick Setup

```bash
# Homebrew dependencies
brew install bash node pnpm cloudflared

# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Clone + install
git clone https://github.com/SolidityDrone/thetabet.git
cd thetabet
pnpm install
```

### Linux / WSL2 Quick Setup

```bash
# Node (using nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
nvm install 20

# pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Clone + install
git clone https://github.com/SolidityDrone/thetabet.git
cd thetabet
pnpm install
```

### Android SDK Setup

You need the Android SDK with specific versions. Install via Android Studio's SDK Manager (or `sdkmanager` CLI):

```bash
# Set ANDROID_HOME (add to ~/.bashrc / ~/.zshrc)
export ANDROID_HOME=$HOME/Android/Sdk   # Linux
export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS

# Install required SDK + NDK
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.1.12297006" \
  "platform-tools"
```

### Build the Mobile App

```bash
cd apps/mobile

# 1. Generate the Pear-end P2P worklet bundle
pnpm bundle:pear

# 2. Generate the QVAC AI worker bundle (takes ~30s)
pnpm bundle:qvac

# 3. (First time only) Build native Android app and install on device
#    This runs Gradle — takes 5-15min first time, cached afterward.
pnpm android

# 4. Start Metro bundler
pnpm start

# 5. Bridge device to Metro (different terminal)
adb reverse tcp:8081 tcp:8081
```

The app should now be running on your Android device via Expo dev client.

### Run the Ponder Indexer

```bash
# Option A: Local stack (Anvil fork + Ponder)
pnpm dev:stack

# Option B: With Cloudflare tunnel (so the physical device can reach Ponder)
pnpm dev:stack:tunnel

# Option C: Standalone Ponder on Polygon mainnet (no tunnel)
cd ponder
PONDER_NETWORK=polygon npm run dev
```

When using `dev:stack:tunnel`, the script auto-generates `apps/mobile/src/config/tunnel.generated.ts` with the tunnel URL. The mobile app reads this URL to query the indexer.

### Deploy Contracts

```bash
# Local Anvil fork (for development)
pnpm contracts:anvil-fork
pnpm contracts:anvil-deploy

# Polygon Amoy testnet (requires test MATIC + keystore)
pnpm contracts:deploy-amoy

# Polygon mainnet (requires real POL + keystore)
pnpm contracts:deploy-polygon
```

### Deployer Setup

To deploy on mainnet/Amoy, you need a Foundry keystore:

```bash
# Create keystore
cast wallet import kondor --private-key <your-private-key>

# Deploy (prompts for keystore password)
pnpm contracts:deploy-polygon

# Or set password env var for scripting
FOUNDRY_PASSWORD=yourpass pnpm contracts:deploy-polygon
```

---

## Cloudflare Tunnel

The indexer can be made accessible to a physical Android device on a different network via a Cloudflare tunnel:

```
Device (4G/5G) ──► Cloudflare ──► cloudflared (dev machine) ──► Ponder (localhost:42069)
```

**Prerequisite:** Install `cloudflared`:
```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Windows (in WSL2)
sudo apt install cloudflared
```

**Usage:**
```bash
USE_TUNNEL=1 pnpm dev:stack:tunnel
```

The script:
1. Starts Ponder on `localhost:42069`.
2. Starts `cloudflared tunnel --url http://127.0.0.1:42069`.
3. Parses the `.trycloudflare.com` URL from tunnel logs.
4. Writes it to `apps/mobile/src/config/tunnel.generated.ts`.
5. Syncs the tunnel URL into `contracts.generated.ts` as the fallback `PONDER_GRAPHQL_URL`.

Each tunnel run gets a new URL. After the tunnel starts, reload the mobile app to pick up the new URL.

Without a tunnel, the mobile app queries the indexer at `http://127.0.0.1:42069/graphql` — which works when the device is on the same network (USB `adb reverse tcp:42069 tcp:42069` or LAN).

---

## P2P Testing Without a Second Phone

Run a Node.js peer on your development machine:

```bash
pnpm peer -- --topic <hex-topic-key> --name "Dev peer"
```

This starts a Bare-compatible Node process that joins the same Hyperswarm topic as the phone. You can exchange messages, test DMs, and validate channel persistence — all with a single Android device.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `EXPO_PUBLIC_PONDER_URL` | No | Auto-generated | Ponder GraphQL URL (overrides tunnel) |
| `EXPO_PUBLIC_PONDER_USE_LOCAL` | No | — | Set to `1` to force `http://127.0.0.1:42069/graphql` |
| `EXPO_PUBLIC_WDK_INDEXER_BASE_URL` | Yes | `https://wdk-api.tether.io` | WDK indexer for transaction history |
| `EXPO_PUBLIC_WDK_INDEXER_API_KEY` | Yes* | — | WDK API key (empty = limited functionality) |
| `EXPO_PUBLIC_THESPORTSDB_API_KEY` | No | `3` | League/team logos (free test key) |
| `EXPO_PUBLIC_API_FOOTBALL_KEY` | No | — | Live match data from api-sports.io |

\* WDK indexer API key is required for transaction history. The wallet works without it (send/receive still functional via direct RPC).

---

## Portability Notes

This project was developed on **WSL2 (Ubuntu on Windows)** with a physical Android device. It has been audited and is known to build on:

- **WSL2 / Ubuntu** ✅ (primary development environment)
- **Native Linux** ✅ (tested, no WSL-specific dependencies remain)
- **macOS** ✅ (requires `brew install bash` for bash 4+)
- **Windows (native)** ⚠️ (not tested — WSL2 recommended)

### Verified Portability Fixes

The following issues were identified and fixed during the audit:

| Issue | Fix |
|-------|-----|
| `pack.imports.json` had absolute paths locked to dev machine | Regenerated dynamically by `pnpm bundle:pear`; removed from git tracking |
| `tunnel.generated.ts` had stale Cloudflare URL | Removed from git tracking; regenerated per-session |
| `dev-stack.sh` hardcoded `$HOME/.nvm/versions/node/v20.19.2` | Now uses PATH + NVM fallback |
| `package.json` hardcoded `v20.19.2` in ponder:dev script | Removed — uses system Node |
| `deploy-polygon.sh` used `${var,,}` (bash 4+ only) | Replaced with portable `tr` command |
| `dev-stack.sh` used `seq` (not on macOS by default) | Replaced with portable loop syntax |

### Known macOS-Only Requirement

Default macOS bash is version 3.2 (2007). The deploy scripts use `set -euo pipefail` which requires bash 4+. Install a modern bash:

```bash
brew install bash
# The shebang #!/usr/bin/env bash will pick up Homebrew's bash
```

---

## License

MIT

---

## References

- [Technical specification](./SPEC.md)
- [To-do list](./To-Do-List.md)
- [Pear docs](https://docs.pears.com)
- [WDK docs](https://docs.wdk.tether.io)
- [Azuro Protocol](https://gem.azuro.org)
- [QVAC SDK](https://qvac.ai)
- [Ponder](https://ponder.sh)
