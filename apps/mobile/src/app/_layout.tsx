import '@/polyfills'
import { patchBareWorkletApi } from '@/services/patch-bare-api'
import { patchWdkService } from '@/services/patch-wdk-service'
import { DarkTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { WalletProvider, WDKService } from '@tetherto/wdk-react-native-provider';
import { ThemeProvider } from '@tetherto/wdk-uikit-react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import getChainsConfig from '@/config/get-chains-config';
import { AppModeProvider } from '@/context/app-mode';
import { PearChatProvider } from '@/context/pear-chat';
import { ConfirmSheetProvider } from '@/context/confirm-sheet';
import { Toaster } from 'sonner-native';
import { colors } from '@/constants/colors';

patchBareWorkletApi();
patchWdkService();

SplashScreen.preventAutoHideAsync();

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
  },
};

export default function RootLayout() {
  useEffect(() => {
    const initApp = async () => {
      try {
        await WDKService.initialize();
      } catch (error) {
        console.error('Failed to initialize services in app layout:', error);
      } finally {
        SplashScreen.hideAsync();
      }
    };

    initApp();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        defaultMode="dark"
        brandConfig={{
          primaryColor: colors.primary,
        }}
      >
        <AppModeProvider>
          <WalletProvider
            config={{
              indexer: {
                apiKey: process.env.EXPO_PUBLIC_WDK_INDEXER_API_KEY!,
                url: process.env.EXPO_PUBLIC_WDK_INDEXER_BASE_URL!,
              },
              chains: getChainsConfig(),
              enableCaching: true,
            }}
          >
            <PearChatProvider>
              <ConfirmSheetProvider>
              <NavigationThemeProvider value={CustomDarkTheme}>
                <View style={{ flex: 1, backgroundColor: colors.background }}>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  />
                  <StatusBar style="light" />
                </View>
              </NavigationThemeProvider>
              </ConfirmSheetProvider>
            </PearChatProvider>
          </WalletProvider>
        </AppModeProvider>
        <Toaster
          offset={90}
          toastOptions={{
            style: {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.borderNeon,
            },
            titleStyle: { color: colors.text, fontWeight: '700' },
            descriptionStyle: { color: colors.textSecondary },
          }}
        />
      </ThemeProvider>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
