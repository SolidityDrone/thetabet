#!/usr/bin/env node
/**
 * Free Metro's default port before starting Expo.
 * Stale node/expo processes from prior sessions are the usual cause of 8082 fallback.
 */
import { execSync } from 'node:child_process';

const port = String(process.env.METRO_PORT ?? process.env.PORT ?? 8081);

function listPidsOnPort(p) {
  try {
    return execSync(`lsof -t -iTCP:${p} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function processName(pid) {
  try {
    return execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const pids = listPidsOnPort(port);
if (pids.length === 0) {
  console.log(`Port ${port} is free.`);
  process.exit(0);
}

for (const pid of pids) {
  const args = processName(pid);
  const isMetro =
    /node|expo|metro|react-native/i.test(args) ||
    /@expo\/cli|expo-cli|metro/.test(args);

  if (!isMetro) {
    console.warn(`Port ${port} is used by pid ${pid} (${args}); not killing.`);
    continue;
  }

  try {
    execSync(`kill ${pid}`);
    console.log(`Stopped stale Metro on port ${port} (pid ${pid}).`);
  } catch (error) {
    console.warn(`Could not stop pid ${pid}: ${error.message}`);
  }
}
