# ThetaBet contracts

Singleton + per-tipster ERC-4626 vaults for Azuro betting on **Polygon mainnet**.

## Azuro v3 (Polygon)

Configured in `src/config/PolygonConfig.sol`:

| Contract | Address |
|----------|---------|
| USDT (bet token) | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| Azuro LP | `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8` |
| Client Core | `0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7` |
| Relayer | `0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d` |

Environment: `PolygonUSDT` · chain id **137**

**Access control:** mainnet deploy seeds whitelist with `0xe257cf8ECa1aF94117bEe3809F705bC6e51CbD5c`. Only the deployer (`0xDD7D64BF…`) may call `whitelistAddress` / `removeWhitelistAddress`.

## Deploy

```bash
# Polygon mainnet (requires ~5 POL on deployer keystore)
pnpm contracts:deploy

# Sync app + ponder constants
pnpm contracts:sync
```

## Tests

```bash
# Fork integration against live Azuro on Polygon
POLYGON_RPC_URL=https://polygon-rpc.com forge test --match-contract AzuroIntegrationTest -vv

# Local fork
./script/start-anvil-fork.sh
./script/deploy-anvil.sh
```

## Anvil

Anvil forks **Polygon mainnet** (chain id 137). Use `PONDER_NETWORK=anvil pnpm ponder:dev` after deploy.
