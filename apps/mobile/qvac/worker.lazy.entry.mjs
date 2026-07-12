/**
 * QVAC worker with lazy plugin loading (auto-generated).
 * Native inference addons load on first inference RPC, not at worker boot.
 */
import RPC from "bare-rpc";
import { initializeWorkerCore } from "file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/worker-core.js";
import { registerPlugin } from "file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/plugins/index.js";
import { handleRequest } from "file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/rpc/handle-request.js";
import { getServerLogger, SDK_ALL_LOG_ID } from "file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/logging/index.js";
import { stopLogBufferingWithTimeout } from "file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/bare/registry/logging-stream-registry.js";

const PLUGIN_LOAD_TIMEOUT_MS = 90_000;

const PLUGIN_SAFE_TYPES = new Set([
  "downloadAsset",
  "getModelInfo",
  "deleteCache",
  "heartbeat",
  "cancel",
  "getLoadedModelInfo",
  "modelRegistryList",
  "modelRegistrySearch",
  "modelRegistryGetModel",
  "state",
  "suspend",
  "resume",
  "loggingStream",
  "__init_config",
  "__shutdown__",
]);

let pluginsReady = false;
let pluginsPromise = null;

async function ensureInferencePlugins() {
  if (pluginsReady) return;
  if (!pluginsPromise) {
    const load = (async () => {
    const { llmPlugin } = await import("file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/bare/plugins/llamacpp-completion/plugin.js");
    registerPlugin(llmPlugin);
    const { nmtPlugin } = await import("file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/bare/plugins/nmtcpp-translation/plugin.js");
    registerPlugin(nmtPlugin);
    const { whisperPlugin } = await import("file:///home/drone/projects/ThethaBet/apps/mobile/node_modules/@qvac/sdk/dist/server/bare/plugins/whispercpp-transcription/plugin.js");
    registerPlugin(whisperPlugin);
      pluginsReady = true;
      getServerLogger().info("Inference plugins registered (lazy load)");
    })();
    pluginsPromise = Promise.race([
      load,
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Inference plugin load timed out after 90s — rebundle QVAC worker")),
          PLUGIN_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  }
  await pluginsPromise;
}

async function wrappedHandleRequest(req) {
  const rawData = req.data?.toString();
  if (rawData) {
    try {
      const json = JSON.parse(rawData);
      if (!PLUGIN_SAFE_TYPES.has(json.type)) {
        await ensureInferencePlugins();
      }
    } catch {
      await ensureInferencePlugins();
    }
  } else {
    await ensureInferencePlugins();
  }
  return handleRequest(req);
}

initializeWorkerCore();
const logger = getServerLogger();
logger.info("QVAC Worker (lazy plugins — download-safe boot)");

const { IPC } = globalThis.BareKit;
new RPC(IPC, wrappedHandleRequest);
logger.info("Bare worker started and listening for RPC requests (lazy)");
stopLogBufferingWithTimeout(SDK_ALL_LOG_ID);
