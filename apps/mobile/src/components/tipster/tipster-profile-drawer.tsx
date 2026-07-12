import { TipsterThesisPanel } from '@/components/tipster/tipster-thesis-panel'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatTipsterHandle, useProfileVaults } from '@/hooks/use-profile-vaults'
import {
  buildNotesInventory,
  countReadyInventory,
  type NoteInventoryItem,
  type NoteInventoryStatus,
} from '@/services/tipster-notes/inventory'
import { loadTipsterNotes } from '@/services/tipster-notes/storage'
import { mockTipsterStreamStats } from '@/services/tipster-notes/stream-stats'
import { X, Zap, MessageCircle, Users, Clock, Database } from 'lucide-react-native'
import React from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PANEL_WIDTH = Math.min(Dimensions.get('window').width * 0.9, 400)

type Props = {
  visible: boolean
  ownerId: string | null | undefined
  onClose: () => void
}

function statusMeta(status: NoteInventoryStatus) {
  if (status === 'ready') return { label: 'Ready', color: colors.success, bg: colors.neonMuted }
  if (status === 'draft') return { label: 'Draft', color: colors.warning, bg: colors.warningBackground }
  return { label: 'Empty', color: colors.textTertiary, bg: colors.cardDark }
}

function InventoryRow({ item }: { item: NoteInventoryItem }) {
  const meta = statusMeta(item.status)
  const kindLabel =
    item.kind === 'thesis'
      ? 'Global'
      : item.kind === 'league'
        ? 'League'
        : item.kind === 'team'
          ? 'Club'
          : 'Match'

  return (
    <View style={styles.inventoryRow}>
      <View style={styles.inventoryLeft}>
        <Text style={styles.inventoryKind}>{kindLabel}</Text>
        <Text style={styles.inventoryLabel} numberOfLines={1}>
          {item.label}
        </Text>
        {item.hintCount > 0 ? (
          <Text style={styles.inventoryHints}>{item.hintCount} locked hints</Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
        <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  )
}

export function TipsterProfileDrawer({ visible, ownerId, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const slideX = React.useRef(new Animated.Value(PANEL_WIDTH)).current
  const { tipsterHandle, tipsterVault, isTipster } = useProfileVaults(ownerId ?? '')
  const [inventory, setInventory] = React.useState<NoteInventoryItem[]>([])
  const [readyCount, setReadyCount] = React.useState(0)

  const stats = React.useMemo(
    () => (ownerId ? mockTipsterStreamStats(ownerId) : null),
    [ownerId]
  )

  const displayHandle = ownerId
    ? formatTipsterHandle(tipsterHandle ?? tipsterVault?.tipsterHandle, ownerId)
    : 'Guest'

  React.useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : PANEL_WIDTH,
      duration: 260,
      useNativeDriver: true,
    }).start()
  }, [visible, slideX])

  const reloadInventory = React.useCallback(() => {
    if (!ownerId) return
    void loadTipsterNotes(ownerId).then((store) => {
      const items = buildNotesInventory(store)
      setInventory(items)
      setReadyCount(countReadyInventory(items))
    })
  }, [ownerId])

  React.useEffect(() => {
    if (!visible || !ownerId) return
    reloadInventory()
  }, [visible, ownerId, reloadInventory])

  if (!ownerId) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              width: PANEL_WIDTH,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
              transform: [{ translateX: slideX }],
            },
          ]}
        >
          <View style={styles.panelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelTitle}>Tipster profile</Text>
              <Text style={styles.panelSubtitle}>{displayHandle}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {stats ? (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Zap size={16} color={colors.gold} />
                  <Text style={styles.statValue}>{(stats.tokensStreamed / 1000).toFixed(1)}k</Text>
                  <Text style={styles.statLabel}>Tokens streamed</Text>
                </View>
                <View style={styles.statCard}>
                  <MessageCircle size={16} color={colors.primary} />
                  <Text style={styles.statValue}>{stats.queriesReceived}</Text>
                  <Text style={styles.statLabel}>Queries received</Text>
                </View>
                <View style={styles.statCard}>
                  <Users size={16} color={colors.primary} />
                  <Text style={styles.statValue}>{stats.peersHelped}</Text>
                  <Text style={styles.statLabel}>Peers helped</Text>
                </View>
                <View style={styles.statCard}>
                  <Clock size={16} color={colors.textSecondary} />
                  <Text style={styles.statValue}>{stats.avgReplySec}s</Text>
                  <Text style={styles.statLabel}>Avg reply</Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.mockHint}>Sample streaming stats — real metering comes with P2P /ask relay.</Text>

            <View style={styles.inventoryCard}>
              <View style={styles.inventoryHeader}>
                <Database size={16} color={colors.gold} />
                <Text style={styles.inventoryTitle}>Data inventory</Text>
                <Text style={styles.inventoryCount}>
                  {readyCount}/{inventory.length} ready
                </Text>
              </View>
              <Text style={styles.inventoryHint}>
                What you can serve to peers when they /ask — global, leagues, clubs, and matches.
              </Text>
              {inventory.map((item) => (
                <InventoryRow key={item.id} item={item} />
              ))}
            </View>

            {isTipster || tipsterVault ? (
              <View style={styles.notesSection}>
                <Text style={styles.notesSectionTitle}>Edit notes</Text>
                <TipsterThesisPanel ownerId={ownerId} onUpdated={reloadInventory} />
              </View>
            ) : (
              <View style={styles.setupCard}>
                <Text style={styles.setupTitle}>Not a tipster yet</Text>
                <Text style={styles.setupText}>
                  Create a vault on Profile to publish thesis notes and serve inference hints to peers.
                </Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    shadowColor: colors.black,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: -4, height: 0 },
    elevation: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  mockHint: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  inventoryCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  inventoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inventoryTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  inventoryCount: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
  inventoryHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  inventoryLeft: {
    flex: 1,
    gap: 2,
  },
  inventoryKind: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  inventoryLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inventoryHints: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  notesSection: {
    gap: 8,
  },
  notesSectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  setupCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  setupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  setupText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
})
