import process from 'bare-process'
const stdin = process.stdin
console.log('isTTY:', stdin.isTTY)
console.log('keys:', Object.keys(stdin).join(', '))
console.log('setRawMode:', typeof stdin.setRawMode)
console.log('resume:', typeof stdin.resume)
console.log('constructor:', stdin.constructor.name)
// Check for events
const proto = Object.getPrototypeOf(stdin)
const protoKeys = Object.getOwnPropertyNames(proto)
console.log('proto methods:', protoKeys.join(', '))
