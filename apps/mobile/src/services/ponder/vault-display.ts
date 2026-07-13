export function formatVaultLabel(name: string, isMocked?: boolean) {
  return isMocked ? `${name} *` : name
}
