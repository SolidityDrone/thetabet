import { colors } from '@/constants/colors'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  onReceive: () => void
  onSend: () => void
  sendDisabled?: boolean
}

export function WalletActionRow({ onReceive, onSend, sendDisabled }: Props) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.action} onPress={onReceive}>
        <View style={[styles.iconCircle, styles.receiveCircle]}>
          <ArrowDownLeft size={22} color={colors.primary} />
        </View>
        <Text style={styles.label}>Receive</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.action, sendDisabled && styles.actionDisabled]}
        onPress={onSend}
        disabled={sendDisabled}
      >
        <View style={[styles.iconCircle, styles.sendCircle]}>
          <ArrowUpRight size={22} color={sendDisabled ? colors.textTertiary : colors.primary} />
        </View>
        <Text style={[styles.label, sendDisabled && styles.labelDisabled]}>Send</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingVertical: 8,
  },
  action: {
    alignItems: 'center',
    gap: 8,
    minWidth: 88,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  receiveCircle: {
    backgroundColor: colors.tintedBackground,
    borderColor: colors.primary,
  },
  sendCircle: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  labelDisabled: {
    color: colors.textTertiary,
  },
})
