import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import { Check, ChevronDown } from 'lucide-react-native'
import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export type TipsterPickerOption = {
  key: string
  label: string
  subtitle?: string
  meta?: string
}

type FieldProps = {
  label: string
  value: string
  placeholder?: string
  disabled?: boolean
  onPress: () => void
}

export function TipsterSelectField({
  label,
  value,
  placeholder = 'Select…',
  disabled,
  onPress,
}: FieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text
          style={[styles.fieldValue, !value && styles.fieldPlaceholder]}
          numberOfLines={2}
        >
          {value || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

type SheetProps = {
  visible: boolean
  title: string
  options: TipsterPickerOption[]
  selectedKey?: string | null
  loading?: boolean
  searchable?: boolean
  emptyLabel?: string
  onSelect: (option: TipsterPickerOption) => void
  onClose: () => void
}

export function TipsterPickerSheet({
  visible,
  title,
  options,
  selectedKey,
  loading,
  searchable = false,
  emptyLabel = 'Nothing available yet',
  onSelect,
  onClose,
}: SheetProps) {
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    if (!visible) setQuery('')
  }, [visible])

  const filtered = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(trimmed) ||
        option.subtitle?.toLowerCase().includes(trimmed) ||
        option.meta?.toLowerCase().includes(trimmed)
    )
  }, [options, query])

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={title} cardStyle={styles.sheetCard}>
      {searchable ? (
        <TextInput
          style={styles.search}
          placeholder="Search…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
        />
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading matches…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          }
          renderItem={({ item }) => {
            const selected = selectedKey === item.key
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => {
                  onSelect(item)
                  onClose()
                }}
                activeOpacity={0.75}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={2}>
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                  {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
                </View>
                {selected ? <Check size={18} color={colors.primary} /> : null}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  field: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  fieldDisabled: {
    opacity: 0.5,
  },
  fieldValue: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldPlaceholder: {
    color: colors.textTertiary,
    fontWeight: '500',
  },
  sheetCard: {
    minHeight: 280,
    maxHeight: 520,
  },
  search: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  rowSelected: {
    backgroundColor: colors.tintedBackground,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowLabelSelected: {
    color: colors.primary,
  },
  rowSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  rowMeta: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
})
