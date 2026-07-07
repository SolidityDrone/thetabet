import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";

import { ThetaSingletonAbi } from "./abis/ThetaSingleton";
import { TipsterVaultAbi } from "./abis/TipsterVault";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Deployment = {
  chainId: number;
  startBlock: number;
  thetaSingleton: `0x${string}`;
  betToken: `0x${string}`;
  azuroLP: `0x${string}`;
  azuroCore: `0x${string}`;
  rpcUrl: string;
  network?: string;
};

const ponderNetwork = process.env.PONDER_NETWORK ?? "polygon";
const deploymentFile =
  ponderNetwork === "anvil"
    ? join(__dirname, "deployments/anvil.json")
    : join(__dirname, "deployments/polygon.json");

const fallbackDeployment: Deployment = {
  chainId: 137,
  startBlock: 0,
  thetaSingleton: "0x0000000000000000000000000000000000000000",
  betToken: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  azuroLP: "0x0FA7FB5407eA971694652E6E16C12A52625DE1b8",
  azuroCore: "0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7",
  rpcUrl: "https://polygon-rpc.com",
};

const deployment: Deployment = existsSync(deploymentFile)
  ? (JSON.parse(readFileSync(deploymentFile, "utf8")) as Deployment)
  : fallbackDeployment;

const chainKey = ponderNetwork === "anvil" ? "polygonFork" : "polygon";

const chains =
  ponderNetwork === "anvil"
    ? {
        polygonFork: {
          id: deployment.chainId,
          rpc: process.env.PONDER_RPC_URL_2 ?? deployment.rpcUrl,
        },
      }
    : {
        polygon: {
          id: deployment.chainId,
          rpc: process.env.PONDER_RPC_URL_1 ?? deployment.rpcUrl,
          ethGetLogsBlockRange: 50,
          pollingInterval: 2_000,
        },
      };

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains,
  contracts: {
    ThetaSingleton: {
      abi: ThetaSingletonAbi,
      chain: chainKey,
      address: deployment.thetaSingleton,
      startBlock: deployment.startBlock,
    },
    TipsterVault: {
      abi: TipsterVaultAbi,
      chain: chainKey,
      address: factory({
        address: deployment.thetaSingleton,
        event: parseAbiItem(
          "event VaultCreated(uint256 indexed vaultId, address indexed vault, address indexed tipster, string name, string symbol)"
        ),
        parameter: "vault",
      }),
      startBlock: deployment.startBlock,
    },
  },
});
