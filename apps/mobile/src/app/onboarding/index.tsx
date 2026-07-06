import { View, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnBoardingWelcome } from '@/components/onboarding/onboarding-welcome';
import * as SplashScreen from 'expo-splash-screen';
import { useAppMode } from '@/context/app-mode';
import { colors } from '@/constants/colors';

export default function OnBoardingScreen() {
  const router = useDebouncedNavigation();
  const insets = useSafeAreaInsets();
  const { skipWallet } = useAppMode();

  const handleCreateWallet = () => {
    router.push('/wallet-setup/name-wallet');
  };

  const handleImportWallet = () => {
    router.push('/wallet-setup/import-wallet');
  };

  const handleSkipWallet = async () => {
    await skipWallet();
    router.replace('/(tabs)');
  };

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <OnBoardingWelcome
        title="Welcome!"
        subtitle="Set up your wallet and start exploring the crypto world."
        actionButtons={[
          {
            id: 1,
            title: 'Create Wallet',
            iconName: 'wallet',
            variant: 'filled',
            onPress: handleCreateWallet,
          },
          {
            id: 2,
            title: 'Import Wallet',
            iconName: 'download',
            variant: 'tinted',
            onPress: handleImportWallet,
          },
          {
            id: 3,
            title: 'Skip wallet (dev · 0xd3ad)',
            iconName: 'skip',
            variant: 'tinted',
            onPress: handleSkipWallet,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
