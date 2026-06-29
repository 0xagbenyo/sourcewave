import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { DocumentPrintButton } from './DocumentPrintButton';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';

const hairline = StyleSheet.hairlineWidth;

type LayoutProps = {
  screenTitle: string;
  printDoctype?: string;
  printDocName?: string;
  /** Header print icon accessibility label (default: Print PDF). */
  printLabel?: string;
  loading?: boolean;
  errorMessage?: string | null;
  onBack: () => void;
  /** Optional header action (e.g. share to supplier chat). Shown beside print when both exist. */
  onShare?: () => void;
  shareAccessibilityLabel?: string;
  children?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

export function erpDocStatusAccent(status: string, docstatus?: number): string {
  const st = String(status || '').toLowerCase();
  const ds = docstatus != null ? Number(docstatus) : null;
  if (ds === 2 || st.includes('cancel') || st.includes('reject')) return Colors.ERROR;
  if (st.includes('approv') || st.includes('accept')) return Colors.SUCCESS;
  if (ds === 0 || st.includes('draft')) return '#C93400';
  if (st.includes('unpaid') || st.includes('overdue') || st.includes('partly')) return Colors.ERROR;
  if (st.includes('paid') || st.includes('complete') || st.includes('submit')) return Colors.SUCCESS;
  if (st.includes('pending') || st.includes('await')) return Colors.WARNING;
  return Colors.WINE;
}

export function erpDocPaymentStatusLabel(doc: Record<string, unknown>): string {
  const ds = Number(doc.docstatus);
  if (ds === 2) return 'Cancelled';
  if (ds === 0) return 'Draft';
  const st = String(doc.status || '').trim();
  if (st) return st;
  return ds === 1 ? 'Submitted' : '—';
}

export function formatErpDocDate(dateString: unknown): string {
  const raw = String(dateString ?? '').trim();
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

export function formatErpDocMoney(amount: unknown, currency = 'GHS'): string {
  const c = String(currency || 'GHS').trim() || 'GHS';
  const n = Number(amount);
  const val = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency: c }).format(val);
  } catch {
    return `${c} ${val.toFixed(2)}`;
  }
}

export function erpDocPrimaryPaymentAmount(doc: Record<string, unknown>, currency = 'GHS'): string {
  const received = doc.received_amount;
  const paid = doc.paid_amount;
  const raw = received != null && Number(received) !== 0 ? received : paid;
  return formatErpDocMoney(raw, currency);
}

/** Shared shell for ERP document preview screens. */
export const ErpDocumentPreviewLayout: React.FC<LayoutProps> = ({
  screenTitle,
  printDoctype,
  printDocName,
  printLabel = 'Print PDF',
  loading,
  errorMessage,
  onBack,
  onShare,
  shareAccessibilityLabel = 'Share',
  children,
  refreshControl,
}) => {
  const printName = String(printDocName || '').trim();
  const printType = String(printDoctype || '').trim();
  const showPrint = !!printName && !!printType;
  const showShare = typeof onShare === 'function';

  const body = loading ? (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Colors.TEXT_SECONDARY} />
    </View>
  ) : errorMessage ? (
    <View style={styles.center}>
      <View style={styles.errorIconWrap}>
        <Ionicons name="document-text-outline" size={28} color={Colors.TEXT_SECONDARY} />
      </View>
      <Text style={styles.errorTitle}>Could not load document</Text>
      <Text style={styles.errorSub}>{errorMessage}</Text>
    </View>
  ) : (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollInner}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
      <View style={{ height: Spacing.XXL }} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backHit} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {screenTitle}
        </Text>
        <View style={styles.topRight}>
          {showShare ? (
            <TouchableOpacity
              onPress={onShare}
              hitSlop={12}
              style={styles.headerIconHit}
              accessibilityRole="button"
              accessibilityLabel={shareAccessibilityLabel}
            >
              <Ionicons name="share-outline" size={22} color={Colors.BLACK} />
            </TouchableOpacity>
          ) : null}
          {showPrint ? (
            <DocumentPrintButton
              doctype={printType}
              docName={printName}
              variant="icon"
              label={printLabel}
            />
          ) : !showShare ? (
            <View style={styles.topSpacer} />
          ) : null}
        </View>
      </View>
      {body}
    </SafeAreaView>
  );
};

type SheetProps = { children: React.ReactNode };

export const ErpDocSheet: React.FC<SheetProps> = ({ children }) => (
  <View style={styles.sheet}>{children}</View>
);

/** Secondary card below the main sheet (shipping, tracking, etc.). */
export const ErpDocCard: React.FC<SheetProps> = ({ children }) => (
  <View style={styles.card}>{children}</View>
);

type StatusBadgeProps = { label: string; color: string };

export const ErpDocStatusBadge: React.FC<StatusBadgeProps> = ({ label, color }) => (
  <View style={[styles.statusBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
    <View style={[styles.statusBadgeDot, { backgroundColor: color }]} />
    <Text style={[styles.statusBadgeText, { color }]} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

type HeroProps = {
  docId: string;
  statusLabel: string;
  statusColor: string;
  subtitle?: string;
  amount?: string;
  amountLabel?: string;
  facts?: { label: string; value: string }[];
  /** Renders on the right of the status badge (e.g. Accept/Reject, Pay). */
  statusTrailing?: React.ReactNode;
};

export const ErpDocHero: React.FC<HeroProps> = ({
  docId,
  statusLabel,
  statusColor,
  subtitle,
  amount,
  amountLabel = 'Total',
  facts,
  statusTrailing,
}) => (
  <View style={styles.hero}>
    <View style={[styles.heroStatusRow, !statusTrailing && styles.heroStatusRowSolo]}>
      <ErpDocStatusBadge label={statusLabel} color={statusColor} />
      {statusTrailing ? <View style={styles.heroStatusTrailing}>{statusTrailing}</View> : null}
    </View>
    <Text style={styles.docId} numberOfLines={2}>
      {docId}
    </Text>
    {amount ? (
      <View style={styles.amountBlock}>
        <Text style={styles.amountLabel}>{amountLabel}</Text>
        <Text style={styles.amountValue}>{amount}</Text>
      </View>
    ) : null}
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    {facts?.length ? (
      <View style={styles.factsWrap}>
        {facts.map((f) => (
          <View key={f.label} style={styles.factChip}>
            <Text style={styles.factChipLabel}>{f.label}</Text>
            <Text style={styles.factChipValue} numberOfLines={1}>
              {f.value || '—'}
            </Text>
          </View>
        ))}
      </View>
    ) : null}
  </View>
);

export const ErpDocRule: React.FC = () => <View style={styles.rule} />;

type SectionProps = { title?: string; children: React.ReactNode };

export const ErpDocSection: React.FC<SectionProps> = ({ title, children }) => (
  <View style={styles.sectionBlock}>
    {title ? <Text style={styles.sectionHeading}>{title}</Text> : null}
    {children}
  </View>
);

type MetaProps = { label: string; value: string };

export const ErpDocMetaRow: React.FC<MetaProps> = ({ label, value }) => (
  <View style={styles.metaRow}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue} numberOfLines={2}>
      {value || '—'}
    </Text>
  </View>
);

type LineProps = {
  title: string;
  detail?: string | null;
  qty?: unknown;
  rate?: unknown;
  amount?: unknown;
  currency?: string;
  imageUri?: string | null;
};

export const ErpDocLineItem: React.FC<LineProps> = ({
  title,
  detail,
  qty,
  rate,
  amount,
  currency,
  imageUri,
}) => {
  const insets = useSafeAreaInsets();
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const qtyNum = Number(qty);
  const rateNum = Number(rate);
  const amountNum = Number(amount);
  const lineTotal = Number.isFinite(amountNum) ? formatErpDocMoney(amountNum, currency) : null;
  const qtyLine =
    Number.isFinite(qtyNum) && Number.isFinite(rateNum)
      ? `${qtyNum} × ${formatErpDocMoney(rateNum, currency)}`
      : qty != null
        ? `Qty ${String(qty)}`
        : null;
  const thumb = String(imageUri || '').trim();

  return (
    <View style={styles.lineItem}>
      <View style={styles.lineTop}>
        {thumb ? (
          <TouchableOpacity
            onPress={() => setImagePreviewOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View item image"
          >
            <ErpAuthenticatedImage uri={thumb} style={styles.lineThumb} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <View style={styles.lineThumbPlaceholder}>
            <Ionicons name="cube-outline" size={20} color={Colors.TEXT_SECONDARY} />
          </View>
        )}
        <View style={styles.lineTextCol}>
          <Text style={styles.lineTitle} numberOfLines={2}>
            {title}
          </Text>
          {detail ? (
            <Text style={styles.lineDetail} numberOfLines={1}>
              {detail}
            </Text>
          ) : qtyLine ? (
            <Text style={styles.lineDetail}>{qtyLine}</Text>
          ) : null}
        </View>
        {lineTotal ? <Text style={styles.lineAmount}>{lineTotal}</Text> : null}
      </View>

      <Modal
        visible={imagePreviewOpen && !!thumb}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewOpen(false)}
      >
        <View style={[styles.lineImageModalRoot, { paddingTop: Math.max(insets.top, 8) }]}>
          <View style={styles.lineImageModalHead}>
            <Text style={styles.lineImageModalTitle} numberOfLines={2}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={() => setImagePreviewOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close image preview"
            >
              <Ionicons name="close-circle" size={36} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Pressable style={styles.lineImageModalBody} onPress={() => setImagePreviewOpen(false)}>
            <View style={styles.lineImageModalImgWrap} pointerEvents="box-none">
              <ErpAuthenticatedImage uri={thumb} style={styles.lineImageModalImg} resizeMode="contain" />
            </View>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
};

/** Subtle inner list for line items. */
export const ErpDocItemsList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.itemsList}>{children}</View>
);

type TotalProps = { label: string; value: string; emphasis?: boolean };

export const ErpDocTotalRow: React.FC<TotalProps> = ({ label, value, emphasis }) => (
  <View style={[styles.kv, emphasis && styles.kvTotal]}>
    <Text style={emphasis ? styles.totalKey : styles.kvKey}>{label}</Text>
    <Text style={emphasis ? styles.totalVal : styles.kvVal}>{value}</Text>
  </View>
);

type RefProps = {
  doctype: string;
  name: string;
  amount?: string;
};

export const ErpDocReferenceRow: React.FC<RefProps> = ({ doctype, name, amount }) => (
  <View style={styles.refRow}>
    <View style={styles.refIconWrap}>
      <Ionicons name="link-outline" size={16} color={Colors.WINE} />
    </View>
    <View style={styles.refMain}>
      <Text style={styles.refDoctype}>{doctype}</Text>
      <Text style={styles.refName} numberOfLines={1}>
        {name}
      </Text>
    </View>
    {amount ? <Text style={styles.refAmount}>{amount}</Text> : null}
  </View>
);

export type ErpDocPreviewTab = { id: string; label: string };

type TabBarProps = {
  tabs: ErpDocPreviewTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export const ErpDocTabBar: React.FC<TabBarProps> = ({ tabs, activeId, onChange }) => (
  <View style={styles.tabBar}>
    {tabs.map((tab) => {
      const selected = tab.id === activeId;
      return (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tabBtn, selected && styles.tabBtnOn]}
          onPress={() => onChange(tab.id)}
          activeOpacity={0.75}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          <Text style={[styles.tabBtnText, selected && styles.tabBtnTextOn]}>{tab.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

type LinkButtonProps = {
  label: string;
  subtitle?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

/** Primary navigation to a linked ERP document (quotation, invoice, payments, etc.). */
export const ErpDocLinkButton: React.FC<LinkButtonProps> = ({
  label,
  subtitle,
  onPress,
  loading,
  disabled,
  icon = 'arrow-forward-circle-outline',
}) => (
  <TouchableOpacity
    style={[styles.linkBtn, (disabled || loading) && styles.linkBtnDisabled]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.8}
    accessibilityRole="button"
  >
    {loading ? (
      <ActivityIndicator color={Colors.WINE} style={styles.linkBtnLoader} />
    ) : (
      <>
        <View style={styles.linkBtnIconWrap}>
          <Ionicons name={icon} size={22} color={Colors.WINE} />
        </View>
        <View style={styles.linkBtnTextCol}>
          <Text style={styles.linkBtnLabel}>{label}</Text>
          {subtitle ? (
            <Text style={styles.linkBtnSub} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.TEXT_SECONDARY} />
      </>
    )}
  </TouchableOpacity>
);

type LinkedSectionProps = {
  title: string;
  loading?: boolean;
  emptyTitle?: string;
  children?: React.ReactNode;
};

export const ErpDocLinkedSection: React.FC<LinkedSectionProps> = ({
  title,
  loading,
  emptyTitle,
  children,
}) => (
  <View style={styles.linkedSection}>
    <Text style={styles.sectionHeading}>{title}</Text>
    {loading ? (
      <View style={styles.linkedLoading}>
        <ActivityIndicator color={Colors.TEXT_SECONDARY} />
      </View>
    ) : !children ? (
      emptyTitle ? <Text style={styles.linkedEmpty}>{emptyTitle}</Text> : null
    ) : (
      children
    )}
  </View>
);

export const ErpDocEmptyState: React.FC<{ icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }> = ({
  icon = 'cube-outline',
  title,
  subtitle,
}) => (
  <View style={styles.emptyState}>
    <Ionicons name={icon} size={28} color={Colors.MEDIUM_GRAY} />
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ECEFF1' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.SM,
    backgroundColor: '#ECEFF1',
  },
  backHit: { paddingVertical: 4, paddingRight: 8, minWidth: 36 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: Colors.BLACK,
    letterSpacing: -0.2,
  },
  topSpacer: { width: 36 },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 36,
    gap: 2,
  },
  headerIconHit: { padding: 6 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: Spacing.MD, paddingTop: 4, paddingBottom: Spacing.XL },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.XL,
    gap: 10,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '600', color: Colors.BLACK, marginTop: 4 },
  errorSub: { fontSize: 14, color: Colors.TEXT_SECONDARY, textAlign: 'center', lineHeight: 20 },
  sheet: {
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    padding: Spacing.LG,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    backgroundColor: Colors.WHITE,
    borderRadius: 16,
    padding: Spacing.LG,
    marginTop: Spacing.MD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  hero: { gap: 10 },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
  },
  heroStatusRowSolo: {
    justifyContent: 'flex-start',
  },
  heroStatusTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    marginLeft: 'auto',
  },
  statusBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  docId: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: -0.1,
  },
  amountBlock: { marginTop: 2 },
  amountLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.BLACK,
    letterSpacing: -0.8,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  subtitle: { fontSize: 14, color: Colors.TEXT_SECONDARY, lineHeight: 20 },
  factsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  factChip: {
    backgroundColor: Colors.LIGHT_GRAY,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: '46%',
    flexGrow: 1,
  },
  factChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  factChipValue: { fontSize: 13, fontWeight: '600', color: Colors.BLACK },
  rule: {
    height: hairline,
    backgroundColor: Colors.MEDIUM_GRAY,
    marginVertical: Spacing.MD,
    opacity: 0.35,
  },
  sectionBlock: { marginTop: Spacing.LG },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  metaLabel: { fontSize: 14, color: Colors.TEXT_SECONDARY },
  metaValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
    textAlign: 'right',
  },
  itemsList: {
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  lineItem: {
    paddingVertical: 10,
    borderBottomWidth: hairline,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  lineThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: Colors.LIGHT_GRAY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineTextCol: { flex: 1, minWidth: 0 },
  lineTitle: { fontSize: 15, fontWeight: '600', color: Colors.BLACK, lineHeight: 20 },
  lineDetail: { fontSize: 12, color: Colors.TEXT_SECONDARY, marginTop: 2 },
  lineAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.BLACK,
    fontVariant: ['tabular-nums'],
  },
  lineImageModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  lineImageModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingBottom: 12,
    gap: 12,
  },
  lineImageModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  lineImageModalBody: {
    flex: 1,
    width: '100%',
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.XL,
  },
  lineImageModalImgWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineImageModalImg: {
    width: '100%',
    height: '100%',
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  kvKey: { fontSize: 14, color: Colors.TEXT_SECONDARY },
  kvVal: { fontSize: 14, fontWeight: '600', color: Colors.BLACK, fontVariant: ['tabular-nums'] },
  kvTotal: {
    marginTop: Spacing.SM,
    paddingTop: Spacing.MD,
    borderTopWidth: hairline,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  totalKey: { fontSize: 15, fontWeight: '600', color: Colors.BLACK },
  totalVal: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.BLACK,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: hairline,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  refIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.BRAND_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refMain: { flex: 1, minWidth: 0 },
  refDoctype: { fontSize: 10, fontWeight: '700', color: Colors.TEXT_SECONDARY, letterSpacing: 0.4 },
  refName: { fontSize: 14, fontWeight: '600', color: Colors.BLACK, marginTop: 1 },
  refAmount: { fontSize: 14, fontWeight: '700', color: Colors.BLACK, fontVariant: ['tabular-nums'] },
  linkedSection: { marginTop: Spacing.LG },
  linkedLoading: { alignItems: 'center', paddingVertical: 16 },
  linkedEmpty: { fontSize: 14, color: Colors.TEXT_SECONDARY, lineHeight: 20 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F7F8FA',
    borderWidth: hairline,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 8,
  },
  linkBtnDisabled: { opacity: 0.55 },
  linkBtnLoader: { alignSelf: 'center', flex: 1 },
  linkBtnIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.BRAND_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnTextCol: { flex: 1, minWidth: 0 },
  linkBtnLabel: { fontSize: 15, fontWeight: '700', color: Colors.BLACK },
  linkBtnSub: { marginTop: 3, fontSize: 13, color: Colors.TEXT_SECONDARY, lineHeight: 18 },
  tabBar: {
    flexDirection: 'row',
    marginTop: Spacing.LG,
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabBtnOn: {
    backgroundColor: Colors.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: Colors.TEXT_SECONDARY },
  tabBtnTextOn: { color: Colors.BLACK, fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.XL,
    paddingHorizontal: Spacing.MD,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.BLACK, marginTop: 4 },
  emptySub: { fontSize: 13, color: Colors.TEXT_SECONDARY, textAlign: 'center', lineHeight: 18 },
});
