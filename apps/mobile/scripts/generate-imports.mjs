import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(root, 'pear-end', 'pack.imports.json')

const imports = {
  '#package': path.join(root, 'package.json'),
  'bare-fs': path.join(root, 'node_modules', 'bare-fs'),
  'bare-path': path.join(root, 'node_modules', 'bare-path'),
  b4a: path.join(root, 'node_modules', 'b4a'),
  corestore: path.join(root, 'node_modules', 'corestore'),
  hyperswarm: path.join(root, 'node_modules', 'hyperswarm'),
  'hypercore-crypto': path.join(root, 'node_modules', 'hypercore-crypto'),
  'bare-rpc': path.join(root, 'node_modules', 'bare-rpc'),
}

fs.writeFileSync(outPath, JSON.stringify(imports, null, 2))
console.log(`Wrote ${outPath}`)
