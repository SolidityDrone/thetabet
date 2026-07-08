import process from 'bare-process'
import { readFileSync } from 'bare-fs'
console.log('Type something and press Enter (3 lines max):')
let lines = []
const stdin = process.stdin
stdin.on('data', (chunk) => {
  const text = chunk.toString()
  lines.push(text.trimEnd())
  console.log('Echo:', text.trimEnd())
  if (lines.length >= 3) {
    console.log('Done, got 3 lines')
    process.exit(0)
  }
})
