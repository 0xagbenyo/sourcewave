import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { ERP_DOC_FLAT } from '../../constants/erpDocFlatUi';

const hairline = ERP_DOC_FLAT.hairline;
const border = ERP_DOC_FLAT.border;
const muted = ERP_DOC_FLAT.muted;
const ink = ERP_DOC_FLAT.ink;
const accent = ERP_DOC_FLAT.accent;
const surface = ERP_DOC_FLAT.surface;
const surfaceMuted = ERP_DOC_FLAT.surfaceMuted;

type PanelProps = { children: React.ReactNode; style?: ViewStyle };

export const DnPanel: React.FC<PanelProps> = ({ children, style }) => (
  <View style={[styles.panel, style]}>{children}</View>
);

export const DnSectionTitle: React.FC<{ children: string }> = ({ children }) => (
  <Text style={styles.sectionTitle}>{children}</Text>
);

type RowProps = {
  label: string;
  value: string;
  valueStrong?: boolean;
  last?: boolean;
};

export const DnRow: React.FC<RowProps> = ({ label, value, valueStrong, last }) => (
  <View style={[styles.row, last && styles.rowLast]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, valueStrong && styles.rowValueStrong]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

type PressRowProps = {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  last?: boolean;
};

export const DnPressRow: React.FC<PressRowProps> = ({ label, value, onPress, disabled, last }) => (
  <TouchableOpacity
    style={[styles.row, styles.pressRow, last && styles.rowLast]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.6}
  >
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue} numberOfLines={1}>
      {value}
    </Text>
    <Ionicons name="chevron-forward" size={15} color={Colors.MEDIUM_GRAY} style={styles.chevron} />
  </TouchableOpacity>
);

type SegmentProps = {
  yesLabel: string;
  noLabel: string;
  value: boolean;
  onChange: (yes: boolean) => void;
  disabled?: boolean;
};

export const DnSegment: React.FC<SegmentProps> = ({ yesLabel, noLabel, value, onChange, disabled }) => (
  <View style={styles.segmentTrack}>
    <TouchableOpacity
      style={[styles.segmentItem, value && styles.segmentItemOn]}
      onPress={() => onChange(true)}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.segmentText, value && styles.segmentTextOn]}>{yesLabel}</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.segmentItem, !value && styles.segmentItemOn]}
      onPress={() => onChange(false)}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.segmentText, !value && styles.segmentTextOn]}>{noLabel}</Text>
    </TouchableOpacity>
  </View>
);

type Tab = { id: string; label: string };

type TabStripProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
};

export const DnTabStrip: React.FC<TabStripProps> = ({ tabs, activeId, onChange }) => (
  <View style={styles.tabStrip}>
    {tabs.map((tab) => {
      const active = tab.id === activeId;
      return (
        <TouchableOpacity
          key={tab.id}
          style={styles.tabItem}
          onPress={() => onChange(tab.id)}
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
        >
          <Text style={[styles.tabText, active && styles.tabTextOn]}>{tab.label}</Text>
          {active ? <View style={styles.tabIndicator} /> : null}
        </TouchableOpacity>
      );
    })}
  </View>
);

type ActionBarProps = {
  saveLabel: string;
  submitLabel: string;
  showSubmit: boolean;
  canSave: boolean;
  canSubmit: boolean;
  saving?: boolean;
  submitting?: boolean;
  /** Guidance shown above the buttons (e.g. save first / ready to submit). */
  hint?: string;
  onSave: () => void;
  onSubmit: () => void;
};

export const DnActionBar: React.FC<ActionBarProps> = ({
  saveLabel,
  submitLabel,
  showSubmit,
  canSave,
  canSubmit,
  saving,
  submitting,
  hint,
  onSave,
  onSubmit,
}) => (
  <View style={styles.actionBarWrap}>
    {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
    <View style={styles.actionBar}>
      <TouchableOpacity
        style={[styles.actionPrimary, !canSave && styles.actionPrimaryOff]}
        onPress={onSave}
        disabled={!canSave || saving}
        activeOpacity={0.82}
      >
        {saving ? (
          <ActivityIndicator size="small" color={Colors.WHITE} />
        ) : (
          <Text style={styles.actionPrimaryText}>{saveLabel}</Text>
        )}
      </TouchableOpacity>
      {showSubmit ? (
        <TouchableOpacity
          style={[styles.actionSecondary, !canSubmit && styles.actionSecondaryOff]}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.82}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Text style={[styles.actionSecondaryText, !canSubmit && styles.actionSecondaryTextOff]}>
              {submitLabel}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
);

type LinkRowProps = {
  label: string;
  onPress: () => void;
};

export const DnLinkRow: React.FC<LinkRowProps> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.linkRow} onPress={onPress} activeOpacity={0.65}>
    <Ionicons name="receipt-outline" size={18} color={muted} />
    <Text style={styles.linkLabel} numberOfLines={1}>
      {label}
    </Text>
    <Ionicons name="chevron-forward" size={15} color={Colors.MEDIUM_GRAY} />
  </TouchableOpacity>
);

type TextLinkProps = { label: string; onPress: () => void };

export const DnTextLink: React.FC<TextLinkProps> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.textLink} onPress={onPress} activeOpacity={0.65}>
    <Text style={styles.textLinkLabel}>{label}</Text>
    <Ionicons name="arrow-forward" size={16} color={accent} />
  </TouchableOpacity>
);

type LineItemProps = {
  title: string;
  detail?: string;
  meta?: string;
  amount?: string;
  last?: boolean;
};

/** Compact line row for delivery note items — stays inside flat panels. */
export const DnLineItem: React.FC<LineItemProps> = ({ title, detail, meta, amount, last }) => (
  <View style={[styles.lineItem, last && styles.lineItemLast]}>
    <Text style={styles.lineTitle} numberOfLines={2}>
      {title}
    </Text>
    {detail ? (
      <Text style={styles.lineDetail} numberOfLines={1}>
        {detail}
      </Text>
    ) : null}
    <View style={styles.lineFooter}>
      {meta ? (
        <Text style={styles.lineMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : (
        <View style={styles.lineMetaSpacer} />
      )}
      {amount ? (
        <Text style={styles.lineAmount} numberOfLines={1}>
          {amount}
        </Text>
      ) : null}
    </View>
  </View>
);

export const dnUiStyles = StyleSheet.create({
  page: {
    gap: 16,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: 0,
  },
  heroDivider: {
    height: hairline,
    backgroundColor: border,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  panel: {
    backgroundColor: surface,
    borderWidth: hairline,
    borderColor: border,
    overflow: 'hidden',
    marginHorizontal: 16,
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: muted,
    marginBottom: 8,
    marginHorizontal: 16,
    letterSpacing: -0.1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: hairline,
    borderBottomColor: border,
    gap: 10,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  pressRow: {
    backgroundColor: surface,
  },
  rowLabel: {
    width: 120,
    flexShrink: 0,
    fontSize: 15,
    color: ink,
    letterSpacing: -0.2,
  },
  rowValue: {
    flex: 1,
    fontSize: 15,
    color: muted,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  rowValueStrong: {
    color: ink,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: -4,
  },
  segmentTrack: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: hairline,
    borderColor: border,
    overflow: 'hidden',
    maxWidth: 148,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    backgroundColor: surface,
  },
  segmentItemOn: {
    backgroundColor: surfaceMuted,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: muted,
  },
  segmentTextOn: {
    color: ink,
    fontWeight: '600',
  },
  tabStrip: {
    flexDirection: 'row',
    borderBottomWidth: hairline,
    borderBottomColor: border,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: muted,
  },
  tabTextOn: {
    color: accent,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: accent,
  },
  actionBarWrap: {
    width: '100%',
    minWidth: 0,
    borderTopWidth: hairline,
    borderTopColor: border,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  actionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: muted,
    letterSpacing: -0.1,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  actionPrimary: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: 4,
  },
  actionPrimaryOff: {
    opacity: 0.45,
  },
  actionPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WHITE,
    letterSpacing: -0.2,
  },
  actionSecondary: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    backgroundColor: surface,
    borderWidth: hairline,
    borderColor: border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginLeft: 4,
  },
  actionSecondaryOff: {
    opacity: 0.45,
  },
  actionSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: ink,
    letterSpacing: -0.2,
  },
  actionSecondaryTextOff: {
    color: Colors.MEDIUM_GRAY,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkLabel: {
    flex: 1,
    fontSize: 15,
    color: ink,
    letterSpacing: -0.2,
  },
  textLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: hairline,
    borderTopColor: border,
  },
  textLinkLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: accent,
    letterSpacing: -0.2,
  },
  lineItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: hairline,
    borderBottomColor: border,
  },
  lineItemLast: {
    borderBottomWidth: 0,
  },
  lineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ink,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  lineDetail: {
    fontSize: 13,
    color: muted,
    marginTop: 2,
    lineHeight: 18,
  },
  lineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  lineMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: muted,
  },
  lineMetaSpacer: {
    flex: 1,
  },
  lineAmount: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '600',
    color: ink,
    fontVariant: ['tabular-nums'],
  },
});
