import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const contractsOut = path.join(root, "contracts/out");

const artifacts = [
  ["ThetaSingleton", "ThetaSingleton.sol/ThetaSingleton.json"],
  ["TipsterVault", "TipsterVault.sol/TipsterVault.json"],
];

const abisDir = path.join(__dirname, "../abis");
fs.mkdirSync(abisDir, { recursive: true });

for (const [name, artifactPath] of artifacts) {
  const json = JSON.parse(fs.readFileSync(path.join(contractsOut, artifactPath), "utf8"));
  const out = `export const ${name}Abi = ${JSON.stringify(json.abi, null, 2)} as const;\n`;
  fs.writeFileSync(path.join(abisDir, `${name}.ts`), out);
  console.log(`Wrote abis/${name}.ts`);
}
