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

The long-term target is a **React Native** mobile app. For now we layer dev phases on desktop
first (Pear runs on Electron + Bare; WDK runs on Bare/Node/RN; both compose inside one Pear app).

---

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **Pear** | Holepunch P2P runtime: Electron renderer + Bare worker(s). Used for chat and as the host for WDK. |
| **Bare** | Pear's JS runtime that runs workers (where native modules like Hyperswarm/Hypercore live). |
| **WDK** | Tether Wallet Development Kit. Self-custodial, stateless, BIP-39/44, modular. Runs on Bare/Node/RN. |
| **Pear Worklet** | A Bare worklet (lighter than a worker) used to host WDK inside the Pear app process. |
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
- **React Native mobile build** — desktop-first now; Expo/RN comes after desktop integration is proven.
- **Fees / revenue** — no performance, management, or subscription fees in the MVP.
- **Tipster whitelisting / staking / slashing** — vault creation is permissionless.
- **Production hardening** — no audited security, no multisig, no mainnet, no real funds.
- **Early Azuro cashout** — the relayer/EIP-712 signed `createCashout` flow is out of MVP; the
  singleton settles resolved winning bets via `LP.withdrawPayout` only.
- **Off-chain indexing UI** — use Amoy block explorer + Azuro toolkit endpoints; no custom subgraph backend.
- **Replacing Pear or WDK** with any other P2P or wallet library.

---

## 4. Technology Stack (confirmed)

### 4.1 P2P / App runtime — Pear (mandatory)

- `pear-runtime` — embeds Bare worker(s) inside the Electron host.
- `hyperswarm` — DHT peer discovery + E2E-encrypted connections on a topic key.
- `hypercore` — append-only log (per-channel message history).
- `corestore` — storage factory for hypercores (persistence).
- `b4a` — binary buffer helpers.
- `electron` (dev) — renderer host.
- Template reference: `hello-pear-electron` (Holepunch). Docs: https://docs.pears.com

### 4.2 Wallet — WDK by Tether (mandatory)

Core + EVM module (runs on Bare / Node / RN; supports **Polygon Amoy** explicitly):

- `@tetherto/wdk` — core orchestrator. `new WDK(seedPhrase)`, `WDK.getRandomSeedPhrase(24)`,
  `wdk.registerWallet(name, Module, config)`, `wdk.getAccount(name, index)`.
- `@tetherto/wdk-wallet-evm` — EVM wallet module: BIP-39 seed (12/24-word), BIP-44 `m/44'/60'/0'/0/x`,
  ethers.js HD wallet, EIP-1559 fees, offline `signTransaction`, ERC-20 balances.
  API surface used in Phase 2: `getAccount(index)`, `getAddress(index)`, `getBalance(index)`,
  `getTokenBalance(index, tokenAddress)`, `getTokenBalances(...)`, `sendTransaction(params)`,
  `estimateTransaction(params)`, `signMessage(message, index)`, `verifySignature(...)`,
  `getTransactionHistory(index, limit)`. Provider = JSON-RPC URL / EIP-1193 / failover list.

Pear Worklet hosting (this is how WDK lives inside the Pear app):

- `@tetherto/pear-wrk-wdk` (v1.0.0-beta.x) — foundational infra for running WDK inside a **Bare Worklet**.
  Worklet side: `require('@tetherto/pear-wrk-wdk/worklet').registerRpcHandlers`. Host side:
  `require('@tetherto/pear-wrk-wdk').HRPC` + `bare-ipc`. Also exports a **prebuilt bundle**
  (`import { bundle } from '@tetherto/pear-wrk-wdk'`) for quick prototyping (all modules, larger).
- `@tetherto/wdk-worklet-bundler` (dev dep) — CLI to generate a **custom EVM-only bundle**
  (`wdk-worklet-bundler init` → `wdk.config.js` → `generate` → `.wdk/bundle.js`) so we ship only
  the EVM module for Amoy. Used after prototyping.
- `@tetherto/wdk-react-native-core` — RN hooks (`useWalletManager`, `useAccount`, `useBalance`, …),
  TanStack Query + Zustand/MMKV + biometrics. **Deferred to the mobile (Expo/RN) phase** — not used
  in the desktop Pear app, where we wire our own preload-bridge RPC over HRPC.

> Note: `pear-wrk-wdk` is documented around the RN Bare Kit runtime, but the worklet/HRPC
> primitives are Bare-runtime-agnostic. For the desktop Pear app we spawn the worklet from the
> Electron main via Pear/Bare Kit, connect over HRPC + `bare-ipc`, and expose it to the renderer
> through the preload bridge (same pattern as the chat worker). Confirm the exact Pear desktop
> worklet-spawn API during implementation; fallback is a dedicated Bare **worker** with the same
> HRPC primitives (no API change on the wallet side).

- Docs: https://docs.wdk.tether.io · GitHub: `tetherto/pear-wrk-wdk`, `tetherto/wdk-worklet-bundler`

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
- **Foundry** (`forge`, `cast`, `anvil`) — Solidity contracts, tests, local fork of Amoy.
- **TypeScript** end-to-end (Pear + WDK are TS).
- `viem` (^2.37.4, also required by `@azuro-org/toolkit`) / `ethers` (via WDK EVM module) —
  contract reads/writes, ABI decoding, Azuro toolkit helpers.
- Node/Bare via Pear toolchain.

---

## 5. System Architecture

```
                ┌───────────────────────────────────────────────────────┐
                │                   Pear App (Electron)                 │
                │  ┌───────────────┐   ┌───────────────┐               │
                │  │  Renderer (UI)│──▶│  Preload bridge│              │
                │  └───────────────┘   └───────────────┘               │
                │          │                    │                        │
                │          │      IPC (FramedStream / worklet)          │
                │          ▼                    ▼                        │
                │  ┌──────────────────┐  ┌──────────────────────┐      │
                │  │ Bare worker:     │  │ Bare worklet: WDK     │      │
                │  │ P2P chat         │  │ wallet (EVM, Amoy)    │      │
                │  │ Hyperswarm +     │  │ BIP-39/44, sign,      │      │
                │  │ Hypercore +      │  │ send, history, token  │      │
                │  │ Corestore        │  │ gating checks         │      │
                │  └──────────────────┘  └──────────────────────┘      │
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
│  └─ pear-app/                 # Electron + Bare worker(s) + WDK worklet (Phases 1–3)
│     ├─ electron/              # main + preload bridge
│     ├─ renderer/              # UI (chat + wallet screens)
│     ├─ workers/chat/          # Bare worker: Hyperswarm + Hypercore + Corestore
│     ├─ worklets/wallet/       # Bare worklet: WDK EVM wallet (entry + .wdk/bundle.js)
│     └─ pear.json/             # Pear app manifest + release config
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

## 7. Phase 1 — Pear P2P Chat (localhost-first, then package)

**Goal:** a dyne.org/Keet-style P2P chat that runs locally between multiple peers, persists
messages, and is packaged as a Pear app. This is the foundation the wallet and contracts will
plug into.

### 7.1 Scope (confirmed: channels + persistence + packaging)

- Multiple **tipster channels**, each a Hyperswarm **topic** (32-byte key).
- **Public channel** (announced topic) for discovery + a per-tipster **private channel**
  (unannounced topic, shared key only). Private gating (token-gating) is wired in Phase 3;
  here we only build the key-sharing plumbing.
- **Persistence** via Corestore + Hypercore (one append-only core per channel; replicate on join).
- **Per-user identity** = a long-lived Ed25519/HD key stored by Pear; displayed as a short pubkey
  handle. (Wallet linking is optional and added in Phase 3.)
- **Packaging** via the Pear release pipeline (`pear build` / stage → release line) so the app
  can be installed and run by another peer on the same machine/LAN.

### 7.2 Worker responsibilities (`apps/pear-app/workers/chat/`)

- Open `Corestore(Pear.storage)`.
- Maintain a directory of channels: `{ topicKey, name, ownerPubkey, isPrivate, shareKey? }`.
- For each joined channel: `hyperswarm.join(topic)`, replicate the channel's Hypercore,
  append outbound messages, emit inbound messages over IPC to the renderer.
- Expose a FramedStream IPC bridge (`window.bridge`):
  - `createChannel(name, isPrivate) → channelId`
  - `joinChannel(channelId) → history[]`
  - `sendMessage(channelId, text)`
  - `onMessage(channelId, cb)`
  - `shareChannelKey(channelId, peerPubkey)` / `receiveChannelKey(...)`

### 7.3 Renderer

- Minimal UI: channel list, message view, composer, identity badge.
- No wallet UI yet (Phase 2 adds a "Wallet" pane).

### 7.4 Acceptance

- Two peers on the same machine (two Pear instances / two keys) exchange messages in real time.
- Restarting an app replays persisted history from Corestore.
- A private channel is unreadable to a peer who was never given the topic key.
- `pear build` produces an installable package that another peer can run and connect with.

### 7.5 Phase 1 tasks

1. Scaffold from `hello-pear-electron`; wire `window.bridge` + worker IPC.
2. Implement Corestore-backed channel directory + Hypercore per channel.
3. Hyperswarm join/announce; message append + replication + IPC fan-out.
4. Identity key generation + persistence + short-handle display.
5. Private channel key-exchange plumbing (manual key pass for now).
6. Local multi-peer smoke test (≥2 instances).
7. Package with Pear release pipeline; verify install + reconnect.

---

## 8. Phase 2 — WDK Wallet in a Pear Worklet

**Goal:** a minimal self-custodial wallet for **Polygon Amoy only**, running inside the Pear app
as a **Bare worklet** (WDK Pear Worklet), reachable from the renderer via the bridge. No contracts
yet — just a working wallet that can receive, transfer, show history, and generate accounts.

### 8.1 Scope

- **Self-custody**: BIP-39 mnemonic generated on first run, stored encrypted by Pear (device-side),
  private keys never leave the worklet.
- **BIP-44** derivation `m/44'/60'/0'/0/x` (EVM, via `@tetherto/wdk-wallet-evm`).
- **Polygon Amoy only** for now (single chain registration).
- Asset: native MATIC (for gas) + the Azuro **Bet Token** (`0xCf1b86ce...`) for transfers/history.
- **Features**: create/import wallet, derive account(s), show address + QR (receive),
  transfer (native + Bet Token), transaction history, balances.
- UI: a "Wallet" pane in the renderer next to the chat pane.

### 8.2 Worklet responsibilities (`apps/pear-app/worklets/wallet/`)

Worklet entry (`worklet.js`) — runs inside the Bare worklet:

- `require('@tetherto/pear-wrk-wdk/worklet').registerRpcHandlers` to expose handlers over HRPC.
- `new WDK(seed)` + `wdk.registerWallet('polygonAmoy', WalletManagerEvm, { provider: <Amoy RPC>, chainId: 80002 })`.
- Load the WDK bundle: prototype with the **prebuilt bundle** from `@tetherto/pear-wrk-wdk`;
  later generate an **EVM-only bundle** via `@tetherto/wdk-worklet-bundler`
  (`wdk-worklet-bundler init` → `wdk.config.js { networks: { polygonAmoy: { package: '@tetherto/wdk-wallet-evm' } } }` → `generate` → `.wdk/bundle.js`).

Host side (Electron main) — spawns the worklet and connects:

- `const { HRPC } = require('@tetherto/pear-wrk-wdk')` + `bare-ipc` to open an HRPC channel to the worklet.
- Relay calls through the preload `window.bridge` (same FramedStream pattern as the chat worker).

Wallet RPC surface (exposed to renderer):
- `walletCreate()` / `walletImport(mnemonic)` / `walletLock()` / `walletUnlock(password)`
- `getAccount(index)` → `{ address, path }` (BIP-44 `m/44'/60'/0'/0/index`)
- `getBalance(index)` → native MATIC + `getTokenBalance(index, BET_TOKEN)` for the Azuro Bet Token
- `getHistory(index)` → tx list (WDK `getTransactionHistory`; if Amoy isn't covered by the WDK
  indexer, fall back to PolygonScan Amoy API / viem `getBlock` scan)
- `sendTx({ index, to, amount, asset })` → `sendTransaction` (native) or ERC-20 transfer
- `signMessage({ index, message })` → EIP-191 personal_sign, used later for token-gating proofs

### 8.3 Acceptance

- Fresh app: generate seed → see Amoy address + QR.
- Fund address from an Amoy faucet (test MATIC) and with Bet Token; balances update.
- Send Bet Token to a second address; tx confirms on Amoy and appears in history.
- Restart app: wallet persists and re-locks/unlocks.
- Multiple derived accounts (index 0..n) work.

### 8.4 Phase 2 tasks

1. Add WDK packages: `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/pear-wrk-wdk`;
   dev dep `@tetherto/wdk-worklet-bundler`; plus `bare-ipc`.
2. Generate an EVM-only worklet bundle (`wdk.config.js` → `polygonAmoy` → `@tetherto/wdk-wallet-evm`).
3. Write `worklets/wallet/worklet.js` (`registerRpcHandlers` + WDK init); spawn it from Electron main
   and connect via HRPC + `bare-ipc`; relay through the preload bridge.
4. Mnemonic generation + encrypted storage via Pear storage; lock/unlock.
5. Account derivation + address/QR (index 0..n).
6. Balances (native + Bet Token via `getTokenBalance`) + history (`getTransactionHistory`).
7. Send (native + ERC-20) + `signMessage`.
8. Wallet pane UI in renderer.
9. Local end-to-end on Amoy (faucet → receive → send → history).

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

- Add a "Vaults" pane: browse vaults (via singleton reads), `deposit` / `redeem` through WDK
  signing, see per-vault share balance + free/total assets.
- Add a "Tipster" pane (if the user created a vault): pick an Azuro condition/outcome from the
  toolkit feed, sign `placeBet` via WDK, track AzuroBet NFT ids, settle.
- All signing flows through the WDK worklet; the renderer never touches private keys.

### 9.5 Token-gated channel access (ties Phase 1 + 3 together)

- A tipster's private channel topic key is held by the tipster's worker.
- Fan requests access: signs a challenge with their EVM key (WDK `signMessage`).
- Tipster's worker verifies the signature, then reads `vault.balanceOf(fan) >= threshold`
  (on Amoy via RPC). If pass → send the channel topic key to the fan over the existing peer
  connection. The fan's worker joins the channel.
- `threshold` is per-vault and stored off-chain by the tipster (or on-chain as a vault param in
  a later iteration).

### 9.6 Acceptance

- `forge test -vv` passes incl. an Amoy-fork Azuro integration test (deposit → bet → settle → redeem).
- Singleton deployed on Amoy; addresses recorded in `packages/contracts-abis/`.
- From the Pear app: create a vault (you become tipster), deposit Bet Token as a fan, see shares.
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
- **Networking**: Hyperswarm over DHT for chat; Amoy JSON-RPC for chain. No relay/TURN planned for now.
- **Storage**: Pear per-app storage for Corestore + encrypted mnemonic + channel directory.
- **Error model**: bridge calls return typed errors; tx reverts surfaced to UI with decoded reasons
  (`viem`/ethers ABI decode).
- **Config**: a single `chains.ts` exporting Amoy + Azuro v3.0.13 addresses; singleton address
  added after deploy.

---

## 12. Testing & Acceptance (overall)

- **Phase 1**: local multi-peer chat + persistence + packaged install reconnects.
- **Phase 2**: full wallet lifecycle on Amoy (seed → receive → send → history) inside the worklet.
- **Phase 3**: Foundry unit + Amoy-fork tests; live on Amoy with real Azuro bets; token-gating works.
- No CI requirements yet; a `pnpm test` + `forge test` entry point should exist per phase.

---

## 13. Risks & Open Questions

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
- **Pear desktop worklet-spawn API** — `pear-wrk-wdk` is documented around RN Bare Kit; confirm the
  exact spawn path from a Pear Electron main. Fallback: a dedicated Bare **worker** with the same
  HRPC primitives (no wallet-side API change).
- **4626 compliance** — the vault does not custody the asset, so strict ERC-4626 viewers/tools may
  mis-report `totalAssets`/`asset`. Acceptable for MVP; redesign later (esp. for the privacy phase).
- **Settlement timing** — Azuro resolution is oracle-dependent; settle-on-demand is fine for MVP.
- **Gas** — tipster needs test MATIC to trigger `placeBet`; documented in the dev guide.
- **Pear mobile** — confirmed deferred; desktop Pear app is the Phase 1–3 target.

---

## 14. References

- Pear docs: https://docs.pears.com
- Pear chat tutorial: https://docs.pears.com/getting-started/build-a-peer-to-peer-chat/build-a-peer-to-peer-chat/
- `hello-pear-electron`: https://docs.pears.com/getting-started/from-a-template/start-from-hello-pear-electron/
- WDK docs: https://docs.wdk.tether.io
- WDK EVM module: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm/
- WDK Pear Worklet: https://github.com/tetherto/pear-wrk-wdk · npm `@tetherto/pear-wrk-wdk`
- WDK Worklet Bundler: https://github.com/tetherto/wdk-worklet-bundler · docs https://docs.wdk.tether.io/tools/worklet-bundler/
- WDK React Native Core (mobile, deferred): https://github.com/tetherto/wdk-react-native-core
- Azuro deployment addresses: https://gem.azuro.org/hub/blockchains/deployment-addresses
- Azuro v3 APIs: https://gem.azuro.org/hub/apps/APIs · v3 migration: https://gem.azuro.org/hub/protocol-v3/v3-migration-guide
- Azuro toolkit (LLMs): https://context7.com/azuro-protocol/toolkit/llms.txt
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
| Q8 | Phase 2 wallet host | WDK inside the Pear app as a Bare worklet (unified desktop). Expo/RN deferred. |
| Q9 | Azuro execution | Singleton routes the call to Azuro and updates the vault; funds live in the singleton. |
| Q10 | Tooling | pnpm workspaces + Foundry. |

### Refinement notes (post-questionnaire research)

- WDK Pear Worklet packages confirmed: `@tetherto/pear-wrk-wdk` + `@tetherto/wdk-worklet-bundler`
  (custom EVM-only bundle); `@tetherto/wdk-react-native-core` deferred to mobile. See §4.2 / §8.2.
- WDK EVM module supports Polygon Amoy; full wallet API surface captured in §8.2.
- Azuro v3 has two bet paths; the singleton uses the **direct on-chain** `lp.bet` + `withdrawPayout`
  (a contract can't do the EIP-712 signed/relayer flow). Early cashout is **out of MVP scope**. §4.3 / §9.
- Bet Token = **6 decimals**, `minOdds` = **12 decimals**, Amoy env `PolygonAmoyUSDT`. §4.3.
