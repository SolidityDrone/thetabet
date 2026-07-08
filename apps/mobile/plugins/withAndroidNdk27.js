const { withProjectBuildGradle } = require('@expo/config-plugins')

// QVAC pins NDK 29, but on WSL/debian SDK installs often hang mid-download.
// Use an NDK version that is already fully installed locally.
const NDK_VERSION = '27.1.12297006'

/** @param {import('@expo/config-plugins').ExpoConfig} config */
const withAndroidNdk27 = (config) => {
  return withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language === 'groovy') {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /ndkVersion\s*=\s*"[^"]+"/g,
        `ndkVersion = "${NDK_VERSION}"`
      )
    }
    return modConfig
  })
}

module.exports = withAndroidNdk27
