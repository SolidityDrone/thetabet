import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import { MessageCircle, Radio, User, Wallet } from 'lucide-react-native'
import { Tabs } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TabsLayout() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = useTabBarHeight()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabBar.activeColor,
        tabBarInactiveTintColor: theme.tabBar.inactiveColor,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: bottomInset,
          borderTopWidth: 0,
          backgroundColor: theme.tabBar.backgroundColor,
          elevation: 12,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBg}>
            <View style={styles.tabBarAccent} />
          </View>
        ),
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="bet"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size, focused }) => (
            <Radio color={color} size={size - 1} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Channels',
          tabBarIcon: ({ color, size, focused }) => (
            <MessageCircle color={color} size={size - 1} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <User color={color} size={size - 1} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tabs.Screen
        name="tipster"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size, focused }) => (
            <Wallet color={color} size={size - 1} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.tabBar.backgroundColor,
    borderTopWidth: 1,
    borderTopColor: theme.tabBar.borderTopColor,
  },
  tabBarAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.borderNeon,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: Platform.OS === 'android' ? 0 : 2,
  },
})
