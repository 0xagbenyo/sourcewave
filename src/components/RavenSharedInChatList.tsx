import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import {
  listRavenFilesSharedInChannel,
  listSharedDocumentsInChannel,
  type RavenChannelFileRow,
  type RavenSharedChatItem,
  type RavenSharedChatItemKind,
  type RavenSharedDocumentFilter,
} from '../services/ravenNativeApi';
import { formatMessageHeaderTime } from '../utils/ravenChatUi';
import { resolveRavenUserDisplayName, type RavenUserDisplayProfiles } from '../utils/ravenSearchPreview';
import {
  RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS,
  type RavenChannelFileTypeFilter,
} from '../utils/ravenChannelFileTypeFilter';
import { classifyRavenAttachment } from '../utils/ravenAttachment';

export type RavenSharedInChatListVariant = 'raven' | 'wine';

type MainTab = 'files' | 'documents';

type Props = {
  /** When false, list is cleared and no fetch runs. */
  active: boolean;
  channelId: string | null | undefined;
  variant?: RavenSharedInChatListVariant;
  /** Close menu and scroll the open chat to this message. */
  onGoToMessage: (messageName: string) => void;
  userDisplayProfiles?: RavenUserDisplayProfiles;
  /** When false, title is only reported via {@link onSectionTitleChange}. */
  showInlineTitle?: boolean;
  /** Called when the active Raven-style section title changes (for modal headers). */
  onSectionTitleChange?: (title: string) => void;
};

type FileFilterChip = { id: RavenChannelFileTypeFilter; label: string };
type DocumentFilterChip = { id: RavenSharedDocumentFilter; label: string };

const FILE_FILTER_CHIPS: FileFilterChip[] = [
  { id: 'any', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.any },
  { id: 'pdf', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.pdf },
  { id: 'doc', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.doc },
  { id: 'ppt', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.ppt },
  { id: 'xls', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.xls },
  { id: 'image', label: RAVEN_CHANNEL_FILE_TYPE_FILTER_LABELS.image },
];

const DOCUMENT_FILTER_CHIPS: DocumentFilterChip[] = [
  { id: 'any', label: 'Any' },
  { id: 'quotation', label: 'Quotations' },
  { id: 'order', label: 'Orders' },
  { id: 'invoice', label: 'Invoices' },
];

const FILES_SECTION_TITLE = 'Files shared in this channel';
const DOCUMENTS_SECTION_TITLE = 'Documents shared in this channel';

function sharedDocumentIcon(kind: RavenSharedChatItemKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'quotation':
      return 'pricetag-outline';
    case 'order':
      return 'cart-outline';
    case 'invoice':
      return 'receipt-outline';
    default:
      return 'document-text-outline';
  }
}

function sharedDocumentTypeLabel(kind: RavenSharedChatItemKind): string {
  switch (kind) {
    case 'quotation':
      return 'Supplier Quotation';
    case 'order':
      return 'Sales Order';
    case 'invoice':
      return 'Sales Invoice';
    default:
      return 'Document';
  }
}

function channelFileIcon(row: RavenChannelFileRow): keyof typeof Ionicons.glyphMap {
  const { kind } = classifyRavenAttachment(row.fileUrl, row.message_type);
  if (kind === 'image') return 'image-outline';
  if (kind === 'video') return 'videocam-outline';
  if (kind === 'pdf') return 'document-text-outline';
  return 'document-attach-outline';
}

function channelFileTypeLabel(row: RavenChannelFileRow): string {
  const { kind } = classifyRavenAttachment(row.fileUrl, row.message_type);
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  if (kind === 'pdf') return 'PDF';
  return 'File';
}

export const RavenSharedInChatList: React.FC<Props> = ({
  active,
  channelId,
  variant = 'raven',
  onGoToMessage,
  userDisplayProfiles,
  showInlineTitle = true,
  onSectionTitleChange,
}) => {
  const wine = variant === 'wine';
  const text = wine ? Colors.BLACK : RavenLight.text;
  const textMuted = wine ? Colors.TEXT_SECONDARY : RavenLight.textMuted;
  const accent = wine ? Colors.WINE : RavenLight.accent;
  const border = wine ? '#E8E8E8' : RavenLight.border;
  const chipBg = wine ? Colors.BRAND_SOFT : RavenLight.accentSoft;

  const [mainTab, setMainTab] = useState<MainTab>('files');
  const [fileFilter, setFileFilter] = useState<RavenChannelFileTypeFilter>('any');
  const [documentFilter, setDocumentFilter] = useState<RavenSharedDocumentFilter>('any');
  const [fileRows, setFileRows] = useState<RavenChannelFileRow[]>([]);
  const [documentRows, setDocumentRows] = useState<RavenSharedChatItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const sectionTitle = mainTab === 'files' ? FILES_SECTION_TITLE : DOCUMENTS_SECTION_TITLE;

  useEffect(() => {
    onSectionTitleChange?.(sectionTitle);
  }, [onSectionTitleChange, sectionTitle]);

  useEffect(() => {
    const id = channelId?.trim();
    if (!active || !id) {
      setFileRows([]);
      setDocumentRows([]);
      setLoadingFiles(false);
      setLoadingDocuments(false);
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    void listRavenFilesSharedInChannel(id, { fileType: fileFilter })
      .then((rows) => {
        if (!cancelled) setFileRows(rows);
      })
      .catch(() => {
        if (!cancelled) setFileRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, channelId, fileFilter]);

  useEffect(() => {
    const id = channelId?.trim();
    if (!active || !id) return;
    let cancelled = false;
    setLoadingDocuments(true);
    void listSharedDocumentsInChannel(id)
      .then((rows) => {
        if (!cancelled) setDocumentRows(rows);
      })
      .catch(() => {
        if (!cancelled) setDocumentRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDocuments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, channelId]);

  useEffect(() => {
    if (!active) {
      setMainTab('files');
      setFileFilter('any');
      setDocumentFilter('any');
    }
  }, [active]);

  const filteredDocuments = useMemo(
    () =>
      documentFilter === 'any'
        ? documentRows
        : documentRows.filter((row) => row.kind === documentFilter),
    [documentFilter, documentRows]
  );

  const documentCounts = useMemo(() => {
    const c: Record<RavenSharedDocumentFilter, number> = {
      any: documentRows.length,
      quotation: 0,
      order: 0,
      invoice: 0,
    };
    for (const row of documentRows) {
      if (row.kind === 'quotation' || row.kind === 'order' || row.kind === 'invoice') {
        c[row.kind] += 1;
      }
    }
    return c;
  }, [documentRows]);

  const onFileRowPress = useCallback(
    (row: RavenChannelFileRow) => {
      const id = String(row.messageName || '').trim();
      if (!id) return;
      onGoToMessage(id);
    },
    [onGoToMessage]
  );

  const onDocumentRowPress = useCallback(
    (row: RavenSharedChatItem) => {
      const id = String(row.messageName || '').trim();
      if (!id) return;
      onGoToMessage(id);
    },
    [onGoToMessage]
  );

  if (!channelId?.trim()) {
    return null;
  }

  const loading = mainTab === 'files' ? loadingFiles : loadingDocuments;
  const filterChips =
    mainTab === 'files' ? (
      FILE_FILTER_CHIPS.map((chip) => {
        const selected = fileFilter === chip.id;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[
              styles.filterChip,
              { borderColor: selected ? accent : border, backgroundColor: selected ? chipBg : 'transparent' },
            ]}
            onPress={() => setFileFilter(chip.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.filterChipText, { color: selected ? accent : textMuted }]}>{chip.label}</Text>
          </TouchableOpacity>
        );
      })
    ) : (
      DOCUMENT_FILTER_CHIPS.map((chip) => {
        const selected = documentFilter === chip.id;
        const count = documentCounts[chip.id];
        const disabled = chip.id !== 'any' && count === 0 && !loadingDocuments;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[
              styles.filterChip,
              { borderColor: selected ? accent : border, backgroundColor: selected ? chipBg : 'transparent' },
              disabled && styles.filterChipDisabled,
            ]}
            onPress={() => setDocumentFilter(chip.id)}
            disabled={disabled}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selected ? accent : textMuted },
                disabled && styles.filterChipTextDisabled,
              ]}
            >
              {chip.label}
              {chip.id !== 'any' && count > 0 ? ` · ${count}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })
    );

  const emptyHeading = 'Nothing to see here';
  const emptyBody =
    mainTab === 'files' ? 'No files found in this channel' : 'No documents found in this channel';

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionRow}>
        {showInlineTitle ? (
          <Text style={[styles.sectionTitle, { color: text }]}>{sectionTitle}</Text>
        ) : (
          <View style={styles.sectionTitleSpacer} />
        )}
        {loading ? <ActivityIndicator size="small" color={accent} /> : null}
      </View>

      <View style={[styles.mainTabRow, { borderColor: border }]}>
        {(['files', 'documents'] as const).map((tab) => {
          const selected = mainTab === tab;
          const label = tab === 'files' ? 'View Files' : 'View Documents';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.mainTabBtn, selected && { borderBottomColor: accent }]}
              onPress={() => setMainTab(tab)}
              activeOpacity={0.75}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.mainTabText, { color: selected ? accent : textMuted }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mainTab === 'files' ? (
        <Text style={[styles.hint, { color: textMuted }]}>Tap a file to jump to that message.</Text>
      ) : (
        <Text style={[styles.hint, { color: textMuted }]}>
          Supplier quotations, sales orders, and sales invoices shared in this channel.
        </Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {filterChips}
      </ScrollView>

      {loading && (mainTab === 'files' ? fileRows.length === 0 : filteredDocuments.length === 0) ? (
        <Text style={[styles.empty, { color: textMuted }]}>Loading…</Text>
      ) : mainTab === 'files' ? (
        fileRows.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={[styles.emptyHeading, { color: text }]}>{emptyHeading}</Text>
            <Text style={[styles.emptyBody, { color: textMuted }]}>{emptyBody}</Text>
          </View>
        ) : (
          fileRows.map((row) => {
            const when = formatMessageHeaderTime(row.creation);
            const who = resolveRavenUserDisplayName(row.owner, userDisplayProfiles);
            const typeLabel = channelFileTypeLabel(row);
            return (
              <TouchableOpacity
                key={`file-${row.messageName}-${row.fileUrl}`}
                style={[styles.row, { borderBottomColor: border }]}
                onPress={() => onFileRowPress(row)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: chipBg }]}>
                  <Ionicons name={channelFileIcon(row)} size={20} color={accent} />
                </View>
                <View style={styles.rowMain}>
                  <Text style={[styles.typePill, { color: accent }]} numberOfLines={1}>
                    {typeLabel}
                  </Text>
                  <Text style={[styles.fileName, { color: text }]} numberOfLines={2}>
                    {row.fileName}
                  </Text>
                  <Text style={[styles.meta, { color: textMuted }]} numberOfLines={1}>
                    {[when, who].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={textMuted}
                  accessibilityLabel="Go to message"
                />
              </TouchableOpacity>
            );
          })
        )
      ) : filteredDocuments.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={[styles.emptyHeading, { color: text }]}>{emptyHeading}</Text>
          <Text style={[styles.emptyBody, { color: textMuted }]}>{emptyBody}</Text>
        </View>
      ) : (
        filteredDocuments.map((row) => {
          const when = formatMessageHeaderTime(row.creation);
          const who = resolveRavenUserDisplayName(row.owner, userDisplayProfiles);
          const typeLabel = sharedDocumentTypeLabel(row.kind);
          return (
            <TouchableOpacity
              key={`doc-${row.kind}-${row.messageName}-${row.linkDocument || row.label}`}
              style={[styles.row, { borderBottomColor: border }]}
              onPress={() => onDocumentRowPress(row)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: chipBg }]}>
                <Ionicons name={sharedDocumentIcon(row.kind)} size={20} color={accent} />
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.typePill, { color: accent }]} numberOfLines={1}>
                  {typeLabel}
                </Text>
                <Text style={[styles.fileName, { color: text }]} numberOfLines={2}>
                  {row.label}
                </Text>
                <Text style={[styles.meta, { color: textMuted }]} numberOfLines={1}>
                  {[when, who].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color={textMuted}
                accessibilityLabel="Go to message"
              />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: Spacing.SM,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.SM,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  sectionTitleSpacer: {
    flex: 1,
  },
  mainTabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.MD,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mainTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  mainTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: Spacing.MD,
    paddingBottom: 10,
  },
  filterRow: {
    paddingHorizontal: Spacing.MD,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipDisabled: {
    opacity: 0.45,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextDisabled: {
    opacity: 0.8,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: Spacing.MD,
    paddingBottom: Spacing.SM,
    lineHeight: 18,
  },
  emptyBlock: {
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.LG,
    alignItems: 'center',
    gap: 4,
  },
  emptyHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.MD,
    marginHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  typePill: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
});
