import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import type { QvacOutputLanguage } from '@/services/qvac/qvac-settings'
import { QVAC_OUTPUT_LANGUAGE_OPTIONS } from '@/services/qvac/qvac-settings'
import { Check } from 'lucide-react-native'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  visible: boolean
  selected: QvacOutputLanguage | null
  installByLang?: Partial<Record<QvacOutputLanguage, boolean>>
  onSelect: (code: QvacOutputLanguage) => void
  onClose: () => void
}

export function LanguagePickerModal({
  visible,
  selected,
  installByLang,
  onSelect,
  onClose,
}: Props) {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Output language" cardStyle={styles.card}>
      <Text style={styles.hint}>
        Pick your language. For non-English, download the matching translation model in Settings
        first — analysis is written in English, then translated on-device after inference.
      </Text>
      <FlatList
        data={QVAC_OUTPUT_LANGUAGE_OPTIONS}
        keyExtractor={(item) => item.code}
        style={styles.list}
        renderItem={({ item }) => {
          const isSelected = selected === item.code
          const needsDownload = item.code !== 'en' && installByLang?.[item.code] === false
          const isReady = item.code === 'en' || installByLang?.[item.code] === true
          return (
            <TouchableOpacity
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => {
                onSelect(item.code)
                onClose()
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.flag}>{item.flag}</Text>
                <View style={styles.rowContent}>
                  <Text style={[styles.label, isSelected && styles.labelSelected]}>{item.label}</Text>
                  <Text style={styles.nativeLabel}>
                    {item.nativeLabel}
                    {needsDownload ? ' · download model required' : ''}
                    {isReady && item.code !== 'en' ? ' · model ready' : ''}
                  </Text>
                </View>
              </View>
              {isSelected ? <Check size={20} color={colors.primary} /> : null}
            </TouchableOpacity>
          )
        }}
      />
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  card: {
    minHeight: 300,
    maxHeight: 500,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  rowSelected: {},
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flag: {
    fontSize: 22,
  },
  rowContent: {
    flexDirection: 'column',
    gap: 2,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.primary,
  },
  nativeLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
})
