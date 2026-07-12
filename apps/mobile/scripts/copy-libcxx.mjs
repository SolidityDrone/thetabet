#!/usr/bin/env node
/**
 * QVAC llm-llamacpp is built against NDK r29 libc++. The APK must ship that
 * libc++_shared.so or dlopen fails (Bare reports ADDON_NOT_FOUND).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

const NDK_CANDIDATES = [
  process.env.ANDROID_NDK_HOME,
  process.env.NDK_HOME,
  path.join(process.env.HOME ?? '', 'Android', 'Sdk', 'ndk', '29.0.14206865'),
  '/usr/lib/android-sdk/ndk/29.0.14206865',
].filter(Boolean)

function findLibcxx() {
  for (const ndkRoot of NDK_CANDIDATES) {
    const candidate = path.join(
      ndkRoot,
      'toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so',
    )
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

const src = findLibcxx()
if (!src) {
  console.error(
    '[copy-libcxx] NDK r29 libc++_shared.so not found. Install Android NDK 29.0.14206865.',
  )
  process.exit(1)
}

const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a')
const dest = path.join(destDir, 'libc++_shared.so')
fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log('[copy-libcxx] Installed NDK r29 libc++_shared.so for QVAC inference')
