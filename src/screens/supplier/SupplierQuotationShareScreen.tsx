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
import { useTranslation } from 'react-i18next';
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

function listCaption(kind: ErpDocShareKind, row: DocRow): string {
  const rec = row as Record<string, unknown>;
  return kind === 'invoice' ? salesInvoiceListCaption(rec) : supplierQuotationListCaption(rec);
}

export const SupplierErpDocShareScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<ShareRoute>();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const { supplierDocId, loading: sidLoading } = useSupplierDocumentId();

  const kind: ErpDocShareKind =
    route.params?.kind ?? (route.name === 'SupplierInvoiceShare' ? 'invoice' : 'quotation');
  const copyNs = kind === 'invoice' ? 'supplierErpShare.invoice' : 'supplierErpShare.quotation';
  const copy = useMemo(
    () => ({
      title: t(`${copyNs}.title`),
      pickSubtitle: t(`${copyNs}.pickSubtitle`),
      screenTitle: t(`${copyNs}.screenTitle`),
      heroTitle: t(`${copyNs}.heroTitle`),
      heroHint: t(`${copyNs}.heroHint`),
      emptyList: t(`${copyNs}.emptyList`),
      noSupplier: t(`${copyNs}.noSupplier`),
      pickFirst: t(`${copyNs}.pickFirst`),
      sharedBody: t(`${copyNs}.sharedBody`),
      loadFailed: t(`${copyNs}.loadFailed`),
      sendFailed: t(`${copyNs}.sendFailed`),
    }),
    [t, copyNs]
  );

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
      Alert.error(copy.title, userFacingError(e, copy.loadFailed));
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [supplierDocId, kind, copy.title, copy.loadFailed]);

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
    return t(`${copyNs}.heroCount`, { count: selectedNames.length });
  }, [selectedNames, documents, kind, t, copyNs]);

  const shareDocuments = useCallback(async () => {
    if (shareSentRef.current || sharing) return;
    const names = selectedNames.map((n) => n.trim()).filter(Boolean);
    const chId = selectedChannelId.trim();
    if (!names.length) {
      Alert.alert(t('supplierErpShare.share'), copy.pickFirst);
      return;
    }
    if (!chId) {
      Alert.alert(t('supplierErpShare.share'), t('supplierErpShare.selectOnePerson'));
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
        title: t('supplierErpShare.sharedTitle'),
        body:
          names.length > 1
            ? t(`${copyNs}.sentMany`, { count: names.length })
            : copy.sharedBody,
      });
    } catch (e: unknown) {
      shareSentRef.current = false;
      Alert.error(t('supplierErpShare.share'), userFacingError(e, copy.sendFailed));
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
    t,
    copyNs,
    copy.pickFirst,
    copy.sharedBody,
    copy.sendFailed,
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
      Alert.alert(t('supplierErpShare.share'), copy.pickFirst);
      return;
    }
    setShowShareStep(true);
  };

  const sendLabel =
    selectedNames.length > 1
      ? t('supplierErpShare.sendN', { count: selectedNames.length })
      : t('supplierErpShare.send');

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
        skipLabel={t('supplierErpShare.cancel')}
        sendLabel={sendLabel}
        emptyText={t('supplierErpShare.emptyDm')}
        loadingText={t('supplierErpShare.loadingConvos')}
        searchPlaceholder={t('supplierErpShare.searchPeople')}
        filterEmptyText={t('supplierErpShare.filterEmpty')}
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
        <Text style={flat.pickListHint}>{t('supplierErpShare.selectedCount', { count: selectedNames.length })}</Text>
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
              ? t('supplierErpShare.continueN', { count: selectedNames.length })
              : t('supplierErpShare.continue')}
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
