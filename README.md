# ThetaBet — The First Betting SocialFi Protocol

> **DoraHacks submission** — opted in for tracks: **QVAC**, **WDK**, **PEAR**  
> [View on DoraHacks](https://dorahacks.io/) · [Demo video](https://youtu.be/EOCiyINNVZA) · [SPEC](./SPEC.md)

[![Demo video](https://img.youtube.com/vi/EOCiyINNVZA/0.jpg)](https://youtu.be/EOCiyINNVZA)

---

## The Problem

Following a sports tipster today means:

- **Paying a subscription** that gives you zero upside — the tipster gets your money win or lose.
- **Copying bets manually** — slow, error-prone, no way to verify the tipster's actual track record.
- **No accountability** — tipsters can pad their records, cherry-pick screenshots, or disappear after a losing streak.
- **No liquidity** — your money sits idle. You're a spectator, not an investor.
- **Fragmented communication** — Telegram, Discord, Twitter — all silos with no integration to the on-chain activity.

**ThetaBet flips this model.** You don't *follow* a tipster — you *invest* in them.

---

## The Solution

ThetaBet is a **fan-to-creator betting social network** where every tipster operates as a financial product. Each tipster has a **betting vault** — a smart contract pool that fans deposit into. The tipster bets the vault's pooled funds on **Azuro Protocol** (on-chain sports betting).

### How it works

1. A **tipster** creates a **vault** (one vault per tipster — unique, bonded, auditable).
2. **Fans** deposit **USDT** into the vault and receive **vault share tokens** (ERC-4626).
3. The **tipster bets** the vault's pooled funds on Azuro — football, basketball, tennis, esports, live markets.
4. When bets win, the payout flows back into the vault, increasing the value of every share.
5. **Fans redeem** their shares for a pro-rata slice of the vault's balance — deposits + PnL — at any time.

This means:

- **Your upside is aligned with the tipster's.** They win — you win. They lose — you both lose proportionally. No fixed subscription fee, no rent-seeking.
- **Every tipster has a verifiable on-chain ROI.** No cherry-picked screenshots — every bet, every win, every loss is on Polygon. Vault metrics (total assets, open bets, win rate, total staked, total payout) are indexed and exposed via **Ponder** API.
- **You can exit at any time.** Unlike a subscription model where you've already paid for the month, vault shares are liquid — redeem anytime for your pro-rata cut.
- **Tipsters compound winning streaks.** A hot tipster attracts more deposits, increasing the vault size, allowing bigger bets, compounding returns. This creates a **virtuous flywheel** — good tipsters grow, bad ones get redeemed into oblivion.
- **You treat tipsters as portfolio assets.** Any wallet can hold shares in multiple vaults simultaneously — diversify across tipsters like a fund manager. Each vault is a distinct on-chain asset with its own PnL history, win rate, and risk profile.

---

## P2P Communication Layer

Every vault is paired with a **private P2P channel** built on **Pear (Holepunch)** — the P2P layer runs directly on your Android device inside a Bare worklet, no servers, no central relay.

- **Public discovery channels** — browse tipsters by their on-chain handle (@name).
- **Private tipster channels** — token-gated: holding vault shares >= threshold unlocks access. No shares? No entry.
- **Peer-to-peer DMs** — end-to-end encrypted direct messaging between any two users using Ed25519 key exchange. Contacts, invites, and DM history persist in Corestore on-device.
- **Handle-based discovery** — look up `@handle` → resolve to wallet address → send contact request. No phone numbers, no usernames, no centralized registry.
- **Fully offline-capable** — the Bare worklet stores channel history, contacts, and messages in local hypercores. Replicate on reconnect.

The chat is not a bolt-on. It's the primary UI — you browse conditions, place bets, discuss strategy, and follow multiple tipster channels, all from the same app.

---

## On-Device AI (QVAC)

ThetaBet bundles a **local LLM inference engine running in a third Bare worklet via QVAC SDK**. No API keys, no cloud round-trips, no data leaving the device.

- **Download-and-run**: select from multiple quantized models, download directly from Hugging Face inside the app, and run 100% offline.
- **Match analysis**: on any Azuro event screen, tap the AI button to get a real-time reasoning breakdown of the matchup, form, odds, and statistical context — all computed locally by the on-device LLM.
- **Privacy**: your betting research never leaves the phone.
- **Web research**: the agent can web search for up-to-date match context, then synthesize that into the analysis prompt.

All of this runs in a Bare worklet using QVAC's custom build of llama.cpp compiled for Android's NDK r27. No Hermes-to-native bridge — the model runs in its own isolated thread, keeping the UI at 60 fps.

---

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **P2P Chat** | [Pear / Holepunch](https://docs.pears.com/) | Hyperswarm + Hypercore + Corestore in a Bare worklet — decentralized messaging, no servers |
| **Wallet** | [WDK (Tether Wallet Dev Kit)](https://docs.wdk.tether.io/) | Self-custodial wallet engine in a second Bare worklet — BIP-39/44, EVM signing, biometrics |
| **Betting** | [Azuro Protocol v3.0.13](https://gem.azuro.org/) | On-chain sports betting liquidity protocol — football, basketball, tennis, esports, live |
| **AI** | [QVAC SDK](https://qvac.ai/) | Local LLM inference in a third Bare worklet — on-device match analysis, no cloud dependency |
| **Smart Contracts** | Solidity 0.8.24 (Foundry) | ThetaSingleton (custody + factory + bettor), TipsterVault (ERC-4626 shares) |
| **Indexer** | [Ponder](https://ponder.sh/) | On-chain event indexing with PostgreSQL/PGlite, REST API via Hono |
| **Mobile** | Expo SDK 54 / React Native 0.81 | Android-first, Hermes engine, dev-client builds over USB/ADB |

---

## Architecture

```
                          ┌─────────────────────────────────────────────────────────┐
                          │              Expo React Native App (Android)            │
                          │                                                         │
                          │  ┌──────────────────────────────────────────────────┐  │
                          │  │            RN UI Layer (Hermes)                  │  │
                          │  │  Chat · Wallet · Vaults · Bet Slip · AI Agent   │  │
                          │  └────────────┬──────────────┬────────────┬────────────┘  │
                          │               │              │            │           │
                          │      bare-rpc │    WDK hooks │  bare-rpc  │           │
                          │               ▼              ▼            ▼           │
                          │  ┌────────────────┐ ┌─────────────┐ ┌─────────────┐   │
                          │  │ Bare worklet #1 │ │ Bare wkt #2│ │ Bare wkt #3│   │
                          │  │  Pear-end P2P   │ │ WDK wallet  │ │ QVAC AI     │ │
                          │  │  Hyperswarm     │ │ EVM engine  │ │ llama.cpp   │   │
                          │  │  Hypercore      │ │ signMessage  │ │ LLM inference│  │
                          │  │  Corestore      │ │ sendTx      │ │ web search  │   │
                          │  └────────────────┘ └─────────────┘ └─────────────┘   │
                          └─────────────────────┬─────────────────────────────────┘
                                                │ JSON-RPC
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                Polygon Mainnet / Amoy                              │
│                                                                                    │
│   ┌────────────────────────────────────────────────────────────────────────────┐  │
│   │                           ThetaSingleton                                    │  │
│   │  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────────────┐  │  │
│   │  │  Custody      │  │  Vault Factory   │  │  Azuro Bettor                │  │  │
│   │  │  All USDT      │  │  createVault()    │  │  placeBet() / settleBet()   │  │  │
│   │  │  sits here     │  │  per-tipster      │  │  prepareVaultBet()          │  │  │
│   │  └──────────────┘  └──────────────────┘  │  ERC-1271 (relayer flow)      │  │  │
│   │                                           └───────────────────────────────┘  │  │
│   └──────────────────────────┬───────────────────────────────────────────────────┘  │
│                               │                                                      │
│                     creates   │          bets via                                     │
│                               ▼          LP.betOrder / LP.bet                           │
│                    ┌──────────────────┐  ┌────────────────────────────────────┐       │
│                    │ TipsterVault[1..N]│  │  Azuro v3 Protocol                 │       │
│                    │ ERC-4626 share   │  │  LP + Core + Relayer               │       │
│                    │ token (state     │  │  AzuroBet NFT (ERC-721, positions) │       │
│                    │ only, no funds)  │  │  Condition resolution (oracle)      │       │
│                    └──────────────────┘  └────────────────────────────────────┘       │
│                              │                                                      │
│                              ▼                                                      │
│                    ┌──────────────────┐                                              │
│                    │  Ponder Indexer  │                                              │
│                    │  Event handlers  │                                              │
│                    │  REST API (Hono) │                                              │
│                    └──────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Invariants

1. **All USDT sits in ThetaSingleton.** Vaults are pure ERC-4626 share tokens with *zero* token balance. `totalAssets()` is derived from the singleton's per-vault accounting, not from a balance the vault holds.
2. **Only the singleton calls Azuro LP.** No vault, no tipster EOA — only the singleton. This guarantees all bets are tracked, auditable, and attributed to the correct vault.
3. **Tipsters can only bet — never withdraw.** A tipster cannot rug the vault. Fans always redeem first.
4. **Fans can redeem pro-rata at any time.** No lockups, no vesting, no gates on exiting.
5. **Holding shares unlocks the channel.** Access to the tipster's private P2P channel is determined by `balanceOf(user) >= threshold` on-chain.

---

## Smart Contracts

### ThetaSingleton

The master contract deployed once per chain. Responsibilities:

- **Custody** — holds all USDT, approves it to Azuro LP (and Relayer for gasless bets).
- **Vault factory** — `createVault(name, symbol)` deploys a new `TipsterVault` share token, one per tipster.
- **Accounting** — per-vault `freeBalance` tracking, `vaultTotalAssets()` aggregation across open and settled bets.
- **Azuro bettor** — two bet paths:
  - **Direct LP path** — `placeBet(core, amount, order, data)` locks a condition+outcome from the Azuro LP, debits vault free balance, records the AzuroBet NFT. Used for prematch/live.
  - **Relayer path** — `prepareVaultBet(stake, orderHash, expiresAt)` reserves vault liquidity, then implements **ERC-1271 `isValidSignature`** so the Azuro Relayer can submit the order with the singleton as `bettor`. The tipster EDA signs the EIP-712 order, and the singleton validates the signature against the pending vault bet.
- **Bet settlement** — `settleBet(betId)` syncs a single bet, claims payout if won. The sync loop handles: condition cancelation (stake refunded), resolved win (payout claimed via `LP.withdrawPayout`), resolved loss (marked lost, stake deducted).
- **Name registry** — `registerTipsterName(name, pubKeyX, pubKeyY)` — unique `@handle` (3-20 chars, `[a-z0-9_]`) with an associated secp256k1 public key for P2P messaging discovery.
- **Whitelist gate** — on mainnet, only whitelisted addresses can interact. Deployer manages the list. Amoy is permissionless.

### TipsterVault

An ERC-4626-style share token. The `asset` is USDT, but all custody is delegated to the singleton:

- `deposit(assets, receiver)` → transfers USDT → `singleton.depositFor(vaultId, receiver, assets)` → mints shares.
- `redeem(shares, receiver, owner)` → burns shares → `singleton.withdrawAssets(vaultId, receiver, shares, assets)` → receives USDT from singleton.
- `totalAssets()` → `singleton.vaultTotalAssets(vaultId)` — includes free balance + unsettled bet exposure + potential payouts.
- `maxWithdraw(owner)` → limited to the vault's *liquid* free balance, so a fan can only redeem what is not currently in play.

---

## Bet Flows

### Fan Deposit → Vault → Bet → Settle → Redeem

```
          ┌──────┐     ┌────────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐
          │ Fan  │     │ Vault      │     │Singleton │     │ Azuro LP │     │ Tipster │
          │(WDK) │     │(TipsterVault)   │(ThetaSng) │     │          │     │ (WDK)   │
          └──┬───┘     └─────┬──────┘     └─────┬────┘     └────┬─────┘     └────┬────┘
             │ 1. deposit() │                   │              │                 │
             │──────────────>│ 2. depositFor()   │              │                 │
             │              │───────────────────>│              │                 │
             │              │<──────shares───────│              │                 │
             │<──shares─────│                   │              │                 │
             │              │                   │              │                 │
             │              │                   │              │  3. bet() /    │
             │              │                   │<─────────────│  betOrder()     │
             │              │                   │──────────────│>  AzuroBet NFT  │
             │              │                   │              │                 │
             │              │    match resolves  │ (oracle)    │                 │
             │              │      (oracle)    >──────────────>│                 │
             │              │                   │  4. settleBet()              │
             │              │                   │──────────────│>              │
             │              │                   │<──payout─────│               │
             │  5. redeem() │                   │              │                 │
             │──────────────>│───────────────────>              │                 │
             │<─────USDT────│                   │              │                 │
          └──────┘     └────────────┘     └──────────┘     └──────────┘     └─────────┘
```

### Relayer (gasless) Bet Flow

For live/prematch bets that need low-latency, the tipster uses the Azuro relayer:

1. Tipster selects a condition → UI computes `getBetTypedData` → signs the EIP-712 order with WDK.
2. Tipster calls `singleton.prepareVaultBet(stake, relayerFee, orderHash, expiresAt)` — reserves vault liquidity, stores the order hash.
3. Azuro relayer calls `LP.betOrder` with the singleton as `bettor`. The LP calls `singleton.isValidSignature(hash, signature)`.
4. Singleton looks up `pendingVaultBets` by `orderHash`, recovers the tipster EDA signature from EIP-712 digest, and returns `ERC1271_MAGIC` if valid and within expiry.
5. Relayer mints the AzuroBet NFT to the singleton.
6. Tipster calls `singleton.completeVaultBet(vaultId, tokenId, conditionId, outcomeId, stake)` to record the bet.

---

## P2P Messaging Protocol

All messaging runs in a **Bare worklet** via `react-native-bare-kit`. No servers, no relays.

- **Identity**: Ed25519 keypair generated and persisted in the worklet. Short pubkey hex shown as handle.
- **Channels**: each channel = a Hyperswarm topic (32-byte key). Public channels announce on the DHT; private channels use unannounced keys shared out-of-band.
- **Message persistence**: Corestore opens a Hypercore per channel. Writes are append-only logs. Replication on join replays history.
- **Token-gated access**: fan requests channel access → worklet reads `vault.balanceOf(fan)` on-chain → if >= threshold, sends the topic key.
- **DMs**: E2E encrypted via shared Ed25519 key exchange (`deriveDmKey`). Contact discovery via announced DHT topics. DM history stored in dedicated per-contact hypercores.
- **Handle resolution**: tipster's `@name` is registered on-chain. App listens for `TipsterNameRegistered` events or reads directly from the singleton to map `@name → address → pubKeyX/pubKeyY`.

---

## Ponder Indexer

ThetaBet uses **Ponder** to index on-chain events from the ThetaSingleton into a queryable PostgreSQL database.

**Indexed events:**
- `VaultCreated` — each vault and its tipster
- `VaultMetrics` — periodic snapshots containing free balance, total assets, share supply, open/settled counts
- `VaultDeposit` / `VaultWithdraw` — audit trail of capital flow
- `VaultBetOpened` / `VaultBetClosed` — bet lifecycle with ω, stake, and payout
- `TipsterNameRegistered` — on-chain handle resolution
- `Transfer` (from any TipsterVault) — investor position tracking across all vaults

The API layer (Hono) exposes REST endpoints for vault rankings, tipster leaderboards, historical performance, and position data — consumed by the mobile app.

---

## Live Deployments

### Polygon Mainnet

| Contract | Address |
|----------|---------|
| ThetaSingleton | [`0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1`](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1) |
| Bet Token (USDT) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Azuro LP | `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8` |
| Azuro Core | `0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7` |
| Azuro Relayer | `0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d` |
| Deployer | `0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D` |

Ponder indexer live at start block **89,896,604**.

### Polygon Amoy (Testnet)

| Contract | Address |
|----------|---------|
| ThetaSingleton | [`0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c`](https://amoy.polygonscan.com/address/0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c) |
| Bet Token (Azuro Bet Token) | `0xCf1b86ceD971b88C042C64A9c099377e2738073C` |
| Azuro LP | `0x0a75395Ff15d9557424b632cEBCac448D66F9779` |
| Azuro Core | `0xCD0Db5ef28C3Bd3a69283372dE923Eb4DA0585F6` |
| Azuro Relayer | `0x48c9bE88706F22838070eE7C4bC74Ad7A8eeF114` |

Ponder indexer live at start block **41,550,782**.

---

## Repository Structure

```
thetabet/
├── apps/
│   └── mobile/                    # Expo React Native app
│       ├── src/
│       │   ├── app/               # Expo Router screens (chat, wallet, vaults, bet, settings)
│       │   ├── components/          # Reusable UI: bet slip, odds badges, event cards, AI sheet
│       │   ├── config/            # Contract addresses, Azuro/Avax config, chains
│       │   ├── constants/         # Colors, theme, layout
│       │   ├── context/           # React context: app mode, confirm sheet
│       │   ├── hooks/             # Custom hooks: wallet, Azuro events, portfolio, vaults
│       │   ├── services/          # Business logic: Azuro bet placement, vault bets, WDK, QVAC
│       │   ├── types/             # Shared TS types
│       │   └── utils/             # Helpers
│       ├── pear-end/              # P2P chat worklet (Hyperswarm/Hypercore/Corestore/DMs)
│       ├── qvac/                  # QVAC AI worker bundle (llama.cpp for Android NDK r27)
│       ├── plugins/               # Expo config plugins
│       └── scripts/               # Build scripts: pear-end bundler, QVAC bundler, dev helpers
├── contracts/                     # Foundry project
│   ├── src/
│   │   ├── ThetaSingleton.sol     # Master: vault factory, custody, Azuro bettor, ERC-1271
│   │   ├── TipsterVault.sol       # ERC-4626 share token (state-only)
│   │   ├── config/               # AmoyConfig.sol, PolygonConfig.sol
│   │   └── interfaces/           # IAzuroLP, IAzuroCore, IERC1271
│   ├── test/                     # Singleton.t.sol, Vault.t.sol, AzuroIntegration.t.sol
│   └── script/                   # DeployAmoy, DeployPolygon, DeployAnvil
├── ponder/                        # Ponder indexer
│   ├── src/
│   │   ├── index.ts              # Event handlers
│   │   └── api/index.ts          # REST API (Hono)
│   ├── deployments/             # amoy.json, polygon.json, anvil.json
│   └── ponder.schema.ts          # DB schema: vault, vault_bet, investor_position, etc.
└── tools/
    ├── peer/                     # WSL Node peer for single-device P2P testing
    ├── dev-stack.sh              # Local dev stack (Anvil + Ponder)
    └── scripts/                  # Utilities (sync-deployment, etc.)
```

---

## Getting Started

### Prerequisites

- Node.js >= 20, pnpm
- Foundry (`forge`, `cast`, `anvil`)
- Android SDK + Java 21 + ADB-accessible device (physical, USB)

### Install

```bash
pnpm install
```

### Mobile

```bash
cd apps/mobile
pnpm bundle:pear                # Build Pear-end chat worklet
pnpm bundle:qvac               # Build QVAC AI worklet
pnpm bundle:wdk                # Build WDK wallet worklet (via @tetherto/wdk-worklet-bundler)
pnpm android                   # One-time native Gradle build → install on device
pnpm start                     # Metro start (port 8081)
adb reverse tcp:8081 tcp:8081  # Bridge device to WSL Metro
```

### Contracts

```bash
cd contracts
forge test -vv                          # Run all tests (including Amoy fork integration)
./script/start-anvil-fork.sh            # Fork Polygon mainnet to local Anvil
./script/deploy-anvil.sh                # Deploy ThetaSingleton to Anvil fork
./script/deploy-polygon.sh              # Deploy to Polygon mainnet (real gas)
./script/deploy-amoy.sh                 # Deploy to Polygon Amoy testnet
```

### Indexer

```bash
pnpm dev:stack                    # Start Anvil fork + Ponder
pnpm dev:stack:tunnel             # Start with tunnel to Polygon RPC
```

---

## DoraHacks Track Submissions

| Track | Implementation | Details |
|-------|---------------|---------|
| **QVAC** | On-device LLM inference via `@qvac/sdk` in a third Bare worklet | llama.cpp compiled for Android NDK r27. Models downloaded from Hugging Face, run 100% offline. Match analysis agent with web research. |
| **WDK** | Self-custodial wallet via `@tetherto/wdk-react-native-provider` | BIP-39/44, EVM signing, `signMessage`/`sendTransaction` through a dedicated Bare worklet. Bet Token + MATIC balance, transaction history, biometric lock. |
| **PEAR** | P2P chat via Holepunch stack in a Bare worklet | Hyperswarm DHT discovery, Hypercore message persistence, Corestore on-device storage, E2E encrypted DMs via Ed25519 key exchange, token-gated channels, handle-based identity. |

---

## License

MIT