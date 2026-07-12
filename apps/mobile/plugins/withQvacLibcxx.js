const { withDangerousMod, withMainApplication } = require('@expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

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

/** @param {import('@expo/config-plugins').ExpoConfig} config */
const withQvacLibcxx = (config) => {
  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents
    if (!contents.includes('System.loadLibrary("c++_shared")')) {
      contents = contents.replace(
        /super\.onCreate\(\)/,
        `try {\n      System.loadLibrary("c++_shared")\n    } catch (e: UnsatisfiedLinkError) {\n      android.util.Log.w("MainApplication", "c++_shared preload skipped", e)\n    }\n    super.onCreate()`,
      )
      modConfig.modResults.contents = contents
    }
    return modConfig
  })

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const src = findLibcxx()
      if (!src) {
        console.warn('[withQvacLibcxx] NDK r29 libc++ not found — skip jniLibs copy')
        return modConfig
      }
      const destDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'jniLibs',
        'arm64-v8a',
      )
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'libc++_shared.so'))
      console.log('[withQvacLibcxx] Copied NDK r29 libc++_shared.so into jniLibs')
      return modConfig
    },
  ])
}

module.exports = withQvacLibcxx
