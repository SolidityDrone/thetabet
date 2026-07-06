# ThetaBet — To-Do List

Track remaining work against [SPEC.md](./SPEC.md). Smart contracts and Azuro are **out of scope** for the current milestone.

## Done (this milestone)

- [x] pnpm monorepo scaffold (`apps/mobile`, `tools/peer`)
- [x] Expo SDK 56 + `expo-dev-client` + `react-native-bare-kit`
- [x] Pear-end chat worklet (Hyperswarm / Hypercore / Corestore) + `bare-pack` script
- [x] WDK wallet via `@tetherto/wdk-react-native-core` (Polygon Amoy, MATIC + Bet Token)
- [x] RN UI: channels list, chat thread, wallet create/import, receive QR, send, history
- [x] Football-themed dark UI (pitch greens, gold accents)
- [x] WSL Node peer script for single-device P2P testing

## Phase 1 — Chat (remaining)

- [ ] One-time native build: `cd apps/mobile && pnpm android` (Gradle + install on USB device)
- [ ] Metro daily loop: `pnpm mobile:start` + `adb reverse tcp:8081 tcp:8081`
- [ ] Rebundle pear-end after worklet edits: `pnpm bundle:pear`
- [ ] Multi-peer smoke test: phone ↔ WSL peer (`pnpm peer -- --topic <hex>`)
- [ ] Verify persistence: restart app, history replays from Corestore
- [ ] Private channel test: share topic key, confirm non-invited peer cannot read
- [ ] Token-gated channel plumbing (manual key pass only — full gating in Phase 3)

## Phase 2 — Wallet (remaining)

- [ ] Rebundle WDK worklet after config edits: `pnpm bundle:wdk`
- [ ] Native rebuild when WDK/bare-kit native deps change
- [ ] Fund Amoy address from faucet; confirm MATIC + Bet Token balances
- [ ] Send Bet Token + MATIC; confirm on [Amoy explorer](https://amoy.polygonscan.com)
- [ ] History: confirm WDK `getTransfers` on Amoy or add PolygonScan fallback
- [ ] Optional: enable biometrics (`requireBiometrics={true}`)
- [ ] Optional: multiple derived accounts (index 1..n UI)

## Phase 3 — Contracts + Azuro (later)

- [ ] Foundry project: `ThetaSingleton.sol`, `TipsterVault.sol`
- [ ] Export ABIs to `packages/contracts-abis/`
- [ ] Deploy on Polygon Amoy; wire deposit / redeem / placeBet / settleBet
- [ ] Vault screens in app; tipster bet UI with `@azuro-org/toolkit`
- [ ] Token-gated private channels (signed challenge + `balanceOf` check)

## Phase 4 — Privacy (owner-driven)

- [ ] Railgun-like mix pool into vaults

## Dev / infra

- [ ] `usbipd-win` attach + `adb devices` on WSL2
- [ ] Document local build troubleshooting (Gradle cache, NDK, Java 21)
- [ ] CI: `pnpm test` + `forge test` entry points (when contracts exist)
- [ ] Fix upstream `@tetherto/wdk-worklet-bundler` publish (missing `dist/` on npm) — currently using manual `scripts/bundle-wdk.mjs`

## Open questions (from SPEC §14)

- [ ] WDK indexer coverage for Amoy transaction history
- [ ] Confirm `@tetherto/wdk-wallet-evm` bundler compatibility (standard module vs erc-4337)
- [ ] Azuro v3.0.13 LP ABI exactness (`withdrawPayout`, bet NFT id) — Phase 3

---

**Quick commands** (all from `apps/mobile`, not repo root)

```bash
nvm use 22
cd apps/mobile
pnpm install
pnpm bundle:pear
pnpm bundle:wdk
pnpm android
pnpm start
adb reverse tcp:8081 tcp:8081
```
