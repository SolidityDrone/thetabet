import process from 'bare-process'
const stdin = process.stdin
console.log('Reading from stdin...')
let data = ''
stdin.on('data', (chunk) => {
  data += chunk.toString()
})
stdin.on('end', () => {
  console.log('Got:', JSON.stringify(data))
  process.exit(0)
})
