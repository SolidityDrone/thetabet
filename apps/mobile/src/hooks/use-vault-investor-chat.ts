import { usePearChat } from '@/context/pear-chat'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import type { IndexedVault } from '@/types/indexed-vault'
import { useCallback, useState } from 'react'
import { Alert } from 'react-native'

export function useVaultInvestorChat() {
  const router = useDebouncedNavigation()
  const {
    ready,
    ensureStarted,
    createVaultChannel,
    joinVaultChannel,
    checkVaultChannelAccessForWallet,
    refreshChannels,
  } = usePearChat()
  const [busy, setBusy] = useState(false)

  const openTipsterVaultChat = useCallback(
    async (vault: Pick<IndexedVault, 'address' | 'tipster' | 'name'>) => {
      setBusy(true)
      try {
        await ensureStarted()
        const channel = await createVaultChannel({
          name: `${vault.name} · Investors`,
          vaultAddress: vault.address,
          tipsterAddress: vault.tipster,
          minShares: '1',
        })
        await refreshChannels()
        router.push(`/channel/${channel.id}`)
      } catch (error) {
        Alert.alert('Chat failed', error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [createVaultChannel, ensureStarted, refreshChannels, router]
  )

  const openInvestorVaultChat = useCallback(
    async (
      vault: Pick<IndexedVault, 'address' | 'tipster' | 'name'>,
      walletAddress: string
    ) => {
      setBusy(true)
      try {
        await ensureStarted()
        const channelName = `${vault.name} · Investors`
        const access = await checkVaultChannelAccessForWallet(
          {
            id: '',
            kind: 'vault',
            name: channelName,
            topicKey: '',
            ownerPubkey: '',
            isPrivate: true,
            createdAt: Date.now(),
            vaultAddress: vault.address,
            tipsterAddress: vault.tipster,
            minShares: '1',
          },
          walletAddress
        )

        if (!access.allowed) {
          Alert.alert('Vault shares required', access.reason ?? 'Deposit into this vault first.')
          return
        }

        const result = await joinVaultChannel({
          vaultAddress: vault.address,
          tipsterAddress: vault.tipster,
          name: channelName,
          minShares: '1',
        })
        await refreshChannels()
        router.push(`/channel/${result.channel.id}`)
      } catch (error) {
        Alert.alert('Chat failed', error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    },
    [checkVaultChannelAccessForWallet, ensureStarted, joinVaultChannel, refreshChannels, router]
  )

  return {
    ready,
    busy,
    openTipsterVaultChat,
    openInvestorVaultChat,
  }
}
