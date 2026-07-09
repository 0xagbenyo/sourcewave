import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { appAlert as Alert } from '../../services/appAlert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { useSupplierDocumentId } from '../../hooks/useSupplierDocumentId';
import { useUserSession } from '../../context/UserContext';
import { getERPNextClient } from '../../services/erpnext';
import {
  listRavenChannelsForSessionUser,
  type RavenChannelRow,
} from '../../services/ravenNativeApi';
import { notifyQuotationEditedInChat, resolveErpDocChatThread } from '../../utils/erpDocChatStatusReply';
import { shareSupplierQuotationInChat } from '../../utils/shareSupplierQuotationInChat';
import { showQuotationShareSentAndOpenChat } from '../../utils/openRavenChatAfterShare';
import { userFacingError } from '../../utils/userFacingError';
import type { RootStackParamList } from '../../types';
import { ErpAuthenticatedImage } from '../../components/ErpAuthenticatedImage';
import { RavenShareToContactPicker } from '../../components/RavenShareToContactPicker';
import { useSupplierComposeLeave } from '../../context/SupplierComposeLeaveContext';
import { useSupplierComposeChrome } from '../../context/SupplierComposeChromeContext';
import { imagePickLabelsFromT, pickSingleFormImage } from '../../utils/formImagePicker';
import { useTranslation } from 'react-i18next';
import { pickLineDisplayImageUri } from '../../utils/erpLineItemImages';
import { isLocalMediaUri } from '../../utils/localMediaUri';
import {
  quotationLinesFromSalesOrder,
  quotationLinesFromSupplierQuotation,
} from '../../utils/salesOrderToQuotationLines';
import {
  calcErpLineTotalWeight,
  cbmToKg,
  formatErpLineWeight,
  kgToCbm,
  parseErpWeightInput,
} from '../../utils/erpLineWeight';
import { formatErpDocDate } from '../../components/ErpDocumentPreviewLayout';
import {
  defaultQuotationValidTillDate,
  erpDateFromIso,
  erpDateIsoToday,
  erpDateToIso,
  readErpDateField,
} from '../../utils/erpDateInput';

type R = RouteProp<RootStackParamList, 'SupplierQuotationCompose'>;

/** `image` is the Item master **image** attach field (not website image). */
type ItemSearchHit = { name: string; item_code: string; item_name: string; stock_uom?: string; image?: string };

type QuotationLine = {
  key: string;
  item_code: string;
  item_name: string;
  stock_uom?: string;
  /** Item `image` for UI only (not sent to ERPNext on save). */
  item_image?: string;
  /** Supplier-attached image URL (persisted on quotation line). */
  supplier_image?: string;
  /** Local file picked by supplier before save. */
  supplier_image_uri?: string;
  qty: string;
  rate: string;
  /** Buyer budget from linked Sales Order (hint only). */
  buyer_budget?: string;
  weight_per_unit: string;
  weight_per_unit_cbm: string;
  total_weight: string;
  /** UI-only: whether the editable fields for this line are shown. */
  expanded: boolean;
};

function newLine(): QuotationLine {
  return {
    key: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    item_code: '',
    item_name: '',
    stock_uom: undefined,
    qty: '1',
    rate: '',
    weight_per_unit: '',
    weight_per_unit_cbm: '',
    total_weight: '',
    expanded: true,
  };
}

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

function derivedLineWeights(ln: Pick<QuotationLine, 'qty' | 'weight_per_unit' | 'weight_per_unit_cbm'>): {
  weightPerUnitKg: number;
  weightPerUnitCbm: number;
  totalWeightKg: number;
  totalWeightCbm: number;
} {
  const kgEntered = parseErpWeightInput(ln.weight_per_unit);
  const cbmEntered = parseErpWeightInput(ln.weight_per_unit_cbm);
  const weightPerUnitKg = kgEntered ?? (cbmEntered != null ? cbmToKg(cbmEntered) : 0);
  const weightPerUnitCbm = cbmEntered ?? (kgEntered != null ? kgToCbm(kgEntered) : 0);
  const qty = parseErpWeightInput(ln.qty) ?? 0;
  const totalWeightKg =
    qty > 0 && weightPerUnitKg > 0 ? Math.round(weightPerUnitKg * qty * 1000) / 1000 : 0;
  const totalWeightCbm =
    qty > 0 && weightPerUnitCbm > 0 ? Math.round(weightPerUnitCbm * qty * 1000) / 1000 : 0;
  return { weightPerUnitKg, weightPerUnitCbm, totalWeightKg, totalWeightCbm };
}

export const SupplierQuotationComposeScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<R>();
  const insets = useSafeAreaInsets();
  const composeLeave = useSupplierComposeLeave();
  const composeChrome = useSupplierComposeChrome();
  const exitCompose = useCallback(() => {
    if (composeLeave) composeLeave();
    else navigation.goBack();
  }, [composeLeave, navigation]);
  const { user } = useUserSession();
  const { t } = useTranslation();
  const paramChannelId = (route.params?.ravenChannelId || '').trim();
  const paramSalesOrderName = (route.params?.salesOrderName || '').trim();
  const paramQuotationName = (route.params?.quotationName || '').trim();
  const paramResendFromQuotation = (route.params?.resendFromQuotation || '').trim();
  const paramLinkMessageId = (route.params?.linkMessageId || '').trim();
  const editMode = !!paramQuotationName;
  const resendMode = !!paramResendFromQuotation;
  const { supplierDocId, loading: supplierLinkLoading, error: supplierLinkError } = useSupplierDocumentId();

  /** After ERPNext create — user picks a DM and taps Send. */
  const [createdQuotation, setCreatedQuotation] = useState<{ name: string; cardTitle: string } | null>(null);
  const [channels, setChannels] = useState<RavenChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedShareChannelId, setSelectedShareChannelId] = useState<string>('');
  const [sharing, setSharing] = useState(false);

  const [referenceTitle, setReferenceTitle] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [validTillDate, setValidTillDate] = useState(defaultQuotationValidTillDate);
  const [validTillPickerOpen, setValidTillPickerOpen] = useState(false);
  const [transactionDate, setTransactionDate] = useState(erpDateIsoToday);
  const [lines, setLines] = useState<QuotationLine[]>(() => [newLine()]);
  const [saving, setSaving] = useState(false);
  const [loadingFromOrder, setLoadingFromOrder] = useState(
    !!paramSalesOrderName || !!paramQuotationName || !!paramResendFromQuotation
  );
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<ItemSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validTillMinimum = useMemo(
    () => erpDateFromIso(transactionDate) ?? undefined,
    [transactionDate]
  );

  const onValidTillPickerChange = useCallback(
    (event: { type: string }, date?: Date) => {
      if (Platform.OS === 'android') {
        setValidTillPickerOpen(false);
        if (event.type === 'dismissed') return;
      }
      if (date) setValidTillDate(date);
    },
    []
  );

  const runItemSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const sup = String(supplierDocId || '').trim();
      if (!sup) {
        setSearchHits([]);
        return;
      }
      const rows = await getERPNextClient().searchItemsForQuotation({
        supplier: sup,
        q: q.trim(),
        limit: 30,
      });
      setSearchHits(rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load items.';
      setSearchHits([]);
      Alert.alert('Items', msg);
    } finally {
      setSearchLoading(false);
    }
  }, [supplierDocId]);

  useEffect(() => {
    if (!paramSalesOrderName && !paramQuotationName && !paramResendFromQuotation) return;
    let cancelled = false;
    setLoadingFromOrder(true);
    setOrderLoadError(null);
    void (async () => {
      try {
        if (paramQuotationName || paramResendFromQuotation) {
          const loadName = paramQuotationName || paramResendFromQuotation;
          const raw = await getERPNextClient().getSupplierQuotationByName(loadName);
          if (cancelled) return;
          if (!raw) {
            setOrderLoadError('Quotation not found.');
            return;
          }
          const mapped = quotationLinesFromSupplierQuotation(raw as Record<string, unknown>);
          if (mapped.lines.length === 0) {
            setOrderLoadError('This quotation has no line items.');
            setLines([newLine()]);
          } else {
            const resolved = await getERPNextClient().resolveSupplierQuotationLineImages(
              loadName,
              Array.isArray(raw?.items) ? (raw.items as Record<string, unknown>[]) : [],
              mapped.salesOrderName
            );
            setLines(
              mapped.lines.map((ln) => ({
                ...ln,
                item_image: resolved.fallback[ln.item_code] || ln.item_image,
                supplier_image: resolved.supplier[ln.item_code] || ln.supplier_image,
                expanded: true,
              }))
            );
          }
          if (mapped.referenceTitle) setReferenceTitle(mapped.referenceTitle);
          if (mapped.currency) setCurrency(mapped.currency);
          if (mapped.validTill) {
            const d = erpDateFromIso(mapped.validTill);
            if (d) setValidTillDate(d);
          }
          if (mapped.transactionDate) setTransactionDate(mapped.transactionDate);
          else setTransactionDate(readErpDateField(raw?.transaction_date) || erpDateIsoToday());
          return;
        }

        const raw = await getERPNextClient().getSalesOrder(paramSalesOrderName);
        if (cancelled) return;
        setTransactionDate(erpDateIsoToday());
        setValidTillDate(defaultQuotationValidTillDate());
        const mapped = quotationLinesFromSalesOrder(raw);
        if (mapped.lines.length === 0) {
          setOrderLoadError('This order has no line items to quote.');
          setLines([newLine()]);
        } else {
          // Start collapsed when quoting an existing order — supplier expands to make changes.
          setLines(mapped.lines.map((ln) => ({ ...ln, expanded: false })));
        }
        if (mapped.referenceTitle) setReferenceTitle(mapped.referenceTitle);
        if (mapped.currency) setCurrency(mapped.currency);
      } catch (e: unknown) {
        if (!cancelled) {
          setOrderLoadError(userFacingError(e, 'Could not load this sourcing request.'));
        }
      } finally {
        if (!cancelled) setLoadingFromOrder(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramSalesOrderName, paramQuotationName, paramResendFromQuotation]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void runItemSearch(searchQ);
    }, 280);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [pickerOpen, searchQ, runItemSearch]);

  const loadRavenChannels = useCallback(async () => {
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
    if (!createdQuotation) return;
    const pre = paramChannelId;
    setSelectedShareChannelId(pre ? pre : '');
    void loadRavenChannels();
  }, [createdQuotation?.name, paramChannelId, loadRavenChannels]);

  useEffect(() => {
    if (!createdQuotation || channelsLoading || channels.length === 0) return;
    const id = selectedShareChannelId.trim();
    if (!id) return;
    const row = channels.find((c) => c.name === id);
    if (row && !isDmChannel(row)) setSelectedShareChannelId('');
  }, [createdQuotation, channels, channelsLoading, selectedShareChannelId]);

  const openPickerForLine = (lineKey: string) => {
    setPickerLineKey(lineKey);
    setSearchQ('');
    setSearchHits([]);
    setPickerOpen(true);
    void runItemSearch('');
  };

  const pickLineImage = async (lineKey: string) => {
    const result = await pickSingleFormImage(imagePickLabelsFromT(t));
    if (result.ok) {
      updateLine(lineKey, { supplier_image_uri: result.uri });
      return;
    }
    if (!result.canceled) {
      Alert.alert('Photos', result.message);
    }
  };

  const applyItemToLine = (hit: ItemSearchHit) => {
    if (!pickerLineKey) return;
    setLines((prev) =>
      prev.map((ln) =>
        ln.key === pickerLineKey
          ? {
              ...ln,
              item_code: hit.item_code,
              item_name: hit.item_name,
              stock_uom: hit.stock_uom,
              item_image: hit.image,
            }
          : ln
      )
    );
    setPickerOpen(false);
    setPickerLineKey(null);
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };
  const toggleLineExpanded = (key: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, expanded: !l.expanded } : l)));
  };

  const updateLine = (
    key: string,
    patch: Partial<
      Pick<
        QuotationLine,
        'qty' | 'rate' | 'item_name' | 'supplier_image_uri' | 'weight_per_unit' | 'weight_per_unit_cbm' | 'total_weight'
      >
    >
  ) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if ('qty' in patch || 'weight_per_unit' in patch) {
          const { totalWeightKg } = derivedLineWeights(next);
          next.total_weight = totalWeightKg > 0 ? formatErpLineWeight(totalWeightKg) : '';
        }
        return next;
      })
    );
  };

  const updateLineWeightKg = (key: string, rawValue: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l };
        const canonicalWeightPerUnit = parseErpWeightInput(rawValue);
        next.weight_per_unit = rawValue;
        if (!String(next.weight_per_unit_cbm || '').trim() && canonicalWeightPerUnit != null) {
          next.weight_per_unit_cbm = formatErpLineWeight(kgToCbm(canonicalWeightPerUnit));
        }
        const { totalWeightKg } = derivedLineWeights(next);
        next.total_weight = totalWeightKg > 0 ? formatErpLineWeight(totalWeightKg) : '';
        return next;
      })
    );
  };

  const updateLineWeightCbm = (key: string, rawValue: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l };
        const cbmValue = parseErpWeightInput(rawValue);
        const canonicalWeightPerUnit = cbmValue == null ? null : cbmToKg(cbmValue);
        next.weight_per_unit_cbm = rawValue;
        if (!String(next.weight_per_unit || '').trim() && canonicalWeightPerUnit != null) {
          next.weight_per_unit = formatErpLineWeight(canonicalWeightPerUnit);
        }
        const { totalWeightKg } = derivedLineWeights(next);
        next.total_weight = totalWeightKg > 0 ? formatErpLineWeight(totalWeightKg) : '';
        return next;
      })
    );
  };

  const lineTotal = (ln: QuotationLine): number => {
    const q = parseFloat(String(ln.qty).replace(/,/g, ''));
    const r = parseFloat(String(ln.rate).replace(/,/g, ''));
    if (!Number.isFinite(q) || !Number.isFinite(r)) return 0;
    return q * r;
  };

  const grandPreview = useMemo(() => lines.reduce((s, ln) => s + lineTotal(ln), 0), [lines]);

  const shareQuotationToChannel = useCallback(
    async (
      chId: string,
      quotation: { name: string; cardTitle: string },
      channelRows?: RavenChannelRow[],
      opts?: { replyToMessageId?: string }
    ) => {
      const rows = channelRows ?? channels;
      await shareSupplierQuotationInChat({
        quotationName: quotation.name,
        channelId: chId,
        sessionEmail: user?.email ?? null,
        cardTitle: quotation.cardTitle,
        channelRows: rows,
        replyToMessageId: opts?.replyToMessageId || paramLinkMessageId || undefined,
        resendFromQuotation: paramResendFromQuotation || undefined,
      });
    },
    [channels, user?.email, paramLinkMessageId, paramResendFromQuotation]
  );

  const onCreateQuotation = async () => {
    if (supplierLinkLoading) {
      Alert.alert('Supplier', 'Still resolving your Supplier link — try again in a moment.');
      return;
    }
    if (!supplierDocId) {
      Alert.alert(
        'Supplier',
        userFacingError(supplierLinkError, 'Your account is not linked to a supplier profile. Contact your administrator.')
      );
      return;
    }

    const payloadLines: Array<{
      item_code: string;
      qty: number;
      rate: number;
      uom?: string | null;
      description?: string | null;
      custom_new_image?: string | null;
      weight_per_unit?: number | null;
      total_weight?: number | null;
      custom_weight_kg?: number | null;
      custom_total_weight_kg?: number | null;
      custom_weight_cbm?: number | null;
      custom_total_weight_cbm?: number | null;
    }> = [];
    for (const ln of lines) {
      const code = ln.item_code.trim();
      if (!code) continue;
      const qty = parseFloat(String(ln.qty).replace(/,/g, ''));
      const rate = parseFloat(String(ln.rate).replace(/,/g, ''));
      if (!Number.isFinite(qty) || qty <= 0) {
        Alert.alert('Quotation', `Enter a valid quantity for ${ln.item_name.trim() || code}.`);
        return;
      }
      if (!Number.isFinite(rate) || rate < 0) {
        Alert.alert('Quotation', `Enter a valid quote rate for ${ln.item_name.trim() || code}.`);
        return;
      }
      const description = ln.item_name.trim() || undefined;
      const persistedImage = String(ln.supplier_image || '').trim() || null;
      const weightPerUnit = parseErpWeightInput(ln.weight_per_unit);
      const weightPerUnitCbm = parseErpWeightInput(ln.weight_per_unit_cbm);
      const derived = derivedLineWeights(ln);
      const resolvedWeightPerUnitKg =
        weightPerUnit != null ? weightPerUnit : derived.weightPerUnitKg > 0 ? derived.weightPerUnitKg : null;
      const resolvedTotalWeightKg = derived.totalWeightKg > 0 ? derived.totalWeightKg : null;
      payloadLines.push({
        item_code: code,
        qty,
        rate,
        uom: ln.stock_uom?.trim() || null,
        description: description || null,
        custom_new_image: persistedImage,
        weight_per_unit: resolvedWeightPerUnitKg,
        total_weight: resolvedTotalWeightKg,
        custom_weight_kg: resolvedWeightPerUnitKg,
        custom_total_weight_kg: resolvedTotalWeightKg,
        custom_weight_cbm: weightPerUnitCbm,
        custom_total_weight_cbm: derived.totalWeightCbm > 0 ? derived.totalWeightCbm : null,
      });
    }

    if (payloadLines.length === 0) {
      Alert.alert('Quotation', 'Add at least one line and choose an item from the catalogue for each line.');
      return;
    }

    const parsedValidTill = erpDateToIso(validTillDate);
    if (parsedValidTill < transactionDate) {
      Alert.alert(t('quotationDetails.composeTitle'), t('quotationDetails.validToBeforeQuoteDate'));
      return;
    }

    setSaving(true);
    try {
      const client = getERPNextClient();
      let linkedOrderName = paramSalesOrderName;
      if (!linkedOrderName && (resendMode || editMode)) {
        const srcName = paramResendFromQuotation || paramQuotationName;
        if (srcName) {
          const src = await client.getSupplierQuotationByName(srcName);
          const orderField =
            String(process.env.EXPO_PUBLIC_ERPNEXT_SQ_ORDER_LINK_FIELD || 'custom_order').trim() || 'custom_order';
          linkedOrderName = String(src?.[orderField] || '').trim();
        }
      }

      let quotation: { name: string; cardTitle: string };

      if (editMode && paramQuotationName) {
        const updated = await client.updateSupplierQuotationDraft(paramQuotationName, {
          currency: currency.trim() || 'GHS',
          referenceTitle: referenceTitle.trim() || undefined,
          valid_till: parsedValidTill,
          lines: payloadLines,
        });
        const cardTitle =
          referenceTitle.trim() ||
          (lines.find((l) => l.item_name.trim())?.item_name ?? '').trim() ||
          `${payloadLines.length} item(s)`;
        quotation = { name: updated.name, cardTitle };
      } else {
        const created = await client.createSupplierQuotationFromChat({
          supplier: supplierDocId,
          currency: currency.trim() || 'GHS',
          referenceTitle: referenceTitle.trim() || undefined,
          salesOrderName: linkedOrderName || undefined,
          valid_till: parsedValidTill,
          lines: payloadLines,
        });
        const cardTitle =
          referenceTitle.trim() ||
          (lines.find((l) => l.item_name.trim())?.item_name ?? '').trim() ||
          `${payloadLines.length} item(s)`;
        quotation = { name: created.name, cardTitle };
      }

      const pendingUploads = lines.filter(
        (ln) => ln.supplier_image_uri && ln.item_code.trim()
      );
      if (pendingUploads.length) {
        const withImages = [...payloadLines];
        for (const ln of pendingUploads) {
          try {
            const url = await client.uploadDocLineImage(
              ln.supplier_image_uri!,
              `sq-line-${ln.item_code.trim()}-${Date.now()}.jpg`,
              'Supplier Quotation',
              quotation.name
            );
            if (!url) continue;
            const idx = withImages.findIndex((p) => p.item_code === ln.item_code.trim());
            if (idx >= 0) withImages[idx] = { ...withImages[idx], custom_new_image: url };
          } catch (e) {
            console.warn('[SupplierQuotation] line image upload failed:', e);
          }
        }
        try {
          await client.updateSupplierQuotationDraft(quotation.name, {
            currency: currency.trim() || 'GHS',
            referenceTitle: referenceTitle.trim() || undefined,
            valid_till: parsedValidTill,
            lines: withImages,
          });
        } catch (e) {
          console.warn('[SupplierQuotation] could not persist line images on draft:', e);
        }
      }

      if (editMode && paramQuotationName) {
        notifyQuotationEditedInChat(quotation.name, {
          ravenChannelId: paramChannelId || undefined,
          sessionEmail: user?.email ?? null,
        });
        Alert.success('Saved', 'Your quotation was updated. The buyer will see your reply in chat.', [
          { text: 'OK', onPress: () => exitCompose() },
        ]);
        return;
      }

      const chatChannelId = await (async () => {
        const chId = paramChannelId.trim();
        if (chId) return chId;
        if (resendMode && paramResendFromQuotation) {
          const thread = await resolveErpDocChatThread({
            linkDoctype: 'Supplier Quotation',
            linkDocument: paramResendFromQuotation,
            linkMessageId: paramLinkMessageId || undefined,
            sessionEmail: user?.email ?? null,
          });
          const resolved = thread?.channelId?.trim();
          if (resolved) return resolved;
        }
        // Quoting against a shared Sales Order — return to the chat where the order was shared.
        if (linkedOrderName) {
          const thread = await resolveErpDocChatThread({
            linkDoctype: 'Sales Order',
            linkDocument: linkedOrderName,
            sessionEmail: user?.email ?? null,
          });
          const resolved = thread?.channelId?.trim();
          if (resolved) return resolved;
        }
        return '';
      })();

      if (chatChannelId) {
        const channelRows =
          channels.find((c) => c.name === chatChannelId) != null
            ? channels
            : await listRavenChannelsForSessionUser(user?.email ?? null);
        let replyToMessageId = paramLinkMessageId;
        if (!replyToMessageId && paramResendFromQuotation) {
          const thread = await resolveErpDocChatThread({
            linkDoctype: 'Supplier Quotation',
            linkDocument: paramResendFromQuotation,
            ravenChannelId: chatChannelId,
            sessionEmail: user?.email ?? null,
          });
          if (thread?.replyToMessageId) replyToMessageId = thread.replyToMessageId;
        }
        await shareQuotationToChannel(chatChannelId, quotation, channelRows, {
          replyToMessageId: replyToMessageId || undefined,
        });
        // Return to the chat the supplier came from (works in both the main app and supplier portal).
        Alert.success(
          'Shared',
          'Your new quotation was sent as a reply in this conversation.',
          [{ text: 'OK', onPress: () => exitCompose() }]
        );
        return;
      }

      setCreatedQuotation(quotation);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save quotation.';
      Alert.error('Quotation', msg);
    } finally {
      setSaving(false);
    }
  };

  const onShareToSelected = async () => {
    const chId = selectedShareChannelId.trim();
    if (!createdQuotation || !chId) {
      Alert.alert('Share', 'Select one person to send the link to.');
      return;
    }
    setSharing(true);
    try {
      await shareQuotationToChannel(chId, createdQuotation);
      showQuotationShareSentAndOpenChat({
        navigation: navigation as { dispatch: (action: unknown) => void },
        sessionEmail: user?.email,
        channelId: chId,
        channelRows: channels,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not send the message.';
      Alert.error('Share', msg);
    } finally {
      setSharing(false);
    }
  };

  const onShareSkip = () => {
    if (!createdQuotation) {
      exitCompose();
      return;
    }
    Alert.alert(
      'Skip sharing?',
      `Quotation ${createdQuotation.name} is saved. You can share a link from Messages later.`,
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => exitCompose() },
      ]
    );
  };

  const onShareBack = () => {
    if (!createdQuotation) {
      exitCompose();
      return;
    }
    Alert.alert('Leave?', 'Your quotation is saved. You can share it later from Messages.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', onPress: () => exitCompose() },
    ]);
  };

  useEffect(() => {
    composeChrome?.setShareActive(!!createdQuotation);
    return () => composeChrome?.setShareActive(false);
  }, [createdQuotation, composeChrome]);

  const sharePickerLayout = composeLeave ? 'embedded' : 'screen';

  return (
    <>
      {createdQuotation ? (
        <RavenShareToContactPicker
          layout={sharePickerLayout}
          screenTitle="Send quotation"
          heroTitle="Quotation saved"
          heroName={createdQuotation.name}
          heroHint="Choose who should receive the link in chat."
          heroIcon="document-text-outline"
          heroIconColor={Colors.WINE}
          channels={channels}
          channelsLoading={channelsLoading}
          selectedChannelId={selectedShareChannelId}
          onSelectChannel={setSelectedShareChannelId}
          onBack={onShareBack}
          onSkip={onShareSkip}
          onSend={() => void onShareToSelected()}
          sharing={sharing}
          userEmail={user?.email}
        />
      ) : (
      <SafeAreaView style={styles.safe} edges={composeLeave ? [] : ['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {composeLeave && !createdQuotation ? null : (
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => exitCompose()} hitSlop={12} style={styles.backWrap}>
              <Ionicons name="arrow-back" size={24} color={Colors.BLACK} />
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              {editMode
                ? 'Edit quotation'
                : resendMode
                  ? 'Revise quotation'
                  : paramSalesOrderName
                    ? 'Quote sourcing request'
                    : 'New quotation'}
            </Text>
            <View style={{ width: 32 }} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {supplierLinkLoading ? (
            <View style={styles.linkBanner}>
              <ActivityIndicator color="#636366" size="small" />
              <Text style={styles.linkBannerText}>Linking your account to a Supplier…</Text>
            </View>
          ) : supplierLinkError && !supplierDocId ? (
            <View style={[styles.linkBanner, styles.linkBannerErr]}>
              <Ionicons name="warning-outline" size={20} color={Colors.WINE} style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>{supplierLinkError}</Text>
            </View>
          ) : null}

          {loadingFromOrder ? (
            <View style={styles.linkBanner}>
              <ActivityIndicator color="#636366" size="small" />
              <Text style={styles.linkBannerText}>Loading sourcing request…</Text>
            </View>
          ) : orderLoadError ? (
            <View style={[styles.linkBanner, styles.linkBannerErr]}>
              <Ionicons name="warning-outline" size={20} color={Colors.WINE} style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>{orderLoadError}</Text>
            </View>
          ) : editMode ? (
            <View style={styles.linkBanner}>
              <Ionicons name="create-outline" size={18} color="#636366" style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>
                Update lines and save. The buyer gets a chat reply on your quotation — no new file is sent.
              </Text>
            </View>
          ) : resendMode ? (
            <View style={styles.linkBanner}>
              <Ionicons name="refresh-outline" size={18} color="#636366" style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>
                Revise your rejected quote and send a new quotation for the same order.
              </Text>
            </View>
          ) : paramSalesOrderName ? (
            <View style={styles.linkBanner}>
              <Ionicons name="cart-outline" size={18} color="#636366" style={{ marginRight: 8 }} />
              <Text style={styles.linkBannerText}>
                From order {paramSalesOrderName}. Edit lines, then save and send your quotation.
              </Text>
            </View>
          ) : null}

          <View style={styles.composeSheet}>
            {supplierDocId ? (
              <View style={styles.supplierRow}>
                <Ionicons name="briefcase-outline" size={15} color="#8E8E93" style={{ marginRight: 8 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.supplierRowLabel}>Supplier</Text>
                  <Text style={styles.supplierRowId} numberOfLines={2}>
                    {supplierDocId}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.refCurrRow}>
              <View style={styles.refField}>
                <Text style={styles.fieldLabel}>Reference</Text>
                <TextInput
                  style={styles.inputBox}
                  value={referenceTitle}
                  onChangeText={setReferenceTitle}
                  placeholder="Optional"
                  placeholderTextColor="#AEAEB2"
                />
              </View>
              <View style={styles.currField}>
                <Text style={styles.fieldLabel}>Currency</Text>
                <TextInput
                  style={[styles.inputBox, styles.inputBoxCurr]}
                  value={currency}
                  onChangeText={setCurrency}
                  placeholder="GHS"
                  autoCapitalize="characters"
                  maxLength={6}
                  placeholderTextColor="#AEAEB2"
                />
              </View>
            </View>

            <View style={styles.validToRow}>
              <Text style={styles.fieldLabel}>{t('quotationDetails.validTo')}</Text>
              <TouchableOpacity
                style={styles.dateFieldBtn}
                onPress={() => setValidTillPickerOpen(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('quotationDetails.validTo')}
              >
                <Text style={styles.dateFieldVal}>
                  {formatErpDocDate(erpDateToIso(validTillDate)) || t('quotationDetails.validToPlaceholder')}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#8E8E93" />
              </TouchableOpacity>
              {validTillPickerOpen ? (
                <DateTimePicker
                  value={validTillDate}
                  mode="date"
                  minimumDate={validTillMinimum}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onValidTillPickerChange}
                />
              ) : null}
              {Platform.OS === 'ios' && validTillPickerOpen ? (
                <TouchableOpacity
                  style={styles.iosPickerDone}
                  onPress={() => setValidTillPickerOpen(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.iosPickerDoneText}>Done</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.fieldHint}>{t('quotationDetails.validToHint')}</Text>
            </View>

            <View style={styles.sheetDivider} />

            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>Line items</Text>
              <TouchableOpacity onPress={addLine} hitSlop={10} style={styles.addLineBtn} activeOpacity={0.6}>
                <Text style={styles.addLineBtnText}>+ Add line</Text>
              </TouchableOpacity>
            </View>

            {lines.map((ln, lineIdx) => {
              const { totalWeightKg, totalWeightCbm } = derivedLineWeights(ln);
              const lineImageUri = pickLineDisplayImageUri(
                ln.supplier_image_uri || ln.supplier_image,
                ln.item_image
              );
              const lineImageIsLocal = isLocalMediaUri(ln.supplier_image_uri);

              return (
              <View key={ln.key} style={styles.lineBlock}>
                <View style={styles.lineBlockTop}>
                  <TouchableOpacity
                    style={styles.lineHeaderTap}
                    onPress={() => toggleLineExpanded(ln.key)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={ln.expanded ? 'Collapse line' : 'Expand line to edit'}
                  >
                    <Ionicons
                      name={ln.expanded ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#636366"
                      style={{ marginRight: 6 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineIndex}>Line {lineIdx + 1}</Text>
                      {!ln.expanded ? (
                        <Text style={styles.lineCollapsedSummary} numberOfLines={1}>
                          {(ln.item_name || ln.item_code || 'Item').trim()} · {ln.qty || '0'} ×{' '}
                          {currency.trim() || '—'}{' '}
                          {lineTotal(ln).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeLine(ln.key)}
                    hitSlop={10}
                    disabled={lines.length <= 1}
                    accessibilityLabel="Remove line"
                  >
                    <Text style={[styles.lineRemoveText, lines.length <= 1 && styles.lineRemoveTextOff]}>Remove</Text>
                  </TouchableOpacity>
                </View>

                {ln.expanded ? (
                <>
                <View style={styles.itemRow}>
                  <TouchableOpacity
                    style={styles.itemRowThumb}
                    onPress={() => void pickLineImage(ln.key)}
                    accessibilityLabel="Attach item image"
                    activeOpacity={0.75}
                  >
                    {lineImageUri ? (
                      lineImageIsLocal ? (
                        <Image
                          source={{ uri: lineImageUri }}
                          style={styles.itemRowThumbImg}
                          contentFit="cover"
                        />
                      ) : (
                        <ErpAuthenticatedImage
                          key={lineImageUri}
                          uri={lineImageUri}
                          style={styles.itemRowThumbImg}
                          resizeMode="cover"
                        />
                      )
                    ) : (
                      <Ionicons name="camera-outline" size={20} color="#C7C7CC" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.itemRowMain}
                    onPress={() => openPickerForLine(ln.key)}
                    accessibilityLabel="Select item"
                    activeOpacity={0.65}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemRowCode} numberOfLines={1}>
                        {ln.item_code || 'Select item'}
                      </Text>
                      {ln.item_name ? (
                        <Text style={styles.itemRowName} numberOfLines={2}>
                          {ln.item_name}
                        </Text>
                      ) : (
                        <Text style={styles.itemRowPlaceholder}>Search catalogue</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.itemImageHint}>Tap photo to attach your own image (buyer reference shown if none).</Text>

                <View style={styles.nameFieldWrap}>
                  <Text style={styles.qtyRateLabel}>Item name</Text>
                  <TextInput
                    style={styles.inputBox}
                    value={ln.item_name}
                    onChangeText={(t) => updateLine(ln.key, { item_name: t })}
                    placeholder="Description shown on the quotation"
                    placeholderTextColor="#AEAEB2"
                  />
                </View>

                <View style={styles.qtyRateRow}>
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Quantity</Text>
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.qty}
                      onChangeText={(t) => updateLine(ln.key, { qty: t })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                  <View style={styles.qtyRateGap} />
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Quote rate ({currency.trim() || '—'})</Text>
                    {ln.buyer_budget ? (
                      <Text style={styles.budgetHint}>Buyer budget: {ln.buyer_budget}</Text>
                    ) : null}
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.rate}
                      onChangeText={(t) => updateLine(ln.key, { rate: t })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                </View>
                <View style={styles.qtyRateRow}>
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Weight per unit (KG)</Text>
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.weight_per_unit}
                      onChangeText={(t) => updateLineWeightKg(ln.key, t)}
                      keyboardType="decimal-pad"
                      placeholder="KG"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                  <View style={styles.qtyRateGap} />
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Total weight (KG)</Text>
                    <TextInput
                      style={[styles.qtyRateInput, styles.readOnlyWeightInput]}
                      value={totalWeightKg > 0 ? formatErpLineWeight(totalWeightKg) : ''}
                      editable={false}
                      placeholder="Auto"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                </View>
                <View style={styles.qtyRateRow}>
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Per unit (CBM)</Text>
                    <TextInput
                      style={styles.qtyRateInput}
                      value={ln.weight_per_unit_cbm}
                      onChangeText={(t) => updateLineWeightCbm(ln.key, t)}
                      keyboardType="decimal-pad"
                      placeholder="CBM"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                  <View style={styles.qtyRateGap} />
                  <View style={styles.qtyRateCell}>
                    <Text style={styles.qtyRateLabel}>Total (CBM)</Text>
                    <TextInput
                      style={[styles.qtyRateInput, styles.readOnlyWeightInput]}
                      value={totalWeightCbm > 0 ? formatErpLineWeight(totalWeightCbm) : ''}
                      editable={false}
                      placeholder="Auto"
                      placeholderTextColor="#AEAEB2"
                    />
                  </View>
                </View>
                <View style={styles.lineSubtotal}>
                  <Text style={styles.lineSubtotalLabel}>Amount</Text>
                  <Text style={styles.lineSubtotalValue}>
                    {currency.trim() || '—'}{' '}
                    {lineTotal(ln).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                </>
                ) : null}
              </View>
            );
            })}

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Quote budget</Text>
              <Text style={styles.grandTotalValue}>
                {currency.trim()}{' '}
                {grandPreview.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.SM) + Spacing.SM }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnOff]}
            onPress={() => void onCreateQuotation()}
            disabled={saving || supplierLinkLoading || !supplierDocId || loadingFromOrder}
          >
            {saving ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Text style={styles.saveText}>
                {editMode ? 'Save changes' : resendMode ? 'Save & send new quote' : 'Save quotation'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Select item</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={Colors.BLACK} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search by code or name…"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color="#636366" />
              </View>
            ) : (
              <FlatList
                data={searchHits}
                keyExtractor={(it) => `${it.name}::${it.item_code}`}
                keyboardShouldPersistTaps="handled"
                style={styles.hitList}
                ListEmptyComponent={
                  <Text style={styles.emptyHits}>
                    {!String(supplierDocId || '').trim()
                      ? 'Your account must be linked to a Supplier to browse items.'
                      : 'No items found for your supplier. Try another search.'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.hitRow} onPress={() => applyItemToLine(item)} activeOpacity={0.7}>
                    <View style={styles.hitThumb}>
                      {item.image ? (
                        <ErpAuthenticatedImage uri={item.image} style={styles.hitThumbImg} resizeMode="cover" />
                      ) : (
                        <Ionicons name="cube-outline" size={22} color={Colors.TEXT_SECONDARY} />
                      )}
                    </View>
                    <View style={styles.hitTextCol}>
                      <Text style={styles.hitCode} numberOfLines={1}>
                        {item.item_code}
                      </Text>
                      <Text style={styles.hitName} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                      {item.stock_uom ? <Text style={styles.hitUom}>{item.stock_uom}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
      </SafeAreaView>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E8E8ED' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    paddingTop: 2,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  backWrap: { padding: 8 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  scroll: { paddingHorizontal: Spacing.MD, paddingTop: 12, paddingBottom: 120 },
  linkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  linkBannerErr: { borderColor: '#C62828', backgroundColor: '#FEF2F2' },
  linkBannerText: { flex: 1, fontSize: 14, color: '#3A3A3C', lineHeight: 19 },
  composeSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    marginBottom: Spacing.MD,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  supplierRowLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 4 },
  supplierRowId: { fontSize: 14, fontWeight: '500', color: '#1C1C1E', lineHeight: 20 },
  refCurrRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  refField: { flex: 1, marginRight: 12 },
  currField: { width: 88 },
  validToRow: { marginBottom: 4 },
  dateFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#C6C6C8',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    backgroundColor: '#FFFFFF',
  },
  dateFieldVal: {
    fontSize: 15,
    fontWeight: '400',
    color: '#1C1C1E',
  },
  iosPickerDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerDoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WINE,
  },
  fieldLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 6 },
  fieldHint: { fontSize: 12, color: '#8E8E93', marginTop: 6, lineHeight: 17 },
  inputBox: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    fontWeight: '400',
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
  },
  inputBoxCurr: { textAlign: 'center', fontWeight: '500' },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C8',
    marginVertical: 16,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  itemsTitle: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  addLineBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  addLineBtnText: { fontSize: 14, fontWeight: '500', color: '#3A3A3C' },
  lineBlock: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  lineBlockTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  lineHeaderTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  lineIndex: { fontSize: 12, fontWeight: '500', color: '#636366' },
  lineCollapsedSummary: { fontSize: 14, fontWeight: '400', color: '#1C1C1E', marginTop: 3, lineHeight: 19 },
  lineRemoveText: { fontSize: 14, fontWeight: '500', color: '#636366' },
  lineRemoveTextOff: { color: '#C7C7CC' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  itemRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
  },
  itemRowThumbImg: { width: 44, height: 44 },
  itemRowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  itemImageHint: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 56,
    lineHeight: 15,
  },
  itemRowCode: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  itemRowName: { fontSize: 14, fontWeight: '400', color: '#3A3A3C', marginTop: 3, lineHeight: 19 },
  itemRowPlaceholder: { fontSize: 14, color: '#8E8E93', marginTop: 3 },
  nameFieldWrap: { marginBottom: 10 },
  budgetHint: { fontWeight: '400', color: '#8E8E93', fontSize: 11, marginBottom: 4 },
  qtyRateRow: { flexDirection: 'row', alignItems: 'stretch' },
  qtyRateCell: { flex: 1 },
  qtyRateGap: { width: 12 },
  qtyRateLabel: { fontSize: 12, fontWeight: '500', color: '#636366', marginBottom: 6 },
  qtyRateInput: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    fontWeight: '400',
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  readOnlyWeightInput: {
    backgroundColor: '#F2F2F7',
    color: '#636366',
  },
  uomText: { fontSize: 12, color: '#636366', marginTop: 8 },
  lineSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  lineSubtotalLabel: { fontSize: 13, fontWeight: '500', color: '#636366' },
  lineSubtotalValue: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', fontVariant: ['tabular-nums'] },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#C6C6C8',
  },
  grandTotalLabel: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  grandTotalValue: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', fontVariant: ['tabular-nums'] },
  footer: {
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
    backgroundColor: Colors.SUCCESS,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    maxHeight: '78%',
    paddingBottom: Spacing.LG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    borderBottomWidth: 0,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  searchInput: {
    marginHorizontal: Spacing.MD,
    marginTop: Spacing.SM,
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    fontSize: 15,
    color: '#1C1C1E',
    backgroundColor: '#FFFFFF',
  },
  searchLoading: { paddingVertical: Spacing.XL, alignItems: 'center' },
  hitList: { paddingHorizontal: Spacing.MD, marginTop: Spacing.SM },
  emptyHits: { textAlign: 'center', color: Colors.TEXT_SECONDARY, paddingVertical: Spacing.XL, fontSize: 14 },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  hitThumb: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
  },
  hitThumbImg: { width: 48, height: 48 },
  hitTextCol: { flex: 1, minWidth: 0 },
  hitCode: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  hitName: { fontSize: 14, color: '#636366', marginTop: 2, lineHeight: 19 },
  hitUom: { fontSize: 11, color: Colors.TEXT_SECONDARY, marginTop: 4 },
});
