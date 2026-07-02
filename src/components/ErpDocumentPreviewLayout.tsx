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
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';
import { DocumentPrintButton } from './DocumentPrintButton';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';

const hairline = ERP_DOC_FLAT.hairline;
const flatBorder = ERP_DOC_FLAT.border;
const flatMuted = ERP_DOC_FLAT.muted;
const flatInk = ERP_DOC_FLAT.ink;
const flatAccent = ERP_DOC_FLAT.accent;

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
      showsHorizontalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <View style={styles.scrollContent}>{children}</View>
      <View style={{ height: Spacing.XXL }} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backHit} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={flatInk} />
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
  /** Smaller amount on the right (e.g. invoice goods total beside delivery fee). */
  secondaryAmount?: string;
  secondaryAmountLabel?: string;
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
  secondaryAmount,
  secondaryAmountLabel,
  facts,
  statusTrailing,
}) => (
  <View style={styles.hero}>
    <View style={styles.heroBadgeRow}>
      <ErpDocStatusBadge label={statusLabel} color={statusColor} />
    </View>
    {statusTrailing ? <View style={styles.heroTrailingRow}>{statusTrailing}</View> : null}
    <Text style={styles.docId} numberOfLines={1} ellipsizeMode="middle">
      {docId}
    </Text>
    {amount ? (
      <View style={styles.amountRow}>
        <View style={styles.amountPrimary}>
          <Text style={styles.amountLabel} numberOfLines={1}>
            {amountLabel}
          </Text>
          <Text
            style={styles.amountValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {amount}
          </Text>
        </View>
        {secondaryAmount ? (
          <View style={styles.amountSecondary}>
            <Text style={styles.amountSecondaryLabel} numberOfLines={1}>
              {secondaryAmountLabel || 'Invoice'}
            </Text>
            <Text style={styles.amountSecondaryValue} numberOfLines={1}>
              {secondaryAmount}
            </Text>
          </View>
        ) : null}
      </View>
    ) : null}
    {subtitle ? (
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    ) : null}
    {facts?.length ? (
      <View style={styles.factsWrap}>
        {facts.map((f) => (
          <View key={f.label} style={styles.factChip}>
            <Text style={styles.factChipLabel} numberOfLines={1}>
              {f.label}
            </Text>
            <Text style={styles.factChipValue} numberOfLines={2}>
              {f.value || '—'}
            </Text>
          </View>
        ))}
      </View>
    ) : null}
  </View>
);

type HeroActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  accessibilityLabel?: string;
};

/** Compact action beside the status badge (Edit, Pay, etc.). */
export const ErpDocHeroActionButton: React.FC<HeroActionButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  accessibilityLabel,
}) => (
  <TouchableOpacity
    style={[styles.heroActionBtn, variant === 'outline' && styles.heroActionBtnOutline]}
    onPress={onPress}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel || label}
  >
    <Text style={[styles.heroActionBtnText, variant === 'outline' && styles.heroActionBtnTextOutline]}>
      {label}
    </Text>
  </TouchableOpacity>
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

type NoticeProps = { children: string };

export const ErpDocNotice: React.FC<NoticeProps> = ({ children }) => (
  <View style={styles.notice}>
    <Text style={styles.noticeText}>{children}</Text>
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
  onPress?: () => void;
};

export const ErpDocReferenceRow: React.FC<RefProps> = ({ doctype, name, amount, onPress }) => {
  const content = (
    <>
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
      {onPress ? <Ionicons name="chevron-forward" size={18} color={Colors.TEXT_SECONDARY} /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.refRow} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.refRow}>{content}</View>;
};

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
          style={styles.tabBtn}
          onPress={() => onChange(tab.id)}
          activeOpacity={0.75}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          <Text style={[styles.tabBtnText, selected && styles.tabBtnTextOn]}>{tab.label}</Text>
          {selected ? <View style={styles.tabIndicator} /> : null}
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
          <Ionicons name={icon} size={20} color={flatMuted} />
        </View>
        <View style={styles.linkBtnTextCol}>
          <Text style={styles.linkBtnLabel}>{label}</Text>
          {subtitle ? (
            <Text style={styles.linkBtnSub} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={15} color={Colors.MEDIUM_GRAY} />
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
  screen: { flex: 1, backgroundColor: ERP_DOC_FLAT.pageBg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.SM,
    backgroundColor: ERP_DOC_FLAT.pageBg,
  },
  backHit: { paddingVertical: 4, paddingRight: 8, minWidth: 36 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: flatInk,
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
  scroll: { flex: 1, width: '100%' },
  scrollInner: { paddingTop: 0, paddingBottom: Spacing.XL },
  scrollContent: { width: '100%', minWidth: 0, maxWidth: '100%', alignSelf: 'stretch' },
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
  errorTitle: { fontSize: 17, fontWeight: '600', color: flatInk, marginTop: 4 },
  errorSub: { fontSize: 14, color: flatMuted, textAlign: 'center', lineHeight: 20 },
  sheet: {
    backgroundColor: ERP_DOC_FLAT.surface,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.LG,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  card: {
    backgroundColor: ERP_DOC_FLAT.surface,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.LG,
    marginTop: Spacing.MD,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  hero: { gap: 8, width: '100%', minWidth: 0, alignSelf: 'stretch' },
  heroBadgeRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  heroTrailingRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: flatAccent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  heroActionBtnOutline: {
    backgroundColor: ERP_DOC_FLAT.surface,
    borderWidth: hairline,
    borderColor: flatBorder,
  },
  heroActionBtnText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  heroActionBtnTextOutline: {
    color: flatInk,
  },
  statusBadge: {
    flexShrink: 1,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  statusBadgeText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  docId: {
    fontSize: 14,
    fontWeight: '500',
    color: flatMuted,
    letterSpacing: 0,
    minWidth: 0,
    width: '100%',
  },
  amountBlock: { marginTop: 2, width: '100%', minWidth: 0 },
  amountRow: {
    marginTop: 2,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  amountPrimary: { flex: 1, minWidth: 0 },
  amountSecondary: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '42%' },
  amountLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: flatMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '700',
    color: flatInk,
    letterSpacing: 0,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    width: '100%',
    minWidth: 0,
  },
  amountSecondaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: flatMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
    textAlign: 'right',
  },
  amountSecondaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: flatMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    color: flatMuted,
    lineHeight: 20,
    width: '100%',
    minWidth: 0,
  },
  factsWrap: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: hairline,
    borderTopColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  factChip: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  factChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: flatMuted,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  factChipValue: {
    fontSize: 14,
    fontWeight: '600',
    color: flatInk,
    minWidth: 0,
  },
  rule: {
    height: hairline,
    backgroundColor: flatBorder,
    marginVertical: Spacing.MD,
  },
  sectionBlock: { marginTop: Spacing.LG },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: flatMuted,
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
  },
  metaLabel: { fontSize: 15, color: flatInk, letterSpacing: -0.2 },
  metaValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: flatMuted,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  notice: {
    marginTop: Spacing.MD,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F5F6F8',
    borderWidth: hairline,
    borderColor: flatBorder,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
    color: flatMuted,
    letterSpacing: -0.1,
  },
  itemsList: {
    backgroundColor: ERP_DOC_FLAT.surface,
    borderWidth: hairline,
    borderColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  lineItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineThumb: {
    width: 52,
    height: 52,
    backgroundColor: ERP_DOC_FLAT.surfaceMuted,
  },
  lineThumbPlaceholder: {
    width: 52,
    height: 52,
    backgroundColor: ERP_DOC_FLAT.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineTextCol: { flex: 1, minWidth: 0 },
  lineTitle: { fontSize: 15, fontWeight: '600', color: flatInk, lineHeight: 20 },
  lineDetail: { fontSize: 13, color: flatMuted, marginTop: 2 },
  lineAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: flatInk,
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
  kvKey: { fontSize: 14, color: flatMuted },
  kvVal: { fontSize: 14, fontWeight: '600', color: flatInk, fontVariant: ['tabular-nums'] },
  kvTotal: {
    marginTop: Spacing.SM,
    paddingTop: Spacing.MD,
    borderTopWidth: hairline,
    borderTopColor: flatBorder,
  },
  totalKey: { fontSize: 15, fontWeight: '600', color: flatInk },
  totalVal: {
    fontSize: 18,
    fontWeight: '700',
    color: flatInk,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
  },
  refIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refMain: { flex: 1, minWidth: 0 },
  refDoctype: { fontSize: 11, fontWeight: '600', color: flatMuted, letterSpacing: 0.2 },
  refName: { fontSize: 14, fontWeight: '600', color: flatInk, marginTop: 1 },
  refAmount: { fontSize: 14, fontWeight: '600', color: flatInk, fontVariant: ['tabular-nums'] },
  linkedSection: { marginTop: Spacing.LG },
  linkedLoading: { alignItems: 'center', paddingVertical: 16 },
  linkedEmpty: { fontSize: 14, color: flatMuted, lineHeight: 20 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  linkBtnDisabled: { opacity: 0.55 },
  linkBtnLoader: { alignSelf: 'center', flex: 1 },
  linkBtnIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnTextCol: { flex: 1, minWidth: 0 },
  linkBtnLabel: { fontSize: 15, fontWeight: '600', color: flatInk },
  linkBtnSub: { marginTop: 3, fontSize: 13, color: flatMuted, lineHeight: 18 },
  tabBar: {
    flexDirection: 'row',
    marginTop: Spacing.LG,
    borderBottomWidth: hairline,
    borderBottomColor: flatBorder,
    width: '100%',
    minWidth: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
    minWidth: 0,
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: flatAccent,
  },
  tabBtnText: { fontSize: 15, fontWeight: '500', color: flatMuted },
  tabBtnTextOn: { color: flatAccent, fontWeight: '600' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.XL,
    paddingHorizontal: Spacing.MD,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: flatInk, marginTop: 4 },
  emptySub: { fontSize: 13, color: flatMuted, textAlign: 'center', lineHeight: 18 },
});
