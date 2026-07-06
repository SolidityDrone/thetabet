import { useWallet } from '@tetherto/wdk-react-native-provider';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAppMode } from '@/context/app-mode';
import { pricingService } from '../services/pricing-service';
import { colors } from '@/constants/colors';

export default function Index() {
  const { wallet, isInitialized, isUnlocked } = useWallet();
  const { walletMode, isReady: isAppModeReady, hasSkippedWallet } = useAppMode();
  const [isPricingReady, setIsPricingReady] = useState(false);

  useEffect(() => {
    pricingService
      .initialize()
      .catch((error) => {
        console.error('Failed to initialize pricing service:', error);
      })
      .finally(() => setIsPricingReady(true));
  }, []);

  if (!isInitialized || !isPricingReady || !isAppModeReady) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (hasSkippedWallet || walletMode === 'skipped') {
    return <Redirect href="/(tabs)" />;
  }

  if (!wallet) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href={isUnlocked ? '/(tabs)' : '/authorize'} />;
}
