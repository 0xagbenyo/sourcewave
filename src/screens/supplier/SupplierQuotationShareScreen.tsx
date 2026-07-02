import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { appAlert as Alert } from '../../services/appAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { sharePickerFlatStyles as flat } from '../../constants/sharePickerFlatUi';
import { RavenShareToContactPicker } from '../../components/RavenShareToContactPicker';
import { useUserSession } from '../../context/UserContext';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { getERPNextClient } from '../../services/erpnext';
import {
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
} from '../../services/ravenNativeApi';
import { userFacingError } from '../../utils/userFacingError';
import { shareErpDocumentsInChat, type ErpDocShareKind } from '../../utils/shareErpDocumentsInChat';
import { showQuotationShareSentAndOpenChat } from '../../utils/openRavenChatAfterShare';
import {
  supplierQuotationListCaption,
} from '../../utils/supplierQuotationShareCaption';
import {
  salesInvoiceListCaption,
} from '../../utils/salesInvoiceShareCaption';
import type { SupplierStackParamList } from '../../types';

type ShareRoute = RouteProp<SupplierStackParamList, 'SupplierQuotationShare' | 'SupplierInvoiceShare'>;

type DocRow = {
  name: string;
  title?: string;
  currency?: string;
  grand_total?: number;
  transaction_date?: string;
  posting_date?: string;
  customer?: string;
  customer_name?: string;
  docstatus?: number;
};

function isShareableRow(row: DocRow): boolean {
  return Number(row.docstatus) !== 2;
}

function resolvePreselectedNames(params: ShareRoute['params']): string[] {
  const fromArr = (params?.documentNames ?? [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (fromArr.length) return fromArr;
  const single = String(params?.documentName || params?.quotationName || '').trim();
  return single ? [single] : [];
}

const COPY: Record<
  ErpDocShareKind,
  {
    title: string;
    pickSubtitle: string;
    entryLabel: string;
    screenTitle: string;
    heroTitle: string;
    heroHint: string;
    emptyList: string;
    noSupplier: string;
    docSingular: string;
    docPlural: string;
    pickFirst: string;
    sharedBody: string;
  }
> = {
  quotation: {
    title: 'Share quotation',
    pickSubtitle: 'Select one or more quotations to send in chat',
    entryLabel: 'Share saved quotations in chat',
    screenTitle: 'Send quotation',
    heroTitle: 'Share quotation',
    heroHint: 'Choose who should receive the links in chat.',
    emptyList: 'No quotations to share yet. Create one from the New tab.',
    noSupplier: 'Your account must be linked to a Supplier to share quotations.',
    docSingular: 'quotation',
    docPlural: 'quotations',
    pickFirst: 'Select at least one quotation.',
    sharedBody: 'Your quotation links were sent in that conversation.',
  },
  invoice: {
    title: 'Share invoice',
    pickSubtitle: 'Select one or more invoices to send in chat',
    entryLabel: 'Share saved invoices in chat',
    screenTitle: 'Send invoice',
    heroTitle: 'Share invoice',
    heroHint: 'Choose who should receive the links in chat.',
    emptyList: 'No invoices to share yet. Invoices appear here once raised from your quotations.',
    noSupplier: 'Your account must be linked to a Supplier to share invoices.',
    docSingular: 'invoice',
    docPlural: 'invoices',
    pickFirst: 'Select at least one invoice.',
    sharedBody: 'Your invoice links were sent in that conversation.',
  },
};

function listCaption(kind: ErpDocShareKind, row: DocRow): string {
  const rec = row as Record<string, unknown>;
  return kind === 'invoice' ? salesInvoiceListCaption(rec) : supplierQuotationListCaption(rec);
}

export const SupplierErpDocShareScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<ShareRoute>();
  const { user } = useUserSession();
  const { supplierDocId, loading: sidLoading } = useSupplierDocumentId();

  const kind: ErpDocShareKind =
    route.params?.kind ?? (route.name === 'SupplierInvoiceShare' ? 'invoice' : 'quotation');
  const copy = COPY[kind];

  const preselectedNames = useMemo(() => resolvePreselectedNames(route.params), [route.params]);
  const skipList = preselectedNames.length > 0;
  const paramChannelId = (route.params?.ravenChannelId || '').trim();

  const [loadingDocs, setLoadingDocs] = useState(!skipList);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>(preselectedNames);
  const [showShareStep, setShowShareStep] = useState(skipList);

  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState(paramChannelId);
  const [sharing, setSharing] = useState(false);

  const shareSentRef = useRef(false);

  const loadDocuments = useCallback(async () => {
    if (!supplierDocId) {
      setDocuments([]);
      setLoadingDocs(false);
      return;
    }
    setLoadingDocs(true);
    try {
      const client = getERPNextClient();
      if (kind === 'invoice') {
        const rows = await client.listSalesInvoicesForSupplier(supplierDocId, { limit: 80 });
        setDocuments(
          (Array.isArray(rows) ? rows : [])
            .map((r) => ({
              name: String(r?.name || '').trim(),
              currency: r?.currency != null ? String(r.currency) : undefined,
              grand_total: r?.grand_total != null ? Number(r.grand_total) : undefined,
              posting_date: r?.posting_date != null ? String(r.posting_date) : undefined,
              customer: r?.customer != null ? String(r.customer) : undefined,
              customer_name: r?.customer_name != null ? String(r.customer_name) : undefined,
              docstatus: r?.docstatus != null ? Number(r.docstatus) : undefined,
            }))
            .filter((r) => r.name && isShareableRow(r))
        );
      } else {
        const rows = await client.listSupplierQuotationsForSupplier(supplierDocId, {
          limit: 50,
          start: 0,
        });
        setDocuments(
          (Array.isArray(rows) ? rows : [])
            .map((r) => ({
              name: String(r?.name || '').trim(),
              title: r?.title != null ? String(r.title) : undefined,
              currency: r?.currency != null ? String(r.currency) : undefined,
              grand_total: r?.grand_total != null ? Number(r.grand_total) : undefined,
              transaction_date: r?.transaction_date != null ? String(r.transaction_date) : undefined,
              docstatus: r?.docstatus != null ? Number(r.docstatus) : undefined,
            }))
            .filter((r) => r.name && isShareableRow(r))
        );
      }
    } catch (e: unknown) {
      Alert.error(copy.title, userFacingError(e, `Could not load ${copy.docPlural}.`));
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [supplierDocId, kind, copy.title, copy.docPlural]);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const rows = await listRavenChannelsForSessionUser(user?.email ?? null);
      setChannels(rows);
    } catch {
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (skipList) return;
    if (sidLoading) return;
    void loadDocuments();
  }, [loadDocuments, skipList, sidLoading]);

  useEffect(() => {
    if (!showShareStep) return;
    void loadChannels();
  }, [showShareStep, loadChannels]);

  useEffect(() => {
    if (!skipList || !preselectedNames.length) return;
    const hits = preselectedNames
      .map((n) => documents.find((d) => d.name === n))
      .filter(Boolean) as DocRow[];
    if (hits.length === preselectedNames.length) return;
    if (documents.length === 0 && loadingDocs) return;
    setSelectedNames(preselectedNames);
  }, [skipList, preselectedNames, documents, loadingDocs]);

  const toggleDocument = useCallback((name: string) => {
    const id = name.trim();
    if (!id) return;
    setSelectedNames((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const heroName = useMemo(() => {
    if (selectedNames.length === 0) return '';
    if (selectedNames.length === 1) {
      const row = documents.find((d) => d.name === selectedNames[0]);
      if (row) return listCaption(kind, row);
      return selectedNames[0]!;
    }
    return `${selectedNames.length} ${selectedNames.length === 1 ? copy.docSingular : copy.docPlural}`;
  }, [selectedNames, documents, kind, copy.docSingular, copy.docPlural]);

  const shareDocuments = useCallback(async () => {
    if (shareSentRef.current || sharing) return;
    const names = selectedNames.map((n) => n.trim()).filter(Boolean);
    const chId = selectedChannelId.trim();
    if (!names.length) {
      Alert.alert('Share', copy.pickFirst);
      return;
    }
    if (!chId) {
      Alert.alert('Share', 'Select one person to send to.');
      return;
    }
    setSharing(true);
    try {
      await shareErpDocumentsInChat({
        kind,
        documentNames: names,
        channelId: chId,
        sessionEmail: user?.email ?? null,
        channelRows: channels,
      });
      shareSentRef.current = true;
      showQuotationShareSentAndOpenChat({
        navigation: navigation as { dispatch: (action: unknown) => void },
        sessionEmail: user?.email,
        channelId: chId,
        channelRows: channels,
        title: 'Shared',
        body:
          names.length > 1
            ? `${names.length} ${copy.docPlural} were sent in that conversation.`
            : copy.sharedBody,
      });
    } catch (e: unknown) {
      shareSentRef.current = false;
      Alert.error('Share', userFacingError(e, `Could not send the ${copy.docSingular}.`));
    } finally {
      setSharing(false);
    }
  }, [
    sharing,
    selectedNames,
    selectedChannelId,
    user?.email,
    channels,
    navigation,
    kind,
    copy.pickFirst,
    copy.sharedBody,
    copy.docPlural,
    copy.docSingular,
  ]);

  const leaveShareStep = () => {
    if (skipList) {
      navigation.goBack();
      return;
    }
    setShowShareStep(false);
  };

  const onContinueFromList = () => {
    if (selectedNames.length === 0) {
      Alert.alert('Share', copy.pickFirst);
      return;
    }
    setShowShareStep(true);
  };

  const sendLabel =
    selectedNames.length > 1 ? `Send (${selectedNames.length})` : 'Send';

  if (showShareStep && selectedNames.length > 0) {
    return (
      <RavenShareToContactPicker
        screenTitle={copy.screenTitle}
        heroTitle={copy.heroTitle}
        heroName={heroName}
        heroHint={copy.heroHint}
        heroIcon="document-text-outline"
        heroIconColor={Colors.WINE}
        channels={channels}
        channelsLoading={channelsLoading}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
        onBack={leaveShareStep}
        onSkip={leaveShareStep}
        onSend={() => void shareDocuments()}
        sharing={sharing}
        userEmail={user?.email}
        skipLabel="Cancel"
        sendLabel={sendLabel}
        emptyText="No direct messages found. Start a one-to-one conversation in Messages first."
        loadingText="Loading your conversations…"
        searchPlaceholder="Search people"
        filterEmptyText="No people match your search."
      />
    );
  }

  return (
    <SafeAreaView style={flat.screen} edges={['top', 'bottom']}>
      <View style={flat.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={flat.backWrap}>
          <Ionicons name="arrow-back" size={24} color={Colors.BRAND_NAVY} />
        </TouchableOpacity>
        <Text style={flat.topTitle} numberOfLines={1}>
          {copy.title}
        </Text>
        <View style={{ width: 32 }} />
      </View>
      <Text style={flat.topSubtitle}>{copy.pickSubtitle}</Text>
      {selectedNames.length > 0 ? (
        <Text style={flat.pickListHint}>{selectedNames.length} selected</Text>
      ) : null}
      {sidLoading || loadingDocs ? (
        <View style={flat.center}>
          <ActivityIndicator size="large" color={Colors.WINE} />
        </View>
      ) : !supplierDocId ? (
        <View style={flat.center}>
          <Text style={flat.emptyText}>{copy.noSupplier}</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={flat.center}>
          <Text style={flat.emptyText}>{copy.emptyList}</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.listPad}
          renderItem={({ item }) => {
            const selected = selectedNames.includes(item.name);
            return (
              <TouchableOpacity
                style={[flat.documentRow, selected && flat.documentRowSelected]}
                onPress={() => toggleDocument(item.name)}
                activeOpacity={0.85}
              >
                <View style={flat.documentRowMain}>
                  <Text style={flat.documentRowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={flat.documentRowSub} numberOfLines={2}>
                    {listCaption(kind, item)}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? Colors.WINE : Colors.MEDIUM_GRAY}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}
      <View style={flat.pickListFooter}>
        <TouchableOpacity
          style={[
            flat.pickListContinueBtn,
            selectedNames.length === 0 && flat.pickListContinueBtnOff,
          ]}
          onPress={onContinueFromList}
          disabled={selectedNames.length === 0}
          activeOpacity={0.85}
        >
          <Text style={flat.pickListContinueText}>
            {selectedNames.length > 0
              ? `Continue (${selectedNames.length})`
              : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

/** @deprecated Use {@link SupplierErpDocShareScreen} — kept for existing imports. */
export const SupplierQuotationShareScreen = SupplierErpDocShareScreen;

/** Invoice list share — same screen, `kind: 'invoice'`. */
export const SupplierInvoiceShareScreen = SupplierErpDocShareScreen;

const styles = StyleSheet.create({
  listPad: { paddingBottom: Spacing.XL, paddingTop: Spacing.SM },
});
