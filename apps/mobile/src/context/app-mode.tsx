import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  APP_MODE_STORAGE_KEY,
  DEV_WALLET_ADDRESS,
  type AppWalletMode,
} from '@/config/app-mode'

type AppModeContextValue = {
  walletMode: AppWalletMode | null
  devWalletAddress: string
  isReady: boolean
  skipWallet: () => Promise<void>
  useRealWallet: () => Promise<void>
  hasSkippedWallet: boolean
}

const AppModeContext = createContext<AppModeContextValue | null>(null)

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [walletMode, setWalletMode] = useState<AppWalletMode | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(APP_MODE_STORAGE_KEY)
      .then((value) => {
        if (value === 'skipped' || value === 'wdk') {
          setWalletMode(value)
        }
      })
      .finally(() => setIsReady(true))
  }, [])

  const skipWallet = useCallback(async () => {
    await AsyncStorage.setItem(APP_MODE_STORAGE_KEY, 'skipped')
    setWalletMode('skipped')
  }, [])

  const useRealWallet = useCallback(async () => {
    await AsyncStorage.setItem(APP_MODE_STORAGE_KEY, 'wdk')
    setWalletMode('wdk')
  }, [])

  const value = useMemo(
    () => ({
      walletMode,
      devWalletAddress: DEV_WALLET_ADDRESS,
      isReady,
      skipWallet,
      useRealWallet,
      hasSkippedWallet: walletMode === 'skipped',
    }),
    [walletMode, isReady, skipWallet, useRealWallet]
  )

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}

export function useAppMode() {
  const context = useContext(AppModeContext)
  if (!context) {
    throw new Error('useAppMode must be used within AppModeProvider')
  }
  return context
}
