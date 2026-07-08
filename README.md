# ThetaBet

A fan-to-creator social betting network. Fans discover tipsters, join their private P2P channels, deposit into a tipster's betting vault, and earn pro-rata returns as the tipster places bets on **Azuro** (on-chain sports betting protocol). Vault shares are ERC-20 tokens that double as channel access keys.

Built on **Polygon** (mainnet) and **Polygon Amoy** (testnet).

---

## Architecture

```
                  Expo React Native app (Android)
     ┌─────────────────────────────────────────────────┐
     │  RN UI (Hermes): chat + wallet + vaults/tipster  │
     └──────────┬──────────────────┬───────────────────-┘
                │ bare-rpc         │ WDK hooks
                ▼                  ▼
     ┌──────────────────┐ ┌──────────────────────┐
     │ Bare worklet #1: │ │ Bare worklet #2:     │
     │ Pear-end (P2P)   │ │ WDK wallet           │
     │ Hyperswarm +     │ │ (EVM, Amoy/Polygon)  │
     │ Hypercore +      │ │ BIP-39/44, sign,     │
     │ Corestore        │ │ send, token gating   │
     └──────────────────┘ └──────────────────────┘
              │                    │
              ▼                    ▼
     ┌────────────────────────────────────┐
     │          Polygon (mainnet/Amoy)     │
     │  ┌──────────────────────────────┐  │
     │  │ ThetaSingleton (Master)      │  │
     │  │ • custody of bet token       │  │
     │  │ • vault factory              │  │
     │  │ • sole Azuro caller          │  │
     │  │ • per-vault accounting       │  │
     │  └────────┬────────────────────┘  │
     │    creates│      │ bets          │
     │           ▼      ▼               │
     │  ┌──────────────┐ ┌───────────┐  │
     │  │ TipsterVault │ │ Azuro LP  │  │
     │  │ ERC-4626     │ │ + Core    │  │
     │  │ (state only) │ │           │  │
     │  └──────────────┘ └───────────┘  │
     └────────────────────────────────────┘
```

### Core invariants

1. All bet token sits in the **singleton** — vaults hold **no** tokens.
2. The **singleton** is the only contract that calls Azuro LP.
3. Each **vault** is an ERC-4626-style share token whose `totalAssets()` is derived from the singleton's per-vault accounting.
4. A **tipster** may only trigger bets on their own vault; they may **not** withdraw principal.
5. A **fan** may redeem shares for a pro-rata slice of the vault at any time.
6. Holding a vault's share tokens **unlocks access** to that tipster's private P2P channel.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Mobile app | React Native (Expo SDK 54), Android-first |
| P2P chat | **Pear** (Holepunch) — Hyperswarm, Hypercore, Corestore in a Bare worklet via `react-native-bare-kit` |
| Wallet | **WDK** (Tether Wallet Dev Kit) — self-custodial, BIP-39/44, EVM, in a second Bare worklet |
| Betting protocol | **Azuro v3.0.13** — on-chain sports betting liquidity protocol |
| Smart contracts | Solidity 0.8.24, Foundry (Forge/Anvil/Cast) |
| Indexer | **Ponder** — onchain event indexing, REST API (Hono) |
| Monorepo | pnpm workspaces |

---

## Repository structure

```
thetabet/
├── apps/mobile/          # Expo React Native app
│   ├── src/              # RN screens, components, hooks, services
│   ├── pear-end/         # P2P chat worklet (Hyperswarm/Hypercore/Corestore)
│   └── pear-end.bundle.mjs  # bare-pack output (chat worklet bundle)
├── contracts/            # Foundry project
│   ├── src/
│   │   ├── ThetaSingleton.sol  # master: custody, factory, Azuro bettor
│   │   ├── TipsterVault.sol    # ERC-4626 share token (state only)
│   │   ├── config/             # Amoy & Polygon deployment addresses
│   │   └── interfaces/         # Azuro LP/Core/ERC-1271 interfaces
│   ├── test/                  # Unit + fork-integration tests
│   └── script/                # Deploy scripts (Amoy, Polygon, Anvil)
├── ponder/               # Ponder indexer + API
│   ├── src/index.ts      # Event handlers
│   ├── src/api/index.ts   # REST API (Hono)
│   └── deployments/      # Deployed addresses
└── tools/
    ├── peer/             # WSL Node.js peer for single-device P2P testing
    ├── dev-stack.sh      # Start full local stack (Anvil + Ponder)
    └── scripts/
```

---

## Deployment (live contracts)

### Polygon mainnet

| Contract | Address |
|----------|---------|
| ThetaSingleton | [`0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1`](https://polygonscan.com/address/0x2d2339cd24f68324ce9df36b1d9c1da9961d35a1) |
| Bet Token (USDT) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Azuro LP | `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8` |

### Polygon Amoy (testnet)

| Contract | Address |
|----------|---------|
| ThetaSingleton | [`0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c`](https://amoy.polygonscan.com/address/0x54e0c63678e21bdd24df135cc27f6ecbfc99e69c) |
| Bet Token (Azuro Bet Token) | `0xCf1b86ceD971b88C042C64A9c099377e2738073C` |
| Azuro LP | `0x0a75395Ff15d9557424b632cEBCac448D66F9779` |

---

## Quick start

### Prerequisites

- Node.js >= 20
- pnpm
- Foundry (forge, cast, anvil)
- Android dev setup: Android SDK, Java 21, USB-connected device with ADB

### Install

```bash
pnpm install
```

### Mobile app

```bash
cd apps/mobile
pnpm bundle:pear     # Build Pear-end worklet bundle
pnpm bundle:wdk      # Build WDK worklet bundle
pnpm android         # One-time native build → install on device
pnpm start           # Metro dev server
adb reverse tcp:8081 tcp:8081  # Bridge device to Metro
```

### Contracts

```bash
# Test
cd contracts && forge test -vv

# Deploy on local Anvil fork
pnpm contracts:anvil-fork
pnpm contracts:anvil-deploy

# Deploy on Polygon Amoy
pnpm contracts:deploy-amoy

# Deploy on Polygon mainnet
pnpm contracts:deploy-polygon
```

### Indexer

```bash
# Start Ponder with local Anvil fork
pnpm dev:stack

# Start Ponder with Polygon mainnet (via tunnel to local Anvil)
pnpm dev:stack:tunnel
```

---

## Development workflow (WSL2)

One-time setup: `usbipd-win` on Windows to attach the Android device to WSL2, then a local `npx expo run:android` build. Day-to-day: Metro HMR over `adb reverse tcp:8081 tcp:8081` — no EAS, no emulator.

For P2P testing without a second phone, run the WSL Node peer:
```bash
pnpm peer -- --topic <hex-topic-key>
```

---

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Pear P2P chat (Hyperswarm/Hypercore/Corestore in Bare worklet) | Done |
| Phase 2 | WDK self-custodial wallet (Polygon Amoy, Bet Token) | Done |
| Phase 3 | Smart contracts + Azuro integration + token-gated channels | Live |
| Phase 4 | Privacy (Railgun-style mix pool) — owner-driven | Future |

---

## License

MIT