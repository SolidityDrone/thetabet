# ThetaBet — Technical Specification (v0.1, draft)

> A fan-to-creator social network for **tipsters**. Fans discover tipsters, join their
> **private P2P channels**, and deposit into a tipster's **betting vault**. The tipster bets
> the vault's funds on **Azuro** (Polygon Amoy testnet). Vault shares are ERC-20 tokens that
> also double as **channel access keys**.
>
> Status: draft. The smart-contract layer is intentionally sketched — it will be redesigned.
> Two dependencies are **mandatory and non-negotiable**: **Pear** (Holepunch) for the P2P
> layer, and **WDK** (Tether Wallet Development Kit) for the wallet layer. Do not propose
> alternatives to either.

---

## 1. Vision & Product

ThetaBet is a social network where:

- A **tipster** is a creator who runs a **private channel** (chat, dyne.org/Keet-style P2P) and
  a **betting vault**.
- A **fan** is a follower who deposits **USDT0** (on Amoy: the Azuro test **Bet Token**) into a
  tipster's vault and receives vault **share tokens** (ERC-4626-style).
- The **tipster** bets the vault's funds on **Azuro**. The tipster **cannot** withdraw principal —
  they can only place bets from the vault.
- **Fans** withdraw their pro-rata share of the vault (deposits + PnL) at any time by redeeming
  share tokens.
- Holding a vault's share tokens (>= a threshold) **unlocks access** to that tipster's private
  P2P channel (**token-gated**).
- No fees, no whitelists, no production polish in scope for now — this is a testnet MVP that
  proves the integration chain: **Pear chat → WDK wallet → singleton/vault contracts → Azuro**.

The target is a **React Native (Expo)** mobile app on Android, developed from WSL2 on Windows.
We go **RN-first** (not desktop-Electron-first). P2P runs in a **Bare worklet** via
`react-native-bare-kit` (the Pear/Holepunch "Pear-end"), and the wallet runs in a second Bare
worklet via **WDK React Native Core**. Fast iteration on WSL uses a one-time **local** dev-client
build + a physical device over USB (`usbipd-win`)/ADB, then Metro HMR (see §13). **No EAS** —
local build + USB cable + `adb` only.

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **Pear** | Holepunch P2P stack (Hyperswarm/Hypercore/Corestore). On mobile it runs in a Bare worklet via `react-native-bare-kit` (the "Pear-end"), not the Electron runtime. |
| **Bare** | Holepunch's embeddable JS runtime; runs native P2P modules. Hermes (RN's JS engine) can't do UDP/P2P, so P2P lives in Bare. |
| **Bare Kit / worklet** | `react-native-bare-kit` spawns an isolated Bare thread (worklet) inside the RN app; the UI talks to it via `bare-rpc`. |
| **WDK** | Tether Wallet Development Kit. Self-custodial, stateless, BIP-39/44, modular. On RN via `@tetherto/wdk-react-native-core` (engine in a Bare worklet). |
| **Tipster** | Creator of a vault + channel; the only role allowed to trigger bets on their vault. |
| **Fan** | User who deposits into a vault and holds that vault's share token. |
| **Singleton (Master)** | One contract that **custodies all funds**, is a **vault factory**, and is the **only entity that talks to Azuro**. |
| **Vault** | A per-tipster ERC-4626-style share-token contract. **State only** — it does **not** hold funds; the singleton does. |
| **Share token** | The ERC-20 minted by each vault; 1:1 with vault accounting; also the channel-access credential. |
| **Azuro** | On-chain sports-betting liquidity protocol. We integrate **v3.0.13 on Polygon Amoy**. |
| **Azuro Bet Token** | The ERC-20 used as the betting asset on Amoy (`0xCf1b86ce...`). This is our **USDT0 stand-in on testnet**. |
| **Azuro Vault** | Azuro's *own* protocol vault contract (`0x1Ed6CEED...`) — **not** our tipster vault. Do not confuse. |

---

## 3. Non-Goals (for now)

- **Privacy / mix pool** (Railgun-like shielding of bets into vaults) — owner will handle later (Phase 4).
- **Desktop Electron app** — we go straight to Expo RN; no Electron/Pear-desktop build.
- **iOS** — Android-first (WSL/ADB workflow); iOS later when a macOS build host is available.
- **Android emulator on WSL2** — nested-virt is painful; we use a **physical device over USB** via `usbipd-win` + ADB.
- **Fees / revenue** — no performance, management, or subscription fees in the MVP.
- **Tipster whitelisting / staking / slashing** — vault creation is permissionless.
- **Production hardening** — no audited security, no multisig, no mainnet, no real funds.
- **Early Azuro cashout** — the relayer/EIP-712 signed `createCashout` flow is out of MVP; the
  singleton settles resolved winning bets via `LP.withdrawPayout` only.
- **Off-chain indexing UI** — use Amoy block explorer + Azuro toolkit endpoints; no custom subgraph backend.
- **Replacing Pear or WDK** with any other P2P or wallet library.

---

## 4. Technology Stack (confirmed)

### 4.1 P2P / App runtime — Pear (mandatory, on mobile via Bare Kit)

The app is a **React Native (Expo)** app. Pear/Holepunch P2P modules run in a **Bare worklet**,
not the Electron runtime (Hermes can't do UDP/low-level P2P). Pear officially documents this
mobile path ("Making a Bare mobile app", template `holepunchto/bare-expo`).

- `react-native-bare-kit` — `Worklet` class spawns the isolated Bare thread (the "Pear-end")
  where P2P lives; IPC stream back to RN.
- `bare-rpc` — typed RPC on top of the Bare Kit IPC stream (UI ↔ worklet bridge).
- `bare-pack` (`--linked`) — bundles the P2P logic + native addons into one `*.bundle.mjs`
  loaded by the worklet. Rebuild only when worklet code changes (seconds), not per JS edit.
- `hyperswarm` — DHT peer discovery + E2E-encrypted connections on a topic key.
- `hypercore` — append-only log (per-channel message history).
- `corestore` — storage factory for hypercores (persistence under the app's document directory).
- `b4a` — binary buffer helpers.
- Template reference: `holepunchto/bare-expo` (Expo + Bare). Docs: https://docs.pears.com
  (guide: "Making a Bare mobile app").

### 4.2 Wallet — WDK by Tether (mandatory, on RN via React Native Core)

WDK engine runs in a **second Bare worklet** (also `react-native-bare-kit`), exposed to RN through
hooks. Supports **Polygon Amoy** explicitly.

- `@tetherto/wdk-react-native-core` — `WdkAppProvider` + hooks (`useWdkApp`, `useWalletManager`,
  `useAccount`, `useBalance`, `useBalancesForWallets`, …), TanStack Query caching, Zustand+MMKV
  persisted state, biometric secure storage, multi-wallet (create/restore/lock/unlock/delete).
- `@tetherto/wdk` — core orchestrator (`WDK.getRandomSeedPhrase(24)`, `registerWallet`, …).
- `@tetherto/wdk-wallet-evm` — standard EVM module: BIP-39 (12/24-word), BIP-44 `m/44'/60'/0'/0/x`,
  ethers.js HD wallet, EIP-1559, ERC-20 balances, `signMessage`, `getTransactionHistory`.
  (The bundler's example uses `@tetherto/wdk-wallet-evm-erc-4337` for account-abstracted/gasless
  wallets — **optional later**; for the Amoy MVP use the standard EVM module. Confirm the bundler
  accepts the standard module at impl time; if not, fall back to erc-4337 in standard mode.)
- `@tetherto/wdk-worklet-bundler` (dev dep) — generate a custom EVM-only bundle:
  `wdk-worklet-bundler init` → `wdk.config.js` (`modules` + `networks` with `polygonAmoy`:
  `chainId 80002`, Amoy RPC) → `generate` → `.wdk/bundle.js`.
- `@tetherto/pear-wrk-wdk` — optional **prebuilt bundle** (`import { bundle } from ...`) for quick
  prototyping (all modules, larger); same `pear-wrk-wdk` worklet primitives the RN core uses
  under the hood.

Provider for Amoy = JSON-RPC URL (e.g. `https://rpc-amoy.polygon.technology`); history via WDK
indexer, with PolygonScan Amoy / viem fallback if Amoy isn't covered.

- Docs: https://docs.wdk.tether.io/tools/react-native-core/ · GitHub: `tetherto/wdk-react-native-core`,
  `tetherto/wdk-worklet-bundler`, `tetherto/pear-wrk-wdk`

### 4.3 Betting — Azuro v3.0.13 on Polygon Amoy

Chain: **Polygon Amoy**, chain id **80002**. Use `@azuro-org/toolkit` for chain data, ABIs,
REST/GraphQL/WS endpoints (`chainsData[polygonAmoy.id]`, `getApiEndpoint`, `getBetsGraphqlEndpoint`,
`getSocketEndpoint`).

**Azuro v3.0.13 deployment addresses (Polygon Amoy, dev):**

| Contract | Address |
| --- | --- |
| LP | `0x0a75395Ff15d9557424b632cEBCac448D66F9779` |
| Azuro Vault (protocol, not ours) | `0x1Ed6CEEDf7033461a189FD7c3381C34846D7b25a` |
| Bet Token (ERC-20) | `0xCf1b86ceD971b88C042C64A9c099377e2738073C` |
| AzuroBet (ERC-721) | `0x4B75c071dFA5d537979E8b0615Bb97B6337dbFef` |
| ClientCore | `0xCD0Db5ef28C3Bd3a69283372dE923Eb4DA0585F6` |
| Relayer | `0x48c9bE88706F22838070eE7C4bC74Ad7A8eeF114` |
| PayMaster | `0x2d155962b708c931Fc695F674B415065E78D9F04` |
| Cashout | `0x7dF132Ad2334a667A004049a75a4a8a530dc24F2` |

- **Deposit/bet asset on testnet = the Azuro Bet Token** (`0xCf1b86ce...`). This is our "USDT0".
  Decimals = **6** (USDT-style). `minOdds` is encoded with **12 decimals**; bet `amount` with 6.
  Amoy environment identifier in `@azuro-org/toolkit`: **`PolygonAmoyUSDT`**.
- The **singleton** is the entity that approves the Bet Token to the Azuro LP and places bets.
- AzuroBet positions are **ERC-721 tokens held by the singleton** and mapped internally to a vault.

**Azuro v3 betting paths (important):** v3 exposes two flows:

1. **Direct on-chain** — `lp.bet(core, amount, deadline, affiliate, data, minOdds)` where `data` is
   ABI-encoded tuple(s) of `(conditionId, outcomeId)` (single) or an array (combo). LP pulls the
   Bet Token from the caller and mints the **AzuroBet NFT to `msg.sender`**. **This is the path our
   singleton uses** (a contract cannot do the EIP-712 signed flow). Settlement of a resolved winning
   bet is via `LP.withdrawPayout(betNftId)` (confirm exact name against the v3.0.13 LP ABI).
2. **Gasless / relayer (EIP-712 signed)** — `getBetTypedData` → `signTypedData` → `createBet` /
   `createComboBet` (submits a signed order to the Relayer). Early **cashout** uses
   `getCalculatedCashout` → `getCashoutTypedData` → `createCashout` (also relayer/signed).

**MVP scope decision:** the singleton uses the **direct on-chain path** (`lp.bet` + `withdrawPayout`).
**Early cashout is out of MVP scope** (it requires the signed/relayer flow an EOA would use). The
off-chain feed/odds/calc side (UI) still uses `@azuro-org/toolkit` helpers (`getBetCalculation`,
`getBetFee`, `chainsData`, `setupContracts`, `getApiEndpoint`, `getSocketEndpoint`,
`getBetsGraphqlEndpoint`).

`@azuro-org/toolkit` peer deps: `@azuro-org/dictionaries@^3.0.28`, `graphql-tag@^2.12.6`, `viem@^2.37.4`.

### 4.4 Tooling

- **pnpm workspaces** — monorepo.
- **Expo + React Native** (`expo`, `expo-dev-client`) — mobile app; `react-native-bare-kit` for
  Bare worklets; `bare-pack` / `@tetherto/wdk-worklet-bundler` for worklet bundles.
- **Local native build** — `npx expo run:android` (`expo prebuild` + Gradle `assembleDebug`) +
  `expo-dev-client` for the custom dev build with native modules. One-time heavy build, then
  cached. **No EAS** — build and install locally over USB/`adb`.
- **Foundry** (`forge`, `cast`, `anvil`) — Solidity contracts, tests, local fork of Amoy.
- **TypeScript** end-to-end (RN + Pear/Bare + WDK are TS).
- `viem` (^2.37.4, also required by `@azuro-org/toolkit`) / `ethers` (via WDK EVM module) —
  contract reads/writes, ABI decoding, Azuro toolkit helpers.
- **WSL2 dev bridge**: `usbipd-win` (Windows) to attach the phone to WSL + `adb`; Metro packager
  in WSL; `adb reverse tcp:8081 tcp:8081` so the device reaches Metro. See §13 (Dev workflow).

---

## 5. System Architecture

```
                ┌───────────────────────────────────────────────────────┐
                │              Expo React Native app (Android)          │
                │  ┌──────────────────────────────────────────────┐    │
                │  │  RN UI (Hermes): chat + wallet + vaults/tipster│   │
                │  └──────────────────────────────────────────────┘    │
                │          │ bare-rpc                  │ WDK hooks      │
                │          ▼                            ▼                │
                │  ┌──────────────────────┐  ┌──────────────────────┐  │
                │  │ Bare worklet #1:     │  │ Bare worklet #2:     │  │
                │  │ Pear-end (P2P chat)  │  │ WDK wallet (EVM,     │  │
                │  │ Hyperswarm +         │  │  Amoy), BIP-39/44,   │  │
                │  │ Hypercore +          │  │  sign, send, history,│  │
                │  │ Corestore            │  │  token, gating check │  │
                │  │ (react-native-bare-  │  │ (react-native-bare-  │  │
                │  │  kit + bare-pack)    │  │  kit + wdk bundle)   │  │
                │  └──────────────────────┘  └──────────────────────┘  │
                └───────────────┬───────────────────┬───────────────────┘
                                │ JSON-RPC (Amoy)   │
                                ▼                   ▼
                  ┌───────────────────────────────────────┐
                  │            Polygon Amoy                │
                  │  ┌──────────────────────────────────┐  │
                  │  │ Singleton (Master)               │  │
                  │  │  • custody of Bet Token          │  │
                  │  │  • vault factory                 │  │
                  │  │  • Azuro bettor (only talker)    │  │
                  │  │  • per-vault accounting          │  │
                  │  └────────────┬─────────────────────┘  │
                  │       creates │        │ bets via      │
                  │               ▼        ▼               │
                  │  ┌──────────────────┐ ┌────────────────────────┐ │
                  │  │ Vault[1..N]      │ │ Azuro v3.0.13           │ │
                  │  │ ERC-4626 share   │ │ LP.bet + withdrawPayout │ │
                  │  │ token (state)    │ │ AzuroBet NFT (ERC-721)  │ │
                  │  └──────────────────┘ └────────────────────────┘ │
                  └───────────────────────────────────────┘
```

**Core invariants**

1. All Bet Token sits in the **singleton**. Vaults hold **no** Bet Token.
2. The **singleton** is the only contract that approves Bet Token to and calls the **Azuro LP**.
3. Each **vault** is an ERC-4626-style share token whose `totalAssets()` is derived from the
   singleton's per-vault accounting — not from a token balance it holds.
4. A tipster may only **trigger bets** on their own vault; they may **not** withdraw.
5. A fan may **redeem** shares for a pro-rata slice of the vault's current book
   (free balance + settled winnings − losses) at any time.

---

## 6. Repository Structure (pnpm workspaces + Foundry)

```
thetabet/
├─ SPEC.md
├─ pnpm-workspace.yaml
├─ package.json
├─ tsconfig.base.json
├─ apps/
│  └─ mobile/                   # Expo React Native app (Phases 1–3)
│     ├─ app/                   # RN screens: chat, wallet, vaults, tipster
│     ├─ pear-end/              # P2P chat logic (Hyperswarm/Hypercore/Corestore)
│     ├─ pear-end.bundle.mjs    # bare-pack output (chat worklet bundle)
│     ├─ wdk.config.js          # WDK worklet bundler config (polygonAmoy)
│     ├─ .wdk/bundle.js         # wdk-worklet-bundler output (WDK worklet bundle)
│     ├─ rpc/                   # bare-rpc handlers (chat) + WDK hooks wiring
│     ├─ app.json               # Expo config (no eas.json — no EAS)
│     └─ babel.config.js / metro.config.js
├─ packages/
│  ├─ contracts-abis/           # generated ABIs + addresses from Foundry (TS)
│  ├─ azuro-client/             # thin wrapper over @azuro-org/toolkit + LP ABI helpers
│  └─ shared/                   # shared TS types (Channel, Vault, Bet, Identity)
└─ contracts/                   # Foundry project
   ├─ foundry.toml
   ├─ src/
   │  ├─ ThetaSingleton.sol     # master: custody, factory, Azuro bettor, accounting
   │  └─ TipsterVault.sol       # ERC-4626-style share token (state only)
   ├─ test/
   │  ├─ Singleton.t.sol
   │  ├─ Vault.t.sol
   │  └─ AzuroIntegration.t.sol # fork Amoy, bet against real LP
   └─ script/
      └─ DeployAmoy.s.sol
```

---

## 7. Phase 1 — Pear P2P Chat (RN + Bare worklet, on-device)

**Goal:** a dyne.org/Keet-style P2P chat running on the Android device, where the P2P stack
(Hyperswarm/Hypercore/Corestore) lives in a **Bare worklet** via `react-native-bare-kit`. This is
the foundation the wallet and contracts plug into.

### 7.1 Scope (confirmed: channels + persistence; packaged = the Expo dev-client build)

- Multiple **tipster channels**, each a Hyperswarm **topic** (32-byte key).
- **Public channel** (announced topic) for discovery + a per-tipster **private channel**
  (unannounced topic, shared key only). Private gating (token-gating) is wired in Phase 3;
  here we only build the key-sharing plumbing.
- **Persistence** via Corestore + Hypercore under the app's document directory
  (`expo-file-system` `documentDirectory`); one append-only core per channel; replicate on join.
- **Per-user identity** = a long-lived Ed25519 key generated/stored in the Bare worklet; shown as a
  short pubkey handle. (Wallet linking is optional and added in Phase 3.)
- **"Packaging"** = the Expo **dev-client** build (local, one-time via `npx expo run:android`)
  installed on the device; further iteration is Metro HMR (no per-change native rebuild).

### 7.2 Pear-end worklet (`apps/mobile/pear-end/`, bundled via `bare-pack --linked`)

- Open `Corestore(documentDirectory + '/pear-end')`.
- Maintain a channel directory: `{ topicKey, name, ownerPubkey, isPrivate, shareKey? }`.
- For each joined channel: `hyperswarm.join(topic)`, replicate the channel's Hypercore, append
  outbound messages, emit inbound messages over the IPC stream.
- Expose a `bare-rpc` surface to RN:
  - `createChannel(name, isPrivate) → channelId`
  - `joinChannel(channelId) → history[]`
  - `sendMessage(channelId, text)`
  - `onMessage(channelId, cb)`
  - `shareChannelKey(channelId, peerPubkey)` / `receiveChannelKey(...)`

### 7.3 RN UI

- Screens: channel list, message view, composer, identity badge.
- `Worklet` from `react-native-bare-kit` loads `pear-end.bundle.mjs`; `bare-rpc` for calls/events.
- No wallet UI yet (Phase 2 adds wallet screens).

### 7.4 Acceptance

- Two peers exchange messages in real time. Localhost testing without a second phone: run a
  **Node/Bare peer on WSL** using the **same** `pear-end` bundle on the same topic — phone ↔ WSL
  peer validates P2P end-to-end. (Two phones also work.)
- Restarting the app replays persisted history from Corestore.
- A private channel is unreadable to a peer who was never given the topic key.
- The dev-client build installs and runs on the physical device over ADB.

### 7.5 Phase 1 tasks

1. `expo init` (with `expo-dev-client`); add `react-native-bare-kit`, `bare-rpc`, `bare-pack`.
2. Write `pear-end/` (Corestore + Hypercore + Hyperswarm); bundle with `bare-pack --linked`.
3. `bare-rpc` surface + RN screens (channel list / messages / composer).
4. Identity key generation + persistence + short-handle display.
5. Private channel key-exchange plumbing (manual key pass for now).
6. One-time local `npx expo run:android` build → install on device; Metro + `adb reverse`.
7. Multi-peer smoke test: phone ↔ WSL Node peer on the same topic; verify persistence + privacy.

---

## 8. Phase 2 — WDK Wallet (React Native Core, on-device)

**Goal:** a minimal self-custodial wallet for **Polygon Amoy only**, running via **WDK React Native
Core** (engine in a second Bare worklet), exposed to RN through hooks. No contracts yet — just a
working wallet that can receive, transfer, show history, and generate accounts.

### 8.1 Scope

- **Self-custody**: BIP-39 mnemonic generated on first run, stored encrypted on-device (MMKV +
  biometrics via WDK RN core); private keys never leave the WDK worklet.
- **BIP-44** derivation `m/44'/60'/0'/0/x` (EVM, via `@tetherto/wdk-wallet-evm`).
- **Polygon Amoy only** (single network in `wdk.config.js`).
- Asset: native MATIC (for gas) + the Azuro **Bet Token** (`0xCf1b86ce...`) for transfers/history.
- **Features**: create/import wallet, lock/unlock, derive account(s), show address + QR (receive),
  transfer (native + Bet Token), transaction history, balances.
- UI: wallet screens in RN next to the chat screens.

### 8.2 WDK integration (`apps/mobile/`, via `@tetherto/wdk-react-native-core`)

- Wrap the app in `<WdkAppProvider bundle={{ bundle }} wdkConfigs={configs}>` — `bundle` from
  `.wdk/bundle.js` (generated) or the prebuilt `@tetherto/pear-wrk-wdk` bundle for prototyping.
- `wdk.config.js`: `modules: { core: '@tetherto/wdk', evm: '@tetherto/wdk-wallet-evm' }` and
  `networks: { polygonAmoy: { module: 'evm', chainId: 80002, blockchain: 'polygon', provider: <Amoy RPC> } }`.
  (If the bundler requires the erc-4337 module, use `@tetherto/wdk-wallet-evm-erc-4337` in standard
  non-AA mode — confirm at impl time.)
- Hooks used: `useWdkApp` (state: INITIALIZING/NO_WALLET/LOCKED/READY/ERROR),
  `useWalletManager` (create/restore/lock/unlock), `useAccount({ network: 'polygonAmoy', accountIndex })`
  (address, send, sign, verify, estimateFee), `useBalance` / `useBalancesForWallets`.
- Bet Token balance: `useBalance` with the Bet Token address, or a custom read via `viem`
  `readContract` on `0xCf1b86ce...`.
- `signMessage` (EIP-191) for token-gating proofs in Phase 3.
- History: WDK `getTransactionHistory`; if Amoy isn't covered, fall back to PolygonScan Amoy API /
  viem scan.

### 8.3 Acceptance

- Fresh app: create wallet → see Amoy address + QR.
- Fund from an Amoy faucet (test MATIC) + Bet Token; balances update (TanStack Query caching).
- Send Bet Token to a second address; tx confirms on Amoy and appears in history.
- Restart app: wallet persists; lock/unlock works (biometrics optional).
- Multiple derived accounts (index 0..n) work.

### 8.4 Phase 2 tasks

1. Add `@tetherto/wdk-react-native-core`, `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`; dev dep
   `@tetherto/wdk-worklet-bundler`.
2. `wdk-worklet-bundler init` → `wdk.config.js` (polygonAmoy) → `generate` → `.wdk/bundle.js`.
3. `WdkAppProvider` in the app root; wire `wdkConfigs` for Amoy.
4. Wallet screens: create/import, lock/unlock, account + QR, balances, send, history.
5. Bet Token balance + transfer (native + ERC-20).
6. `signMessage` for later gating; biometric lock optional.
7. One-time local native rebuild (WDK adds native deps): `npx expo run:android` → reinstall on device.
8. End-to-end on Amoy (faucet → receive → send → history) on the physical device.

---

## 9. Phase 3 — Smart Contracts + Azuro Integration

**Goal:** deploy the singleton + vault factory on Polygon Amoy, wire the WDK wallet to deposit
into vaults and redeem shares, have the tipster place Azuro bets from a vault via the singleton,
and unlock private channels based on vault share balance.

### 9.1 Contracts (draft — will be redesigned)

#### 9.1.1 `ThetaSingleton.sol`

Owns all Bet Token. Is a vault factory. Is the only Azuro caller. Keeps per-vault accounting.

```solidity
interface IThetaSingleton {
    // ---- vault factory ----
    function createVault(string calldata name, string calldata symbol)
        external returns (address vault);

    function vaultCount() external view returns (uint256);
    function vaultOf(uint256 vaultId) external view returns (address);

    // ---- custody / accounting ----
    /// @dev Bet Token held by singleton that belongs to vaultId and is not exposed in bets.
    function vaultFreeBalance(uint256 vaultId) external view returns (uint256);

    /// @dev Total attributable assets of a vault (free + unsettled bet exposure value).
    /// Used by the vault's ERC-4626 totalAssets().
    function vaultTotalAssets(uint256 vaultId) external view returns (uint256);

    /// @dev Called by a vault on deposit: pull Bet Token from fan into singleton, credit vault.
    function depositFor(uint256 vaultId, address fan, uint256 amount) external returns (uint256 shares);

    /// @dev Called by a vault on redeem: burn shares, send Bet Token to fan from singleton.
    function withdrawFor(uint256 vaultId, address fan, uint256 shares) external returns (uint256 amount);

    // ---- Azuro betting (tipster only) ----
    /// @dev Place an Azuro bet on behalf of vaultId via the direct on-chain path.
    ///      Singleton has pre-approved Bet Token to LP; LP pulls `amount` and mints the
    ///      AzuroBet NFT to the singleton. `data` = abi.encode((uint256 conditionId, uint64 outcomeId)[], ...)
    ///      Matches Azuro v3: lp.bet(core, amount, deadline, affiliate, data, minOdds).
    function placeBet(
        uint256 vaultId,
        address core,        // Prematch/Live Core (chainsData.contracts.core)
        uint256 amount,      // Bet Token, 6 decimals
        uint64  deadline,
        address affiliate,
        bytes   data,        // encoded (conditionId, outcomeId) selection(s)
        uint64  minOdds      // 12 decimals
    ) external returns (uint256 azuroBetNftId);

    /// @dev Settle a resolved winning bet: LP.withdrawPayout(betNftId) returns Bet Token to the
    ///      singleton and credits the vault's free balance. (Early cashout is out of MVP scope.)
    function settleBet(uint256 vaultId, uint256 azuroBetNftId) external returns (uint256 payout);

    // ---- access ----
    function tipsterOf(uint256 vaultId) external view returns (address);
    function betToken() external view returns (address);
    function azuroLP() external view returns (address);
    function azuroBetNFT() external view returns (address);
}
```

Notes:
- `depositFor` / `withdrawFor` are callable **only by the corresponding vault** (vault auth).
- `placeBet` / `settleBet` are callable **only by the vault's tipster**.
- The singleton approves the Bet Token to the Azuro LP once at deployment (or lazily on first bet).
- `placeBet` calls `ILP(lp).bet(core, amount, deadline, affiliate, data, minOdds)`; the AzuroBet
  NFT is minted to the singleton. Capture the NFT id from the LP event / return; map `nftId => vaultId`.
- `settleBet` calls `ILP(lp).withdrawPayout(betNftId)` (confirm exact name against the v3.0.13 LP
  ABI from `chainsData[polygonAmoy.id].contracts.lp.abi`); payout returns to the singleton and
  raises `vaultFreeBalance[vaultId]`. Losing bets simply remove the exposure (no call needed once
  the condition resolves against the selection; `vaultTotalAssets` excludes unresolved exposure).
- All Bet Token amounts use **6 decimals**; `minOdds` uses **12 decimals**.

#### 9.1.2 `TipsterVault.sol` (ERC-4626-style, state-only)

A standard-looking ERC-4626 interface where `asset` = Bet Token, but asset custody is delegated
to the singleton. Shares are the channel-access credential.

```solidity
interface ITipsterVault is IERC4626 {
    function vaultId() external view returns (uint256);
    function singleton() external view returns (address);
    function tipster() external view returns (address);

    // IERC4626 overrides that route to the singleton:
    //   deposit(amount)      -> singleton.depositFor(vaultId, msg.sender, amount) -> mint shares
    //   redeem(shares)       -> burn shares -> singleton.withdrawFor(vaultId, msg.sender, shares)
    //   totalAssets()        -> singleton.vaultTotalAssets(vaultId)
    //   previewDeposit/Redeem use singleton accounting
}
```

- `createVault` on the singleton deploys a new `TipsterVault`, registers `vaultId`,
  sets `tipster = msg.sender`, and the vault mints its own ERC-20 (shares).
- Share math: standard 4626 first-deposit convention; `totalAssets` comes from the singleton.
- No fees, no minimums, no locks (MVP).

### 9.2 Flows

**Deposit (fan → vault)**
1. Fan (WDK wallet) calls `vault.deposit(amount)` with Bet Token `approve(vault, amount)`.
2. Vault → `singleton.depositFor(vaultId, fan, amount)` pulls Bet Token to singleton, returns shares.
3. Vault mints shares to fan. Fan is now token-gated into the tipster's channel.

**Redeem (fan ← vault)**
1. Fan calls `vault.redeem(shares)`.
2. Vault burns shares → `singleton.withdrawFor(vaultId, fan, shares)` sends pro-rata Bet Token to fan.

**Place bet (tipster)**
1. UI fetches a condition/outcome + min odds via `@azuro-org/toolkit` (`getBetCalculation`, feed).
2. Tipster (WDK wallet) signs `singleton.placeBet(vaultId, core, amount, deadline, affiliate, data, minOdds)`.
3. Singleton checks `vaultFreeBalance(vaultId) >= amount`, debits free balance, calls
   `ILP(lp).bet(core, amount, deadline, affiliate, data, minOdds)` (Bet Token pre-approved to LP),
   receives the AzuroBet NFT, maps `nftId => vaultId`, increases bet exposure.

**Settle bet (tipster or anyone)**
1. `singleton.settleBet(vaultId, nftId)` calls `ILP(lp).withdrawPayout(nftId)`; payout returns to
   the singleton and raises the vault's free balance. (Loss → exposure is just removed once the
   condition resolves against the selection; no payout call needed.)
2. Early **cashout is out of MVP scope** (requires the signed/relayer `createCashout` flow).

### 9.3 Azuro integration specifics

- Use `@azuro-org/toolkit` (`chainsData[polygonAmoy.id]`, `getBetCalculation`, `getBetFee`, feed
  endpoints) to fetch live odds/conditions for the UI; the **on-chain bet** is placed by the
  singleton via the LP ABI (`setupContracts`/`contracts.lp.abi`).
- The singleton uses the **direct on-chain path** (`lp.bet` + `withdrawPayout`), **not** the
  relayer/EIP-712 signed flow (`createBet`/`createCashout`) — a contract cannot sign EIP-712.
- Test against a **forked Amoy** in Foundry (`anvil --fork-url <Amoy RPC>`) before live deploy;
  place a real `lp.bet` against the live LP and `withdrawPayout` after it resolves.
- `DeployAmoy.s.sol` deploys `ThetaSingleton` (config: Bet Token, Azuro LP, AzuroBet NFT, Core
  from `chainsData`) and approves Bet Token to the LP; idempotent.
- Generate ABIs into `packages/contracts-abis/` for the TS side.

### 9.4 WDK ↔ contracts integration

- Add "Vaults" screens: browse vaults (singleton reads), `deposit` / `redeem` through WDK signing,
  see per-vault share balance + free/total assets.
- Add a "Tipster" screen (if the user created a vault): pick an Azuro condition/outcome from the
  toolkit feed, sign `placeBet` via WDK, track AzuroBet NFT ids, settle.
- All signing flows through the WDK worklet; the RN UI never touches private keys.

### 9.5 Token-gated channel access (ties Phase 1 + 3 together)

- A tipster's private channel topic key is held by the tipster's **Pear-end worklet**.
- Fan requests access: signs a challenge with their EVM key (WDK `signMessage`).
- Tipster's Pear-end worklet verifies the signature, then reads `vault.balanceOf(fan) >= threshold`
  (on Amoy via RPC). If pass → send the channel topic key to the fan over the existing peer
  connection. The fan's worklet joins the channel.
- `threshold` is per-vault and stored off-chain by the tipster (or on-chain as a vault param in
  a later iteration).

### 9.6 Acceptance

- `forge test -vv` passes incl. an Amoy-fork Azuro integration test (deposit → bet → settle → redeem).
- Singleton deployed on Amoy; addresses recorded in `packages/contracts-abis/`.
- From the RN app on device: create a vault (you become tipster), deposit Bet Token as a fan, see shares.
- As tipster, place a real Azuro bet on Amoy from the vault; observe AzuroBet NFT + reduced free
  balance; settle and see balance return.
- A fan holding >= threshold shares can unlock and read the tipster's private channel; a fan
  below threshold cannot.

### 9.7 Phase 3 tasks

1. Foundry project + pnpm wiring; export ABIs to TS package.
2. Implement `TipsterVault` (4626-style) with singleton-routed deposit/redeem; unit tests.
3. Implement `ThetaSingleton` factory + custody + accounting; unit tests.
4. Amoy-fork test: approve Bet Token → `lp.bet` → receive AzuroBet NFT → `withdrawPayout`.
5. Wire `placeBet` / `settleBet` with tipster auth + per-vault accounting (6-dec amounts, 12-dec odds).
6. `DeployAmoy.s.sol` + live deploy; record addresses.
7. WDK worklet: vault deposit/redeem + tipster `placeBet`/`settleBet` signing.
8. Token-gating: signed challenge + on-chain `balanceOf` check + topic-key release.
9. End-to-end on Amoy: faucet → deposit → bet → settle → redeem → unlock channel.

---

## 10. Phase 4 — Privacy (out of scope; owner-driven)

Not designed here. Intent: a Railgun-like mix/shield pool so bets into vaults are privacy-protected.
The singleton/vault split is intentionally compatible with this future layer.

---

## 11. Cross-cutting concerns

- **Identity ↔ wallet linking**: optional, opt-in per user (sign-in-with-wallet). Not required for
  MVP; recommended for reputation later. (Open decision — defaulted to "optional".)
- **Networking**: Hyperswarm over DHT for chat (Bare worklet); Amoy JSON-RPC for chain. No relay/TURN planned for now.
- **Storage**: on-device app storage — `expo-file-system` `documentDirectory` for Corestore +
  channel directory; MMKV (via WDK RN core) for encrypted mnemonic/wallet state.
- **Error model**: `bare-rpc`/WDK calls return typed errors; tx reverts surfaced to UI with
  decoded reasons (`viem`/ethers ABI decode).
- **Config**: a single `chains.ts` exporting Amoy + Azuro v3.0.13 addresses; singleton address
  added after deploy.

---

## 12. Testing & Acceptance (overall)

- **Phase 1**: on-device chat + persistence; phone ↔ WSL Node peer validates P2P; dev-client runs.
- **Phase 2**: full wallet lifecycle on Amoy (seed → receive → send → history) on device via WDK RN core.
- **Phase 3**: Foundry unit + Amoy-fork tests; live on Amoy with real Azuro bets from the device; token-gating works.
- No CI requirements yet; a `pnpm test` + `forge test` entry point should exist per phase.

---

## 13. Dev workflow on WSL2 (local build + USB/adb, no EAS)

Goal: no EAS, no emulator — just a USB cable and `adb`. Iterate JS fast on a physical Android
device after a one-time local native build.

**One-time setup (WSL2 + Windows host)**
- WSL2: Node, pnpm, Expo CLI, `adb` (`sudo apt-get install adb`), Android SDK + Gradle (for the
  local native build — Android Studio command-line tools are enough).
- Windows: `usbipd-win` (`winget install usbipd-win`) — this is the bridge that makes the USB cable
  visible inside WSL2 (WSL2 can't see USB devices on its own); phone in USB debugging mode.
- Attach phone to WSL: `usbipd list` → `usbipd bind --busid <BUSID>` →
  `usbipd attach --wsl --busid <BUSID>` (use `--auto-attach` to survive replug); verify `adb devices`.

**One-time local native build (the only heavy build)**
- `npx expo run:android` — runs `expo prebuild` (generates the native `android/` project) + Gradle
  `assembleDebug` + installs on the connected device. First run is slow (Gradle deps + native
  modules like `react-native-bare-kit`, libsodium); subsequent runs are cached.
- Rebuild **only** when native deps change (add/upgrade of `react-native-bare-kit`, WDK native
  modules, Expo config plugins) — not on JS or worklet-bundle changes.

**Day-to-day (fast)**
- Metro: `npx expo start --localhost` in WSL.
- Bridge device → WSL Metro: `adb reverse tcp:8081 tcp:8081`.
- JS changes → Metro HMR on device (seconds).
- Worklet (chat `pear-end` / WDK bundle) changes → rebundle (`bare-pack` /
  `wdk-worklet-bundler generate`, seconds) + reload app — **no native rebuild**.

**P2P testing without a second phone**
- Run a **Node/Bare peer on WSL** using the **same** `pear-end` bundle on the same Hyperswarm
  topic; the phone and WSL peer connect over the DHT (LAN/localhost). Validates chat end-to-end
  with a single device.

---

## 14. Risks & Open Questions

Resolved during spec refinement:

- ~~WDK Pear Worklet package name~~ → `@tetherto/pear-wrk-wdk` (+ `@tetherto/wdk-worklet-bundler`,
  `@tetherto/wdk-react-native-core` for mobile). See §4.2.
- ~~Azuro bet path~~ → singleton uses the **direct on-chain** `lp.bet` + `withdrawPayout`; the
  relayer/EIP-712 signed flow is for EOAs and is not used. Early **cashout out of MVP scope**.
- ~~Bet Token decimals~~ → **6** (USDT-style); `minOdds` **12** decimals; Amoy env `PolygonAmoyUSDT`.
- ~~WDK EVM Amoy support~~ → `@tetherto/wdk-wallet-evm` explicitly supports Polygon Amoy.

Still open (confirm at implementation time):

- **Azuro v3.0.13 LP ABI exactness** — confirm `withdrawPayout` (and the `bet` return / event for
  the AzuroBet NFT id) against `chainsData[polygonAmoy.id].contracts.lp.abi` / `setupContracts`.
- **WDK indexer coverage for Amoy** — `getTransactionHistory` may need a PolygonScan Amoy / viem
  fallback if the WDK indexer doesn't cover Amoy.
- **WDK EVM module vs bundler** — the RN core's bundler example uses `@tetherto/wdk-wallet-evm-erc-4337`;
  confirm the standard `@tetherto/wdk-wallet-evm` works with the bundler for a plain Amoy wallet,
  else use erc-4337 in standard (non-AA) mode.
- **One-time native build** — first local `npx expo run:android` (Gradle + native modules like
  `react-native-bare-kit`/libsodium) is slow; cached afterward. Rebuild only on native-dep changes.
  (No EAS by choice — local build + USB/`adb`.)
- **WSL USB/ADB reliability** — `usbipd-win` attach can drop on replug; use `--auto-attach` and
  re-run `adb reverse` after re-attach.
- **Two-device P2P testing** — a single phone can't easily run two instances; mitigate with the
  WSL Node/Bare peer on the same topic (§13).
- **4626 compliance** — the vault does not custody the asset, so strict ERC-4626 viewers/tools may
  mis-report `totalAssets`/`asset`. Acceptable for MVP; redesign later (esp. for the privacy phase).
- **Settlement timing** — Azuro resolution is oracle-dependent; settle-on-demand is fine for MVP.
- **Gas** — tipster needs test MATIC to trigger `placeBet`; documented in the dev guide.

---

## 15. References

- Pear docs: https://docs.pears.com
- Pear mobile guide (Bare + Expo): https://github.com/holepunchto/pear-docs/blob/main/guide/making-a-bare-mobile-app.md
- `bare-expo` template: https://github.com/holepunchto/bare-expo
- `react-native-bare-kit`: https://github.com/holepunchto/bare-kit
- `bare-rpc`: https://github.com/holepunchto/bare-rpc
- WDK docs: https://docs.wdk.tether.io
- WDK React Native Core: https://docs.wdk.tether.io/tools/react-native-core/ · https://github.com/tetherto/wdk-react-native-core
- WDK EVM module: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm/
- WDK Worklet Bundler: https://github.com/tetherto/wdk-worklet-bundler · docs https://docs.wdk.tether.io/tools/worklet-bundler/
- WDK Pear Worklet (prebuilt bundle): https://github.com/tetherto/pear-wrk-wdk · npm `@tetherto/pear-wrk-wdk`
- Azuro deployment addresses: https://gem.azuro.org/hub/blockchains/deployment-addresses
- Azuro v3 APIs: https://gem.azuro.org/hub/apps/APIs · v3 migration: https://gem.azuro.org/hub/protocol-v3/v3-migration-guide
- Azuro toolkit (LLMs): https://context7.com/azuro-protocol/toolkit/llms.txt
- Expo dev client / prebuild: https://docs.expo.dev/bare/install-dev-builds-in-bare · `expo run:android`: https://docs.expo.dev/more/expo-cli/
- WSL2 Android dev (usbipd-win + adb): https://learn.microsoft.com/windows/wsl/
- Polygon Amoy: chain id 80002, explorer https://amoy.polygonscan.com

---

### Decision log (from initial questionnaire)

| # | Decision | Choice |
| --- | --- | --- |
| Q1 | Vault token model | ERC-4626-style share token; funds custodied by singleton, vaults are state-only; factory of vaults in the singleton. |
| Q2 | Tipster permissions | Bet-only; tipster cannot withdraw; fans redeem pro-rata anytime. |
| Q3 | Tipster onboarding | Permissionless `createVault()`. |
| Q4 | Revenue | No fees for MVP. |
| Q5 | Channel access | Token-gated (holding vault share token >= threshold). |
| Q6 | Deposit/bet asset (Amoy) | Azuro Bet Token `0xCf1b86ce...` as the single deposit + bet asset. |
| Q7 | Phase 1 scope | Multiple tipster channels + persistence + packaged app. |
| Q8 | Wallet host | WDK via **React Native Core** (engine in a Bare worklet). Platform = Expo RN, Android-first. |
| Q9 | Azuro execution | Singleton routes the call to Azuro and updates the vault; funds live in the singleton. |
| Q10 | Tooling | pnpm workspaces + Foundry. |
| P1 | Platform (post-questionnaire) | **RN/Expo now** via `expo-dev-client` + physical device over ADB (WSL2 + `usbipd-win`). Desktop Electron path dropped. P2P = Pear/Holepunch modules in a `react-native-bare-kit` worklet; wallet = WDK RN core. See §13 for the fast-iteration workflow. |

### Refinement notes (post-questionnaire research)

- Platform locked to **Expo RN (Android)**, developed from WSL2. P2P via `react-native-bare-kit`
  (Bare worklet) + `bare-rpc` + `bare-pack`; wallet via `@tetherto/wdk-react-native-core`
  (engine in a second Bare worklet). See §4.1 / §4.2 / §13.
- WDK packages confirmed: `@tetherto/wdk-react-native-core`, `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`,
  `@tetherto/wdk-worklet-bundler`, optional prebuilt `@tetherto/pear-wrk-wdk`. See §4.2 / §8.2.
- WDK EVM module supports Polygon Amoy; wallet API surface captured in §8.2.
- Azuro v3 has two bet paths; the singleton uses the **direct on-chain** `lp.bet` + `withdrawPayout`
  (a contract can't do the EIP-712 signed/relayer flow). Early cashout is **out of MVP scope**. §4.3 / §9.
- Bet Token = **6 decimals**, `minOdds` = **12 decimals**, Amoy env `PolygonAmoyUSDT`. §4.3.
