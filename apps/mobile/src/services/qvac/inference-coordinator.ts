export type InferenceOwner = 'local' | `peer:${string}`

let activeOwner: InferenceOwner | null = null
const listeners = new Set<(owner: InferenceOwner | null) => void>()

function emit() {
  listeners.forEach((listener) => listener(activeOwner))
}

export function acquireInference(owner: InferenceOwner): boolean {
  if (activeOwner && activeOwner !== owner) return false
  activeOwner = owner
  emit()
  return true
}

export function releaseInference(owner: InferenceOwner) {
  if (activeOwner !== owner) return
  activeOwner = null
  emit()
}

export function getInferenceOwner() {
  return activeOwner
}

export function subscribeInferenceOwner(listener: (owner: InferenceOwner | null) => void) {
  listeners.add(listener)
  listener(activeOwner)
  return () => {
    listeners.delete(listener)
  }
}
