/**
 * QVAC SDK Worker Entry (custom - deferred plugin loading)
 * Plugins are registered only when __register_plugin RPC is received,
 * avoiding native addon dlopen at worklet startup.
 */

import { initializeWorkerCore, ensureRPCSetup } from "@qvac/sdk/worker-core";
import { registerPlugin } from "@qvac/sdk/plugins";
import { getServerLogger } from "@qvac/sdk/logging";

const { hasRPCConfig } = initializeWorkerCore();

const logger = getServerLogger();
logger.info("QVAC Worker (deferred plugin load)");

if (hasRPCConfig) {
  ensureRPCSetup();
}

// Deferred LLM plugin registration - called via IPC when inference is needed.
// Uses dynamic require instead of static import to avoid loading the native
// addon (@qvac/llm-llamacpp) at worklet startup.
globalThis.__qvacRegisterLLM = async () => {
  try {
    const { llmPlugin } = await import("@qvac/sdk/llamacpp-completion/plugin");
    registerPlugin(llmPlugin);
    logger.info("LLM plugin registered dynamically");
    return { success: true };
  } catch (err) {
    logger.error("Failed to register LLM plugin:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

logger.info("Deferred plugin handler ready - LLM addon not loaded yet");
