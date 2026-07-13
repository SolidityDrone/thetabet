#!/usr/bin/env node
/**
 * adb reverse + dev-client deep link using the same Metro port Expo listens on.
 * Override with METRO_PORT=8082 if Metro already bound elsewhere.
 */
import { execSync } from 'node:child_process';

const port = String(process.env.METRO_PORT ?? process.env.PORT ?? 8081);
const packageName = 'io.thetabet.app';
const metroUrl = encodeURIComponent(`http://127.0.0.1:${port}`);
const deepLink = `exp+thetabet://expo-development-client/?url=${metroUrl}`;

execSync(`adb reverse tcp:${port} tcp:${port}`, { stdio: 'inherit' });
execSync('adb reverse tcp:39391 tcp:39391', { stdio: 'inherit' });
execSync('adb reverse tcp:42069 tcp:42069', { stdio: 'inherit' });
execSync(
  `adb shell am start -a android.intent.action.VIEW -d "${deepLink}" ${packageName}`,
  { stdio: 'inherit' },
);

console.log(`Opened dev client → Metro on localhost:${port}`);
