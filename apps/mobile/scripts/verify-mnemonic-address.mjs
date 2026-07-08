#!/usr/bin/env node
/**
 * Check which Polygon address a BIP39 seed derives to (standard path m/44'/60'/0'/0/0).
 * Usage: node scripts/verify-mnemonic-address.mjs "word1 word2 ... word12"
 */
import { mnemonicToAccount } from 'viem/accounts'

const mnemonic = process.argv.slice(2).join(' ').trim()
if (!mnemonic) {
  console.error('Usage: node scripts/verify-mnemonic-address.mjs "your twelve or twenty four words"')
  process.exit(1)
}

const account = mnemonicToAccount(mnemonic, { path: "m/44'/60'/0'/0/0" })
console.log('Derived Polygon EOA (BIP44 path m/44\'/60\'/0\'/0/0):')
console.log(account.address)
console.log('')
console.log('Compare with your expected address on https://polygonscan.com')
