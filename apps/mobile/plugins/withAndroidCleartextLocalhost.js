const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins')

/** Allow HTTP to 127.0.0.1 / 10.0.2.2 for Ponder via adb reverse or emulator. */
const withAndroidCleartextLocalhost = (config) => {
  return withAndroidManifest(config, (modConfig) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults)
    app.$['android:usesCleartextTraffic'] = 'true'
    return modConfig
  })
}

module.exports = withAndroidCleartextLocalhost
