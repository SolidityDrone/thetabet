const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { configureMetroForWDK } = require('@tetherto/wdk-react-native-provider/metro-polyfills');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  // Ensure module paths include root node_modules
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  alias: {
    '@': path.resolve(__dirname, 'src'),
  },
};

// Apply WDK polyfills configuration first (handles Node.js core module polyfills)
const wdkConfig = configureMetroForWDK(config);

// Now wrap the WDK's resolveRequest with our custom alias logic
const wdkResolveRequest = wdkConfig.resolver.resolveRequest;

wdkConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  // Handle @/ alias
  if (moduleName.startsWith('@/')) {
    const resolvedPath = moduleName.replace('@/', path.resolve(__dirname, 'src') + '/');
    try {
      return context.resolveRequest(context, resolvedPath, platform);
    } catch (e) {
      // If the resolved path fails, fall through to WDK resolver
    }
  }

  // Packages whose package.json "exports" point at .mjs — force CJS entry.
  const forceCjsPackages = {
    'react-native-is-edge-to-edge': 'node_modules/react-native-is-edge-to-edge/dist/index.js',
    'use-latest-callback': 'node_modules/use-latest-callback/lib/src/index.js',
  };

  if (forceCjsPackages[moduleName]) {
    return {
      filePath: path.resolve(__dirname, forceCjsPackages[moduleName]),
      type: 'sourceFile',
    };
  }

  // Delegate to WDK's resolveRequest
  return wdkResolveRequest(context, moduleName, platform);
};

module.exports = wdkConfig;
