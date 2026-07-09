import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet, View, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { appAlert as Alert } from '../services/appAlert';
import { getERPNextClient } from '../services/erpnext';
import { useUserSession } from '../context/UserContext';
import { useSessionCustomerId } from '../hooks/useSessionCustomerId';
import { useSupplierDocumentId } from '../hooks/useSupplierDocumentId';
import { isSupplierPortalUser } from '../utils/isSupplierPortalUser';
import { userFacingError } from '../utils/userFacingError';
import {
  formatErpLineWeight,
  measureLabelForUnit,
  parseErpWeightInput,
  resolveWeightDisplayUnit,
} from '../utils/erpLineWeight';
import {
  deliveryNoteSupplierHeaderFromDoc,
  deliveryNoteSupplierHeaderPatch,
  type DeliveryNoteSupplierHeaderDraft,
} from '../utils/deliveryNoteSupplierFields';
import {
  computeDeliveryNoteAmountBreakdown,
  deliveryNoteAllowsDeliveryPayment,
  readDeliveryNoteTotalNetWeight,
  shippingRatePerMeasureUnit,
  readDeliveryNoteIsSupplier,
  readDeliveryNoteLogistics,
  readDeliveryNoteSupplier,
} from '../utils/deliveryNoteAmounts';
import {
  deliveryNoteLogisticsUiLabel,
  erpDocOwnedByOtherSupplier,
  readSalesInvoiceSupplier,
  resolveErpSupplierDisplayName,
  salesInvoiceSupplierUiLabel,
} from '../utils/erpSalesInvoiceSupplier';
import { navigateToSalesInvoiceDetail } from '../utils/erpDocumentNavigation';
import {
  SHIPPING_OPTIONS,
  shippingOptionByErpValue,
  syncedShippingFromOption,
  syncedShippingFromRule,
  type ShippingOptionId,
} from '../constants/shippingOptions';
import { InvoiceShippingOptionSheet } from '../components/InvoiceShippingOptionSheet';
import { InvoicePaystackPaymentSheet } from '../components/InvoicePaystackPaymentSheet';
import { ErpDeliveryNotePaymentsPanel } from '../components/ErpDeliveryNotePaymentsPanel';
import { SupplierQuotationPaymentModal } from '../components/SupplierQuotationPaymentModal';
import { DeliveryNoteSupplierHeaderForm } from '../components/DeliveryNoteSupplierHeaderForm';
import {
  DeliveryNoteShippingRulePicker,
  type ShippingRuleOption,
} from '../components/DeliveryNoteShippingRulePicker';
import {
  DnActionBar,
  DnLinkRow,
  DnPanel,
  DnPressRow,
  DnRow,
  DnSectionTitle,
  DnSegment,
  DnTabStrip,
  DnLineItem,
  DnTextLink,
  dnUiStyles,
} from '../components/deliveryNote/DeliveryNoteDetailUi';
import {
  ErpDocumentPreviewLayout,
  ErpDocHeaderSendButton,
  ErpDocHero,
  type ErpDocHeroFactPair,
  ErpDocEmptyState,
  erpDocStatusAccent,
  formatErpDocDate,
  formatErpDocMoney,
} from '../components/ErpDocumentPreviewLayout';
import { navigateShareDeliveryNoteToLogistics } from '../utils/navigateShareDeliveryNoteToLogistics';
import { notifyDeliveryNoteEditedInChat } from '../utils/erpDocChatStatusReply';
import { ERP_DOC_FLAT } from '../constants/erpDocFlatUi';
import { Colors } from '../constants/colors';

type RouteParams = { deliveryNoteId?: string; name?: string };
type DnTab = 'details' | 'items' | 'payments';

type PendingShipping = {
  shipping_option_label: string;
  shipping_rule: string;
  is_supplier: boolean;
};

function pendingShippingFromDoc(doc: Record<string, unknown>): PendingShipping {
  return {
    shipping_option_label: getERPNextClient().readDeliveryNoteShippingOption(doc),
    shipping_rule: String(doc.shipping_rule || '').trim(),
    is_supplier: readDeliveryNoteIsSupplier(doc),
  };
}

function shippingPatchFromPending(
  pending: PendingShipping,
  doc: Record<string, unknown>
): {
  shipping_rule?: string;
  shipping_option_label?: string;
  is_supplier?: boolean;
} {
  const saved = pendingShippingFromDoc(doc);
  const patch: ReturnType<typeof shippingPatchFromPending> = {};
  if (pending.shipping_rule !== saved.shipping_rule) patch.shipping_rule = pending.shipping_rule;
  if (pending.shipping_option_label !== saved.shipping_option_label) {
    patch.shipping_option_label = pending.shipping_option_label;
  }
  if (pending.is_supplier !== saved.is_supplier) patch.is_supplier = pending.is_supplier;
  return patch;
}

export const DeliveryNoteDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const isSupplierPortal = isSupplierPortalUser(user);
  const { customerId: sessionCustomerId } = useSessionCustomerId();
  const { supplierDocId } = useSupplierDocumentId();

  const dnId = String((route.params as RouteParams)?.deliveryNoteId || (route.params as RouteParams)?.name || '').trim();
  const isSupplierRoute = (route as { name?: string }).name === 'SupplierDeliveryNoteDetail';
  const canSupplierView = isSupplierPortal || isSupplierRoute;

  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [invoiceDoc, setInvoiceDoc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shippingRules, setShippingRules] = useState<ShippingRuleOption[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [optionSheetOpen, setOptionSheetOpen] = useState(false);
  const [headerDraft, setHeaderDraft] = useState<DeliveryNoteSupplierHeaderDraft | null>(null);
  const [headerBaseline, setHeaderBaseline] = useState<DeliveryNoteSupplierHeaderDraft | null>(null);
  const [pendingShipping, setPendingShipping] = useState<PendingShipping | null>(null);
  const [tab, setTab] = useState<DnTab>('details');
  const [deliveryOutstanding, setDeliveryOutstanding] = useState<number | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [recordPayModal, setRecordPayModal] = useState(false);
  const [recordPaySubmitting, setRecordPaySubmitting] = useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [logisticsDisplayName, setLogisticsDisplayName] = useState('');
  const [goodsSupplierDisplayName, setGoodsSupplierDisplayName] = useState('');

  const loadDoc = useCallback(async () => {
    if (!dnId) {
      setDoc(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fresh = await getERPNextClient().getDeliveryNoteRaw(dnId);
      setDoc(fresh);
    } catch {
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [dnId]);

  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  const linkedInvoice = useMemo(() => {
    const rows = Array.isArray(doc?.items) ? (doc!.items as Record<string, unknown>[]) : [];
    return rows.map((row) => String(row.against_sales_invoice || '').trim()).find((n) => n.length > 0);
  }, [doc]);

  useEffect(() => {
    if (!linkedInvoice) {
      setInvoiceDoc(null);
      return;
    }
    let cancelled = false;
    void getERPNextClient()
      .getSalesInvoiceRaw(linkedInvoice)
      .then((inv) => {
        if (!cancelled) setInvoiceDoc(inv);
      })
      .catch(() => {
        if (!cancelled) setInvoiceDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedInvoice, dnId]);

  const loadShippingRules = useCallback(async (company: string) => {
    setRulesLoading(true);
    try {
      const rows = await getERPNextClient().listShippingRules(company);
      setShippingRules(rows);
    } catch {
      setShippingRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const items = Array.isArray(doc?.items) ? (doc!.items as Record<string, unknown>[]) : [];
  const currency = String(doc?.currency || 'GHS');
  const docstatus = doc?.docstatus != null ? Number(doc.docstatus) : undefined;
  const isSubmitted = docstatus === 1;
  const status = String(doc?.status || (Number(doc?.docstatus) === 0 ? 'Draft' : 'Submitted'));
  const statusColor = useMemo(() => erpDocStatusAccent(status, docstatus), [status, docstatus]);
  const linkedDnLogistics = useMemo(
    () => (doc ? readDeliveryNoteLogistics(doc) : ''),
    [doc]
  );
  const linkedDnGoodsSupplier = useMemo(() => {
    const fromDoc = doc ? readDeliveryNoteSupplier(doc) : '';
    if (fromDoc) return fromDoc;
    return invoiceDoc ? readSalesInvoiceSupplier(invoiceDoc) : '';
  }, [doc, invoiceDoc]);
  const dnOwnedByOther = erpDocOwnedByOtherSupplier(linkedDnLogistics, supplierDocId || undefined);
  const canSupplierEdit = canSupplierView && Number(doc?.docstatus) === 0 && !dnOwnedByOther;
  const canBuyerEditShipping = !canSupplierView && Number(doc?.docstatus) === 0;
  const canEditDraftShipping = canSupplierEdit || canBuyerEditShipping;
  const showApprovedByOtherNotice = canSupplierView && dnOwnedByOther;

  useEffect(() => {
    if (canSupplierView || !linkedDnLogistics) {
      setLogisticsDisplayName('');
      return;
    }
    let cancelled = false;
    void resolveErpSupplierDisplayName(linkedDnLogistics).then((name) => {
      if (!cancelled) setLogisticsDisplayName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [canSupplierView, linkedDnLogistics]);

  useEffect(() => {
    if (canSupplierView || !linkedDnGoodsSupplier) {
      setGoodsSupplierDisplayName('');
      return;
    }
    let cancelled = false;
    void resolveErpSupplierDisplayName(linkedDnGoodsSupplier).then((name) => {
      if (!cancelled) setGoodsSupplierDisplayName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [canSupplierView, linkedDnGoodsSupplier]);

  const logisticsLabel = deliveryNoteLogisticsUiLabel(linkedDnLogistics, logisticsDisplayName, t);
  const goodsSupplierLabel = salesInvoiceSupplierUiLabel(
    linkedDnGoodsSupplier,
    goodsSupplierDisplayName,
    t
  );

  const isSupplierFlag =
    canSupplierEdit && pendingShipping
      ? pendingShipping.is_supplier
      : readDeliveryNoteIsSupplier(doc);

  const amountBreakdown = useMemo(
    () => (doc ? computeDeliveryNoteAmountBreakdown(doc, invoiceDoc?.grand_total) : null),
    [doc, invoiceDoc?.grand_total]
  );

  const docShippingOption = doc ? getERPNextClient().readDeliveryNoteShippingOption(doc) : '';
  const docShippingRule = doc ? String(doc.shipping_rule || '').trim() : '';
  const weightDisplayUnit = useMemo(
    () => resolveWeightDisplayUnit(docShippingOption, docShippingRule),
    [docShippingOption, docShippingRule]
  );
  const erpTotalNetWeight = readDeliveryNoteTotalNetWeight(doc);
  const displayShippingFee = amountBreakdown?.shippingAmount ?? 0;
  const feePerUnit = shippingRatePerMeasureUnit(displayShippingFee, erpTotalNetWeight);

  const shippingRuleDisplay =
    canSupplierEdit && pendingShipping ? pendingShipping.shipping_rule : docShippingRule;
  const shippingOptionDisplay =
    (canSupplierEdit || canBuyerEditShipping) && pendingShipping
      ? pendingShipping.shipping_option_label
      : docShippingOption;

  const shippingDirty = useMemo(() => {
    if (!doc || !pendingShipping) return false;
    if (canBuyerEditShipping && !canSupplierEdit) {
      const saved = pendingShippingFromDoc(doc);
      return pendingShipping.shipping_option_label !== saved.shipping_option_label;
    }
    return Object.keys(shippingPatchFromPending(pendingShipping, doc)).length > 0;
  }, [doc, pendingShipping, canBuyerEditShipping, canSupplierEdit]);

  const heroAmount = formatErpDocMoney(displayShippingFee, currency);
  const heroInvoiceAmount =
    amountBreakdown && amountBreakdown.invoiceAmount > 0.009
      ? formatErpDocMoney(amountBreakdown.invoiceAmount, currency)
      : undefined;
  const heroAmountLabel = t('deliveryNoteDetails.deliveryFee');
  const customer = String(doc?.customer_name || doc?.customer || '—');
  const company = String(doc?.company || '').trim();
  const showDeliveryPayments = useMemo(
    () => deliveryNoteAllowsDeliveryPayment(doc) && (amountBreakdown?.shippingAmount ?? 0) > 0.009,
    [doc, amountBreakdown?.shippingAmount]
  );
  const deliveryPaid =
    showDeliveryPayments && deliveryOutstanding != null && deliveryOutstanding <= 0.009;
  const canPayDelivery =
    !canSupplierView && showDeliveryPayments && deliveryOutstanding != null && deliveryOutstanding > 0.009;
  const canRecordDelivery =
    canSupplierView && showDeliveryPayments && deliveryOutstanding != null && deliveryOutstanding > 0.009;

  const customerScope = useMemo(() => {
    const fromDoc = String(doc?.customer || '').trim();
    if (fromDoc && sessionCustomerId && fromDoc === sessionCustomerId) return fromDoc;
    if (fromDoc) return fromDoc;
    return sessionCustomerId || undefined;
  }, [doc?.customer, sessionCustomerId]);

  const loadDeliveryOutstanding = useCallback(async () => {
    if (!dnId || !showDeliveryPayments) {
      setDeliveryOutstanding(null);
      return;
    }
    try {
      const outstanding = await getERPNextClient().effectiveDeliveryNoteShippingOutstanding(dnId);
      setDeliveryOutstanding(outstanding);
    } catch {
      setDeliveryOutstanding(null);
    }
  }, [dnId, showDeliveryPayments, paymentsRefreshKey]);

  useEffect(() => {
    void loadDeliveryOutstanding();
  }, [loadDeliveryOutstanding]);

  const onPaymentSuccess = useCallback(() => {
    setPaymentsRefreshKey((k) => k + 1);
    void loadDoc();
    void loadDeliveryOutstanding();
    setTab('payments');
  }, [loadDoc, loadDeliveryOutstanding]);

  const onConfirmRecordPayment = async (amount: number) => {
    if (!dnId) return;
    setRecordPaySubmitting(true);
    try {
      await getERPNextClient().recordReceivePaymentAgainstDeliveryNote({
        deliveryNoteName: dnId,
        amount,
      });
      setRecordPayModal(false);
      onPaymentSuccess();
      Alert.alert(t('deliveryPayment.recordSuccessTitle'), t('deliveryPayment.recordSuccessBody'));
    } catch (e: unknown) {
      Alert.alert(
        t('deliveryPayment.failedTitle'),
        userFacingError(e, t('deliveryPayment.recordFailedBody'))
      );
    } finally {
      setRecordPaySubmitting(false);
    }
  };
  const shippingOptionLabel =
    shippingOptionByErpValue(shippingOptionDisplay)?.label ||
    shippingOptionDisplay ||
    t('deliveryNoteDetails.notSet');

  useEffect(() => {
    if (!doc || !canEditDraftShipping) {
      if (!canSupplierEdit) {
        setHeaderDraft(null);
        setHeaderBaseline(null);
      }
      setPendingShipping(null);
      return;
    }
    if (canSupplierEdit) {
      const fromDoc = deliveryNoteSupplierHeaderFromDoc(doc);
      setHeaderDraft(fromDoc);
      setHeaderBaseline(fromDoc);
    }
    setPendingShipping(pendingShippingFromDoc(doc));
  }, [dnId, doc?.name, doc?.modified, canEditDraftShipping, canSupplierEdit]);

  useEffect(() => {
    if (!doc || !canEditDraftShipping || !company) return;
    void loadShippingRules(company);
  }, [doc?.name, company, canEditDraftShipping, loadShippingRules]);

  const headerDirty = useMemo(() => {
    if (!headerDraft || !headerBaseline) return false;
    return Object.keys(deliveryNoteSupplierHeaderPatch(headerDraft, headerBaseline)).length > 0;
  }, [headerDraft, headerBaseline]);

  const isDirty = headerDirty || shippingDirty;
  const actionBusy = saving || submitting;

  const heroFactPairs = useMemo((): ErpDocHeroFactPair[] => {
    const unitLabel = measureLabelForUnit(weightDisplayUnit);

    const rows: ErpDocHeroFactPair[] = [
      {
        left: { label: t('deliveryNoteDetails.customer'), value: customer },
        right:
          erpTotalNetWeight > 0
            ? {
                label: t('deliveryNoteDetails.totalWeight'),
                value: `${formatErpLineWeight(erpTotalNetWeight)} ${unitLabel}`,
              }
            : undefined,
      },
      {
        left: {
          label: t('deliveryNoteDetails.shippingRule'),
          value: docShippingRule || t('deliveryNoteDetails.notSet'),
        },
        right:
          feePerUnit != null
            ? {
                label: t('deliveryNoteDetails.ratePerUnit', { unit: unitLabel }),
                value: t('deliveryNoteDetails.ratePerUnitValue', {
                  amount: formatErpDocMoney(feePerUnit, currency),
                  unit: unitLabel,
                }),
              }
            : undefined,
      },
    ];

    if (!canEditDraftShipping && showDeliveryPayments && deliveryOutstanding != null) {
      rows.push({
        left: {
          label: t('deliveryNoteDetails.deliveryDue'),
          value: deliveryPaid
            ? t('deliveryNoteDetails.deliveryPaid')
            : formatErpDocMoney(deliveryOutstanding, currency),
        },
      });
    }

    return rows;
  }, [
    currency,
    customer,
    deliveryOutstanding,
    deliveryPaid,
    docShippingRule,
    erpTotalNetWeight,
    feePerUnit,
    canEditDraftShipping,
    showDeliveryPayments,
    t,
    weightDisplayUnit,
  ]);

  const screenTabs = useMemo(() => {
    const list: { id: DnTab; label: string }[] = [
      { id: 'details', label: t('deliveryNoteDetails.tabDetails') },
    ];
    if (canSupplierView) {
      list.push({ id: 'items', label: `${t('deliveryNoteDetails.tabItems')} · ${items.length}` });
    }
    if (showDeliveryPayments) {
      list.push({ id: 'payments', label: t('deliveryNoteDetails.tabPayments') });
    }
    return list;
  }, [canSupplierView, items.length, showDeliveryPayments, t]);

  const hasTabs = canSupplierView || showDeliveryPayments;

  const openRulePicker = () => {
    void loadShippingRules(company);
    setRulePickerOpen(true);
  };

  const onPickShippingRule = (ruleName: string) => {
    setPendingShipping((prev) => {
      const isSupplier = prev?.is_supplier ?? readDeliveryNoteIsSupplier(doc);
      return syncedShippingFromRule(ruleName, isSupplier);
    });
    setRulePickerOpen(false);
  };

  const onPickShippingOption = (optionId: ShippingOptionId) => {
    const option = SHIPPING_OPTIONS.find((o) => o.id === optionId);
    if (!option) return;
    if (canSupplierEdit) {
      setPendingShipping((prev) => {
        const isSupplier = prev?.is_supplier ?? readDeliveryNoteIsSupplier(doc);
        return syncedShippingFromOption(option.erpValue, shippingRules, isSupplier);
      });
    } else {
      setPendingShipping((prev) => {
        const fallbackRule = String(prev?.shipping_rule || doc?.shipping_rule || '').trim();
        const fallbackIsSupplier = prev?.is_supplier ?? readDeliveryNoteIsSupplier(doc);
        return {
          shipping_option_label: option.erpValue,
          shipping_rule: fallbackRule,
          is_supplier: fallbackIsSupplier,
        };
      });
    }
    setOptionSheetOpen(false);
  };

  const onSetIsSupplier = (yes: boolean) => {
    setPendingShipping((prev) =>
      prev ? { ...prev, is_supplier: yes } : { shipping_rule: '', shipping_option_label: '', is_supplier: yes }
    );
  };

  const onSaveAll = async () => {
    if (!dnId || !doc || actionBusy || !isDirty) return;
    if (!canEditDraftShipping) return;
    const shippingPatch = pendingShipping ? shippingPatchFromPending(pendingShipping, doc) : {};
    const patch = {
      ...(canSupplierEdit && headerDraft && headerBaseline
        ? deliveryNoteSupplierHeaderPatch(headerDraft, headerBaseline)
        : {}),
      ...(canSupplierEdit
        ? shippingPatch
        : canBuyerEditShipping && shippingPatch.shipping_option_label !== undefined
          ? { shipping_option_label: shippingPatch.shipping_option_label }
          : {}),
    };
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const updated = await getERPNextClient().updateDeliveryNoteForSupplier(dnId, patch);
      setDoc(updated);
      if (canSupplierEdit) {
        const syncedHeader = deliveryNoteSupplierHeaderFromDoc(updated);
        setHeaderDraft(syncedHeader);
        setHeaderBaseline(syncedHeader);
      }
      setPendingShipping(pendingShippingFromDoc(updated));
      notifyDeliveryNoteEditedInChat(dnId, {
        sessionEmail: user?.email ?? null,
        editorIsSupplier: canSupplierEdit,
        shippingOptionErpValue:
          canBuyerEditShipping && shippingPatch.shipping_option_label !== undefined
            ? getERPNextClient().readDeliveryNoteShippingOption(updated)
            : undefined,
      });
      Alert.alert(t('deliveryNoteDetails.savedTitle'), t('deliveryNoteDetails.changesSaved'));
    } catch (e: unknown) {
      Alert.alert(t('deliveryNoteDetails.failedTitle'), userFacingError(e, t('deliveryNoteDetails.failedBody')));
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = () => {
    if (!dnId || !canSupplierEdit || isSubmitted) return;
    if (isDirty) {
      Alert.alert(t('deliveryNoteDetails.submitTitle'), t('deliveryNoteDetails.saveBeforeSubmit'));
      return;
    }
    Alert.alert(t('deliveryNoteDetails.submitTitle'), t('deliveryNoteDetails.submitConfirm'), [
      { text: t('deliveryNoteDetails.cancel'), style: 'cancel' },
      {
        text: t('deliveryNoteDetails.submitCta'),
        onPress: () => void (async () => {
          if (!supplierDocId?.trim()) {
            Alert.alert(
              t('deliveryNoteDetails.failedTitle'),
              t('deliveryNoteDetails.supplierNotLinked')
            );
            return;
          }
          setSubmitting(true);
          try {
            const submitted = await getERPNextClient().submitDeliveryNote(dnId, {
              supplierDocName: supplierDocId.trim(),
            });
            setDoc(submitted as Record<string, unknown>);
            Alert.alert(t('deliveryNoteDetails.savedTitle'), t('deliveryNoteDetails.submitSuccess'));
          } catch (e: unknown) {
            Alert.alert(t('deliveryNoteDetails.failedTitle'), userFacingError(e, t('deliveryNoteDetails.submitFailed')));
          } finally {
            setSubmitting(false);
          }
        })(),
      },
    ]);
  };

  const renderItemsList = () => (
    <View>
      <DnSectionTitle>{`${t('deliveryNoteDetails.items')} · ${items.length}`}</DnSectionTitle>
      <DnPanel>
        {items.length === 0 ? (
          <View style={{ padding: 16 }}>
            <ErpDocEmptyState title={t('deliveryNoteDetails.noItems')} />
          </View>
        ) : (
          items.map((line, idx) => {
            const lineTotalWeight = parseErpWeightInput(line.total_weight);
            const linePerUnitWeight = parseErpWeightInput(line.weight_per_unit);
            const weightDetail =
              lineTotalWeight != null || linePerUnitWeight != null
                ? t('invoiceDelivery.weightDetail', {
                    weight: formatErpLineWeight(lineTotalWeight ?? 0),
                    perUnit: formatErpLineWeight(linePerUnitWeight ?? 0),
                    unit: measureLabelForUnit(weightDisplayUnit),
                  })
                : undefined;
            const qtyNum = Number(line.qty);
            const rateNum = Number(line.rate);
            const qtyMeta =
              Number.isFinite(qtyNum) && Number.isFinite(rateNum)
                ? `${qtyNum} × ${formatErpDocMoney(rateNum, currency)}`
                : qtyNum > 0
                  ? t('orderDetails.salesOrderLineQty', { qty: qtyNum })
                  : undefined;
            const amountNum = Number(line.amount);
            const lineAmount = Number.isFinite(amountNum)
              ? formatErpDocMoney(amountNum, currency)
              : undefined;
            return (
              <DnLineItem
                key={String(line.name || idx)}
                title={String(line.item_name || line.item_code || t('common.itemFallback'))}
                detail={weightDetail}
                meta={qtyMeta}
                amount={lineAmount}
                last={idx === items.length - 1}
              />
            );
          })
        )}
      </DnPanel>
    </View>
  );

  const renderDetailsTab = () => (
    <View style={dnUiStyles.page}>
      {showApprovedByOtherNotice ? (
        <View style={styles.approvedNotice}>
          <Text style={styles.approvedNoticeText}>{t('erpDocumentParty.approvedByOtherNotice')}</Text>
        </View>
      ) : null}

      {linkedInvoice ? (
        <View>
          <DnSectionTitle>{t('deliveryNoteDetails.linkedInvoice')}</DnSectionTitle>
          <DnPanel>
            <DnLinkRow
              label={t('deliveryNoteDetails.viewInvoice', { name: linkedInvoice })}
              onPress={() =>
                navigateToSalesInvoiceDetail(
                  navigation as { navigate: (n: string, p?: object) => void },
                  linkedInvoice,
                  isSupplierPortal
                )
              }
            />
          </DnPanel>
        </View>
      ) : null}

      {!canSupplierView ? (
        <>
          <View>
            <DnSectionTitle>{t('erpDocumentParty.supplierSection')}</DnSectionTitle>
            <DnPanel>
              <DnRow
                label={t('erpDocumentParty.supplierField')}
                value={goodsSupplierLabel}
                last
              />
            </DnPanel>
          </View>
          <View>
            <DnSectionTitle>{t('erpDocumentParty.logisticsSection')}</DnSectionTitle>
            <DnPanel>
              <DnRow
                label={t('erpDocumentParty.logisticsField')}
                value={logisticsLabel}
                last
              />
            </DnPanel>
          </View>
        </>
      ) : null}

      <View>
        <DnSectionTitle>{t('deliveryNoteDetails.supplierShippingSection')}</DnSectionTitle>
        <DnPanel>
          {linkedInvoice ? (
            <DnRow
              label={t('deliveryNoteDetails.invoiceTotalWeight')}
              value={t('deliveryNoteDetails.invoiceTotalWeightValue', {
                weight: formatErpLineWeight(erpTotalNetWeight),
                unit: measureLabelForUnit(weightDisplayUnit),
              })}
              valueStrong
            />
          ) : null}

          {canSupplierEdit ? (
            <>
              <DnPressRow
                label={t('deliveryNoteDetails.shippingOption')}
                value={shippingOptionLabel}
                onPress={() => setOptionSheetOpen(true)}
                disabled={actionBusy}
              />
              <DnPressRow
                label={t('deliveryNoteDetails.shippingRule')}
                value={shippingRuleDisplay || t('deliveryNoteDetails.notSet')}
                onPress={openRulePicker}
                disabled={actionBusy}
              />
              {feePerUnit != null ? (
                <DnRow
                  label={t('deliveryNoteDetails.ratePerUnit', {
                    unit: measureLabelForUnit(weightDisplayUnit),
                  })}
                  value={t('deliveryNoteDetails.ratePerUnitValue', {
                    amount: formatErpDocMoney(feePerUnit, currency),
                    unit: measureLabelForUnit(weightDisplayUnit),
                  })}
                />
              ) : null}
              <View style={styles.segmentRow}>
                <Text style={styles.segmentLabel}>{t('deliveryNoteDetails.isSupplier')}</Text>
                <DnSegment
                  yesLabel={t('deliveryNoteDetails.yes')}
                  noLabel={t('deliveryNoteDetails.no')}
                  value={isSupplierFlag}
                  onChange={onSetIsSupplier}
                  disabled={actionBusy}
                />
              </View>
            </>
          ) : canBuyerEditShipping ? (
            <DnPressRow
              label={t('deliveryNoteDetails.shippingOption')}
              value={shippingOptionLabel}
              onPress={() => setOptionSheetOpen(true)}
              disabled={actionBusy}
            />
          ) : (
            <>
              <DnRow label={t('deliveryNoteDetails.shippingOption')} value={shippingOptionLabel} />
              <DnRow label={t('deliveryNoteDetails.shippingRule')} value={docShippingRule || '—'} />
              {feePerUnit != null ? (
                <DnRow
                  label={t('deliveryNoteDetails.ratePerUnit', {
                    unit: measureLabelForUnit(weightDisplayUnit),
                  })}
                  value={t('deliveryNoteDetails.ratePerUnitValue', {
                    amount: formatErpDocMoney(feePerUnit, currency),
                    unit: measureLabelForUnit(weightDisplayUnit),
                  })}
                />
              ) : null}
              <DnRow
                label={t('deliveryNoteDetails.isSupplier')}
                value={isSupplierFlag ? t('deliveryNoteDetails.yes') : t('deliveryNoteDetails.no')}
                last
              />
            </>
          )}
        </DnPanel>
      </View>

      {canSupplierEdit && headerDraft ? (
        <View>
          <DnSectionTitle>{t('deliveryNoteDetails.supplierDetailsSection')}</DnSectionTitle>
          <DnPanel>
            <DeliveryNoteSupplierHeaderForm
              draft={headerDraft}
              disabled={actionBusy}
              onChange={setHeaderDraft}
            />
          </DnPanel>
        </View>
      ) : null}

      {canSupplierEdit ? (
        <DnTextLink label={t('deliveryNoteDetails.nextViewItems')} onPress={() => setTab('items')} />
      ) : showDeliveryPayments ? (
        <DnTextLink label={t('deliveryNoteDetails.viewPayments')} onPress={() => setTab('payments')} />
      ) : null}
    </View>
  );

  const renderPaymentsTab = () => (
    <View style={dnUiStyles.page}>
      <ErpDeliveryNotePaymentsPanel
        key={paymentsRefreshKey}
        deliveryNoteName={dnId}
        currency={currency}
        active={tab === 'payments'}
        variant={canSupplierView ? 'supplier' : 'buyer'}
        customerId={customerScope}
        totalDue={amountBreakdown?.shippingAmount ?? 0}
        outstanding={deliveryOutstanding ?? 0}
        onRecordPayment={canSupplierView ? () => setRecordPayModal(true) : undefined}
        recordDisabled={!canRecordDelivery || recordPaySubmitting}
      />
    </View>
  );

  const canShareWithLogistics =
    !canSupplierView && !!dnId && !!doc && Number(doc.docstatus) !== 2;

  const onShareWithLogistics = useCallback(() => {
    if (!dnId || !canShareWithLogistics) return;
    void navigateShareDeliveryNoteToLogistics({
      navigation: navigation as { dispatch: (action: unknown) => void },
      deliveryNoteName: dnId,
      t,
    });
  }, [navigation, dnId, canShareWithLogistics, t]);

  const renderActiveTab = () => {
    if (tab === 'payments') return renderPaymentsTab();
    if (tab === 'items') {
      return <View style={dnUiStyles.page}>{renderItemsList()}</View>;
    }
    return renderDetailsTab();
  };
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([loadDoc(), loadDeliveryOutstanding()]).finally(() => {
      setRefreshing(false);
    });
  }, [loadDoc, loadDeliveryOutstanding]);

  return (
    <>
      <ErpDocumentPreviewLayout
        screenTitle={t('deliveryNoteDetails.screenTitle')}
        printDoctype="Delivery Note"
        printDocName={dnId}
        printLabel={t('deliveryNoteDetails.downloadPdf')}
        loading={loading}
        errorMessage={!loading && !doc ? t('deliveryNoteDetails.notFound') : null}
        onBack={() => (navigation as { goBack: () => void }).goBack()}
        refreshControl={
          doc ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.TEXT_SECONDARY}
            />
          ) : undefined
        }
        headerTrailing={
          canShareWithLogistics ? (
            <ErpDocHeaderSendButton
              label={t('deliveryNoteDetails.sendToLogisticsCta')}
              onPress={onShareWithLogistics}
              icon="airplane-outline"
              accessibilityLabel={t('deliveryNoteDetails.sendToLogisticsCta')}
            />
          ) : undefined
        }
      >
        {doc ? (
          <View style={dnUiStyles.page}>
            <View style={styles.heroCard}>
              <ErpDocHero
                docId={String(doc.name || dnId)}
                statusLabel={status}
                statusColor={statusColor}
                amount={heroAmount}
                amountLabel={heroAmountLabel}
                secondaryAmount={heroInvoiceAmount}
                secondaryAmountLabel={t('deliveryNoteDetails.invoiceFeeShort')}
                subtitle={
                  doc.posting_date
                    ? `${t('deliveryNoteDetails.posted')} ${formatErpDocDate(doc.posting_date)}`
                    : undefined
                }
                factPairs={heroFactPairs}
                statusTrailing={
                  canPayDelivery ? (
                    <TouchableOpacity
                      style={styles.payHeroBtn}
                      onPress={() => setPaySheetOpen(true)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.payHeroBtnText}>{t('deliveryPayment.payShort')}</Text>
                    </TouchableOpacity>
                  ) : undefined
                }
              />
            </View>

            <View style={styles.downloadHint}>
              <Ionicons name="download-outline" size={18} color={Colors.WINE} style={styles.downloadHintIcon} />
              <Text style={styles.downloadHintText}>{t('deliveryNoteDetails.downloadHint')}</Text>
            </View>

            {canEditDraftShipping ? (
              <DnActionBar
                saveLabel={t('deliveryNoteDetails.saveChanges')}
                submitLabel={t('deliveryNoteDetails.submitCta')}
                showSubmit={canSupplierEdit && !isSubmitted}
                canSave={isDirty && !actionBusy}
                canSubmit={canSupplierEdit && !isDirty && !actionBusy}
                saving={saving}
                submitting={submitting}
                onSave={() => void onSaveAll()}
                onSubmit={onSubmit}
              />
            ) : null}

            {hasTabs ? (
              <>
                <DnTabStrip tabs={screenTabs} activeId={tab} onChange={(id) => setTab(id as DnTab)} />
                {renderActiveTab()}
              </>
            ) : (
              renderDetailsTab()
            )}
          </View>
        ) : null}
      </ErpDocumentPreviewLayout>

      <DeliveryNoteShippingRulePicker
        visible={rulePickerOpen}
        busy={actionBusy}
        loading={rulesLoading}
        options={shippingRules}
        selectedName={shippingRuleDisplay || null}
        onClose={() => setRulePickerOpen(false)}
        onConfirm={(ruleName) => onPickShippingRule(ruleName)}
      />

      {canEditDraftShipping ? (
        <InvoiceShippingOptionSheet
          visible={optionSheetOpen}
          busy={actionBusy}
          currentErpValue={shippingOptionDisplay}
          confirmLabel={t('deliveryNoteDetails.applyShippingOption')}
          onClose={() => setOptionSheetOpen(false)}
          onConfirm={(id) => onPickShippingOption(id)}
        />
      ) : null}

      <InvoicePaystackPaymentSheet
        visible={paySheetOpen}
        invoiceName={dnId}
        currency={currency}
        maxAmount={deliveryOutstanding ?? 0}
        paymentKind="delivery_note"
        lockAmount
        onClose={() => setPaySheetOpen(false)}
        onSuccess={onPaymentSuccess}
      />

      <SupplierQuotationPaymentModal
        visible={recordPayModal}
        currency={currency}
        maxAmount={deliveryOutstanding ?? 0}
        loading={recordPaySubmitting}
        onClose={() => setRecordPayModal(false)}
        onSubmit={onConfirmRecordPayment}
      />
    </>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    backgroundColor: ERP_DOC_FLAT.surface,
    borderBottomWidth: ERP_DOC_FLAT.hairline,
    borderBottomColor: ERP_DOC_FLAT.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  segmentLabel: {
    width: 120,
    flexShrink: 0,
    fontSize: 15,
    color: ERP_DOC_FLAT.ink,
    letterSpacing: -0.2,
  },
  payHeroBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ERP_DOC_FLAT.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
  },
  payHeroBtnText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  downloadHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ERP_DOC_FLAT.surface,
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.border,
  },
  downloadHintIcon: { marginTop: 1 },
  downloadHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: ERP_DOC_FLAT.muted,
  },
  approvedNotice: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F5F6F8',
    borderWidth: ERP_DOC_FLAT.hairline,
    borderColor: ERP_DOC_FLAT.border,
  },
  approvedNoticeText: {
    fontSize: 14,
    lineHeight: 20,
    color: ERP_DOC_FLAT.muted,
  },
});
