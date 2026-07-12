#!/usr/bin/env node
/**
 * Large APK install (~400+ MB) via small chunked uploads.
 *
 * Full `adb push` of 400MB+ often stalls on USB (especially Xiaomi + Windows).
 * This sends 8 MB chunks — if one fails, only that chunk retries.
 *
 * WSL: copies APK to C:\Users\Public\ first, uses Windows adb.exe.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const packageName = 'io.thetabet.app'
const remoteApk = '/data/local/tmp/thetabet-debug.apk'
const windowsApk = 'C:\\Users\\Public\\thetabet-debug.apk'
const wslWindowsApk = '/mnt/c/Users/Public/thetabet-debug.apk'
const windowsChunkDir = 'C:\\Users\\Public\\thetabet-chunks'
const wslWindowsChunkDir = '/mnt/c/Users/Public/thetabet-chunks'
const CHUNK_BYTES = 8 * 1024 * 1024

const apk =
  process.argv[2] ??
  path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

const isWsl =
  os.release().toLowerCase().includes('microsoft') || Boolean(process.env.WSL_DISTRO_NAME)

function adbExecutable() {
  return isWsl ? 'adb.exe' : 'adb'
}

function runAdb(args, inherit = true) {
  const executable = adbExecutable()
  console.log(`\n> ${executable} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`)
  const result = spawnSync(executable, args, {
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: inherit ? undefined : 'utf8',
  })
  if (result.status !== 0) {
    const detail = inherit ? '' : `\n${result.stdout || ''}${result.stderr || ''}`
    throw new Error(`${executable} failed (${result.status})${detail}`)
  }
  return inherit ? '' : `${result.stdout || ''}${result.stderr || ''}`
}

function adb(args) {
  runAdb(args, true)
}

function adbOut(args) {
  return runAdb(args, false).trim()
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function preflightAdb() {
  console.log('Restarting adb…')
  try {
    runAdb(['kill-server'], true)
  } catch {
    // ignore
  }
  adb(['start-server'])
  adb(['get-state'])
  adb(['devices'])
}

function pushWithRetry(source, dest, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      if (i > 1) console.log(`  push retry ${i}/${attempts}`)
      adb(['push', source, dest])
      return
    } catch (err) {
      adb(['shell', 'rm', '-f', dest]).catch?.(() => {})
      try {
        adb(['shell', 'rm', '-f', dest])
      } catch {
        // ignore
      }
      if (i === attempts) throw err
      sleep(2000)
    }
  }
}

function installChunked(localApk) {
  const size = fs.statSync(localApk).size
  const createOut = adbOut(['shell', 'pm', 'install-create', '-r', '-d', '-S', String(size)])
  const session = createOut.match(/\[(\d+)\]/)?.[1]
  if (!session) throw new Error(`install-create failed: ${createOut}`)

  const totalChunks = Math.ceil(size / CHUNK_BYTES)
  console.log(`Chunked install session ${session} — ${totalChunks} x 8 MB chunks`)
  console.log('(Much more reliable than one 400+ MB push on USB)\n')

  const chunkDir = isWsl ? wslWindowsChunkDir : path.join(os.tmpdir(), 'thetabet-chunks')
  fs.mkdirSync(chunkDir, { recursive: true })

  const fd = fs.openSync(localApk, 'r')
  try {
    let offset = 0
    let index = 0
    while (offset < size) {
      const len = Math.min(CHUNK_BYTES, size - offset)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, offset)

      const chunkName = `chunk-${index}`
      const chunkLocal = path.join(chunkDir, chunkName)
      fs.writeFileSync(chunkLocal, buf)

      const pushSource = isWsl ? `${windowsChunkDir}\\${chunkName}` : chunkLocal
      const chunkRemote = `/data/local/tmp/thetabet-${chunkName}`
      const pct = Math.round(((offset + len) / size) * 100)

      console.log(`Chunk ${index + 1}/${totalChunks} (${pct}% of APK)`)
      pushWithRetry(pushSource, chunkRemote)
      adbOut(['shell', 'pm', 'install-write', '-S', String(len), session, String(index), chunkRemote])
      adb(['shell', 'rm', '-f', chunkRemote])

      offset += len
      index += 1
    }

    const commit = adbOut(['shell', 'pm', 'install-commit', session])
    console.log(commit)
    if (!/success/i.test(commit)) {
      throw new Error(`install-commit failed: ${commit}`)
    }
  } finally {
    fs.closeSync(fd)
    fs.rmSync(chunkDir, { recursive: true, force: true })
  }
}

if (!fs.existsSync(apk)) {
  console.error(`APK not found:\n  ${apk}`)
  console.error('\nBuild first: cd apps/mobile/android && ./gradlew :app:assembleDebug')
  process.exit(1)
}

const sizeMb = (fs.statSync(apk).size / (1024 * 1024)).toFixed(0)
console.log(`Installing ${path.basename(apk)} (${sizeMb} MB) — chunked mode`)

try {
  preflightAdb()
} catch {
  console.error('No adb device.')
  console.error('- USB: enable debugging, File transfer mode, one adb only (Windows OR WSL)')
  console.error('- Hotspot only: PC on phone hotspot → Wireless debugging → adb connect')
  process.exit(1)
}

let localApk = apk
if (isWsl) {
  console.log(`Copying APK to ${windowsApk} (fast Windows read path)…`)
  fs.copyFileSync(apk, wslWindowsApk)
  localApk = wslWindowsApk
}

installChunked(localApk)

console.log(`\nDone. Installed ${packageName}`)
console.log('Start Metro: npm run start')
console.log('Open app:    npm run open:android')
