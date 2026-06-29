import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { appAlert as Alert } from '../services/appAlert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../services/erpnext';
import { buildSourcingCategoryOptions, isTopLevelItemGroupParent } from '../utils/itemGroup';
import type { RootStackParamList, ErpCustomerAddressRow } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { categoryAsSourcingItem } from '../utils/sourcingItems';
import { buildSourcingSalesOrderLines } from '../utils/sourcingSubmit';
import { navigateToSalesOrderDetail } from '../utils/erpDocumentNavigation';
import {
  buildSourcingPrefillFromSalesOrder,
  isLocalImageUri,
} from '../utils/salesOrderSourcingPrefill';
import { getSalesOrderShareUiState } from '../utils/salesOrderShareState';
import { isSupplierPortalUser } from '../utils/isSupplierPortalUser';
import { ShipToAddressField } from '../components/ShipToAddressField';
import {
  resolveRavenChannelForSupplierShare,
  shareSalesOrderInRavenChat,
} from '../utils/shareSalesOrderInChat';
import { markSalesOrderSharedLocally } from '../utils/salesOrderShareMarks';
import { showSalesOrderShareSentAndOpenChat } from '../utils/openRavenChatAfterShare';
import { notifySalesOrderEditedInChat } from '../utils/erpDocChatStatusReply';
import { getRavenDmPeerUserId, listRavenChannelsForSessionUser } from '../services/ravenNativeApi';

type SourcingRoute = RouteProp<RootStackParamList, 'SourcingRequest'>;

const hairline = StyleSheet.hairlineWidth;

function resolveCanonicalItemGroupId(raw: string, allGroups: any[]): string {
  const q = raw.trim();
  if (!q) return '';
  const qLower = q.toLowerCase();
  const match = allGroups.find((g: any) => {
    const name = String(g?.name || '').trim();
    const label = String(g?.item_group_name || '').trim();
    return (
      name === q ||
      label === q ||
      name.toLowerCase() === qLower ||
      label.toLowerCase() === qLower
    );
  });
  return match ? String(match.name || '').trim() : q;
}

function itemGroupLabelForId(groupId: string, allGroups: any[]): string {
  const id = groupId.trim();
  if (!id) return '';
  const match = allGroups.find((g: any) => String(g?.name || '').trim() === id);
  return String(match?.item_group_name || match?.name || id).trim();
}

type RequestForm = {
  id: string;
  expanded: boolean;
  selectedCategoryId: string;
  selectedCategoryName: string;
  selectedProductId: string;
  itemDescription: string;
  referenceImageUri: string | null;
  quantity: string;
  expectedRate: string;
};

const newForm = (expanded: boolean): RequestForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  expanded,
  selectedCategoryId: '',
  selectedCategoryName: '',
  selectedProductId: '',
  itemDescription: '',
  referenceImageUri: null,
  quantity: '1',
  expectedRate: '',
});

export const SourcingRequestMultiScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<SourcingRoute>();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const isSupplierPortal = isSupplierPortalUser(user);
  const insets = useSafeAreaInsets();
  const [keyboardPad, setKeyboardPad] = useState(0);

  const paramChannelId = (route.params?.ravenChannelId || '').trim();
  const paramPeerUserId = (route.params?.peerUserId || '').trim();
  const paramWorkspaceId = (route.params?.ravenWorkspaceId || '').trim();
  const supplierLabel = (route.params?.supplierLabel || '').trim();
  const paramSupplierDocName = (route.params?.supplierDocName || '').trim();
  const paramSupplierGroupLabel = String(
    route.params?.workspaceName || route.params?.supplierGroup || ''
  ).trim();
  const paramSalesOrderName = String(route.params?.salesOrderName || '').trim();
  const editMode = paramSalesOrderName.length > 0;
  const [supplierGroupName, setSupplierGroupName] = useState(paramSupplierGroupLabel);
  const [loadingSupplierGroup, setLoadingSupplierGroup] = useState(false);
  const supplierSourcingMode = paramSupplierDocName.length > 0;
  const lockedRecipient = !!(paramChannelId || paramPeerUserId);

  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shipToAddressName, setShipToAddressName] = useState('');
  const [forms, setForms] = useState<RequestForm[]>([newForm(true)]);
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(editMode);
  const [loadOrderError, setLoadOrderError] = useState<string | null>(null);
  const shareSentRef = useRef(false);

  const onShipToChange = useCallback((name: string, _row: ErpCustomerAddressRow) => {
    setShipToAddressName(name);
  }, []);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoadingGroups(true);
        const client = getERPNextClient();
        const rawGroups = await client.getItemGroups();
        setAllGroups(rawGroups || []);
      } catch (error) {
        console.error('Error loading item groups:', error);
      } finally {
        setLoadingGroups(false);
      }
    };
    fetchGroups();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardPad(e.endCoordinates?.height ?? 0);
    });
    const subHide = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const itemCategoryList = useMemo(
    () => buildSourcingCategoryOptions(allGroups),
    [allGroups]
  );

  /** Selected supplier group → locked item category; id maps to Item Group for queries. */
  const supplierLockedCategory = useMemo(() => {
    if (!supplierSourcingMode) return null;
    const rawName = supplierGroupName.trim();
    if (!rawName) return null;
    const id = resolveCanonicalItemGroupId(rawName, allGroups) || rawName;
    const name = itemGroupLabelForId(id, allGroups) || rawName;
    return { id, name };
  }, [supplierSourcingMode, supplierGroupName, allGroups]);

  const updateForm = (formId: string, updates: Partial<RequestForm>) => {
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, ...updates } : f)));
  };

  const lockCategoryAsItem = (categoryId: string, categoryName: string) => ({
    selectedCategoryId: categoryId,
    selectedCategoryName: categoryName,
    selectedProductId: categoryId,
  });

  useEffect(() => {
    if (paramSupplierGroupLabel) {
      setSupplierGroupName(paramSupplierGroupLabel);
    }
  }, [paramSupplierGroupLabel]);

  useEffect(() => {
    if (!supplierSourcingMode || !paramSupplierDocName || supplierGroupName) return;
    let cancelled = false;

    const loadSupplierGroup = async () => {
      try {
        setLoadingSupplierGroup(true);
        const sup = await getERPNextClient().getSupplier(paramSupplierDocName);
        if (cancelled) return;
        setSupplierGroupName(String(sup?.supplier_group || '').trim());
      } catch (error) {
        console.error('Error loading supplier group:', error);
      } finally {
        if (!cancelled) setLoadingSupplierGroup(false);
      }
    };

    void loadSupplierGroup();
    return () => {
      cancelled = true;
    };
  }, [supplierSourcingMode, paramSupplierDocName, supplierGroupName]);

  useEffect(() => {
    if (!editMode || !paramSalesOrderName) return;
    if (isSupplierPortal) {
      setLoadingOrder(false);
      setLoadOrderError(t('orderDetails.editNotAllowedSupplierBody'));
      return;
    }
    if (loadingGroups) return;
    let cancelled = false;

    const loadDraftOrder = async () => {
      setLoadingOrder(true);
      setLoadOrderError(null);
      try {
        const client = getERPNextClient();
        const state = await getSalesOrderShareUiState(paramSalesOrderName, { viewerIsSupplier: isSupplierPortal });
        if (!state.canEdit) {
          throw new Error('SALES_ORDER_NOT_EDITABLE');
        }
        const raw = await client.getSalesOrder(paramSalesOrderName);
        if (cancelled) return;
        const prefill = await buildSourcingPrefillFromSalesOrder(client, raw, allGroups);
        if (cancelled) return;
        if (!prefill.forms.length) {
          throw new Error('This order has no line items to edit.');
        }
        setShipToAddressName(prefill.shipToAddressName);
        setForms(
          prefill.forms.map((row, idx) => ({
            id: `${paramSalesOrderName}-${idx}-${Date.now()}`,
            expanded: idx === 0,
            selectedCategoryId: row.selectedCategoryId,
            selectedCategoryName: row.selectedCategoryName,
            selectedProductId: row.selectedProductId,
            itemDescription: row.itemDescription,
            referenceImageUri: row.referenceImageUri,
            quantity: row.quantity,
            expectedRate: row.expectedRate,
          }))
        );
        setDidAutoPrefill(true);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : t('sourcing.loadOrderFailed');
          setLoadOrderError(msg.includes('SALES_ORDER_NOT_EDITABLE') ? t('orderDetails.editNotAllowedBody') : msg);
        }
      } finally {
        if (!cancelled) setLoadingOrder(false);
      }
    };

    void loadDraftOrder();
    return () => {
      cancelled = true;
    };
  }, [editMode, paramSalesOrderName, loadingGroups, allGroups, t, isSupplierPortal]);

  useEffect(() => {
    if (!supplierSourcingMode || didAutoPrefill || loadingGroups || loadingSupplierGroup) return;
    if (!forms[0]) return;
    if (!supplierLockedCategory) {
      setDidAutoPrefill(true);
      return;
    }

    const { id, name } = supplierLockedCategory;
    updateForm(forms[0].id, lockCategoryAsItem(id, name));
    setDidAutoPrefill(true);
  }, [
    supplierSourcingMode,
    didAutoPrefill,
    loadingGroups,
    loadingSupplierGroup,
    supplierLockedCategory,
    forms,
  ]);

  useEffect(() => {
    if (editMode) return;
    if (supplierSourcingMode) return;
    if (didAutoPrefill) return;
    if (loadingGroups) return;
    if (!allGroups || allGroups.length === 0) return;
    if (!forms[0]) return;

    const subCategoryIdParam = String(route?.params?.subCategoryId || '').trim();
    const childParam = String(route?.params?.subCategory || '').trim().toLowerCase();
    const parentIdParam = String(route?.params?.parentCategoryId || '').trim();
    const parentParam = String(route?.params?.parentCategory || '').trim().toLowerCase();

    if (!subCategoryIdParam && !childParam) return;

    const firstForm = forms[0];

    let matchedSubcategoryRaw = subCategoryIdParam
      ? allGroups.find((group: any) => group.name === subCategoryIdParam)
      : undefined;

    if (!matchedSubcategoryRaw && childParam) {
      matchedSubcategoryRaw = allGroups.find((group: any) => {
        const name = String(group?.name || '').trim().toLowerCase();
        const label = String(group?.item_group_name || '').trim().toLowerCase();
        if (name !== childParam && label !== childParam) return false;

        const parent = String(group?.parent_item_group || '').trim();
        if (isTopLevelItemGroupParent(parent)) return false;

        if (!parentIdParam && !parentParam) return true;

        const parentGroup = allGroups.find((g: any) => g.name === parentIdParam);
        const parentNameLower = String(
          parentGroup?.item_group_name || parentParam || ''
        ).toLowerCase();
        return (
          parent === parentIdParam ||
          parent.toLowerCase() === parentNameLower ||
          parent.toLowerCase() === parentParam
        );
      });
    }

    if (!matchedSubcategoryRaw) {
      setDidAutoPrefill(true);
      return;
    }

    let parentGroupRaw = parentIdParam
      ? allGroups.find((group: any) => group.name === parentIdParam)
      : undefined;

    if (!parentGroupRaw) {
      const parentFromChild = String(matchedSubcategoryRaw.parent_item_group || '').trim();
      if (parentFromChild) {
        parentGroupRaw = allGroups.find((group: any) => group.name === parentFromChild);
      }
    }

    if (!parentGroupRaw && parentParam) {
      parentGroupRaw = allGroups.find((group: any) => {
        const label = String(group?.item_group_name || '').trim().toLowerCase();
        const name = String(group?.name || '').trim().toLowerCase();
        return label === parentParam || name === parentParam;
      });
    }

    if (!parentGroupRaw) {
      setDidAutoPrefill(true);
      return;
    }

    const categoryId = String(parentGroupRaw.name || '').trim();
    const categoryName =
      parentGroupRaw.item_group_name || parentGroupRaw.name || parentParam || categoryId;

    updateForm(firstForm.id, lockCategoryAsItem(categoryId, categoryName));

    setDidAutoPrefill(true);
  }, [didAutoPrefill, loadingGroups, allGroups, forms, route?.params]);

  const addAnotherItem = () => {
    const nextForm = newForm(true);
    if (supplierSourcingMode && supplierLockedCategory) {
      const { id, name } = supplierLockedCategory;
      setForms((prev) => [
        ...prev.map((f) => ({ ...f, expanded: false })),
        {
          ...nextForm,
          ...lockCategoryAsItem(id, name),
        },
      ]);
      return;
    }
    setForms((prev) => [...prev.map((f) => ({ ...f, expanded: false })), nextForm]);
  };

  const pickImageFor = async (formId: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow media library access to select an image.');
      return;
    }
    // Android crop UI (allowsEditing) often has no visible confirm; pick full image on Android.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: Platform.OS === 'ios',
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      updateForm(formId, { referenceImageUri: result.assets[0].uri });
    }
  };

  const submitAll = async () => {
    if (shareSentRef.current || submitting) return;
    if (editMode && isSupplierPortal) {
      Alert.alert(t('orderDetails.editNotAllowedTitle'), t('orderDetails.editNotAllowedSupplierBody'));
      return;
    }
    if (forms.length === 0) {
      Alert.alert('Missing Items', 'Please add at least one item request.');
      return;
    }

    for (let i = 0; i < forms.length; i += 1) {
      const form = forms[i];
      const qty = parseInt(form.quantity, 10);
      const rate = parseFloat(form.expectedRate);
      const requestNum = i + 1;

      if (!form.selectedCategoryId || !form.selectedCategoryName.trim()) {
        Alert.alert('Missing Category', `Item request #${requestNum}: please select an item category.`);
        return;
      }
      if (!form.itemDescription.trim()) {
        Alert.alert('Description Required', `Item request #${requestNum}: please enter an item description.`);
        return;
      }
      if (!form.referenceImageUri) {
        Alert.alert('Preference Image Required', `Item request #${requestNum}: please upload a preference image.`);
        return;
      }
      if (!qty || qty < 1) {
        Alert.alert('Invalid Quantity', `Item request #${requestNum}: quantity must be at least 1.`);
        return;
      }
      if (!rate || rate <= 0) {
        Alert.alert('Invalid budget', `Item request #${requestNum}: my budget must be greater than 0.`);
        return;
      }
    }

    const shipTo = shipToAddressName.trim();
    if (!shipTo) {
      Alert.alert(t('orderDetails.shippingAddress'), t('sourcing.shipToRequired'));
      return;
    }

    const expandedForms = forms;
    let shareCompleted = false;

    try {
      setSubmitting(true);
      const client = getERPNextClient();
      const sessionUser = (user?.user || '').trim();
      const sessionEmail = (user?.email || '').trim();

      const orderLines = expandedForms.map((form) => {
        const categoryName = form.selectedCategoryName.trim();
        return {
          product: categoryAsSourcingItem(form.selectedCategoryId, categoryName),
          selectedCategoryId: form.selectedCategoryId,
          itemFieldText: categoryName,
          quantity: parseInt(form.quantity, 10),
          rate: parseFloat(form.expectedRate),
          description: form.itemDescription.trim(),
        };
      });

      const items = await buildSourcingSalesOrderLines(client, orderLines, allGroups);

      if (editMode) {
        const itemsForUpdate = items.map((line, i) => {
          const uri = String(expandedForms[i]?.referenceImageUri || '').trim();
          const row = { ...line };
          if (uri && !isLocalImageUri(uri)) {
            row.custom_new_image = uri;
          }
          return row;
        });

        await client.updateDraftSalesOrder(paramSalesOrderName, {
          shipping_address_name: shipTo,
          items: itemsForUpdate,
        });

        const lineImageUrls: string[] = expandedForms.map(() => '');
        for (let i = 0; i < expandedForms.length; i += 1) {
          const uri = String(expandedForms[i]?.referenceImageUri || '').trim();
          if (!uri || !isLocalImageUri(uri)) continue;
          try {
            const uploadResponse = await client.uploadFileToDoc(
              uri,
              `sourcing-reference-${i + 1}-${Date.now()}.jpg`,
              'Sales Order',
              paramSalesOrderName,
              false
            );
            const fileUrl = uploadResponse?.message?.file_url || uploadResponse?.file_url || '';
            if (fileUrl) lineImageUrls[i] = fileUrl;
          } catch (e) {
            console.warn('Could not upload one reference image:', e);
          }
        }

        if (lineImageUrls.some((u) => String(u || '').trim())) {
          try {
            await client.applySalesOrderLineImagesByIndex(paramSalesOrderName, lineImageUrls);
          } catch (e) {
            console.warn('Could not set sales order line images:', e);
          }
        }

        notifySalesOrderEditedInChat(paramSalesOrderName, {
          ravenChannelId: paramChannelId || undefined,
          sessionEmail: sessionEmail || null,
        });

        Alert.alert(t('sourcing.savedEditsTitle'), t('sourcing.savedEditsBody'), [
          {
            text: t('contactUs.ok'),
            onPress: () => (navigation as { goBack: () => void }).goBack(),
          },
        ]);
        return;
      }

      let customerId = '';
      if (sessionEmail) {
        const customerByEmail = await client.getCustomerByEmail(sessionEmail);
        if (customerByEmail?.name) customerId = customerByEmail.name;
      }
      if (!customerId && sessionUser && !sessionUser.includes('@')) {
        customerId = sessionUser;
      }
      if (!customerId) {
        Alert.alert('Error', 'Unable to resolve your customer profile. Please log in again.');
        return;
      }

      let companyName = 'Your Company';
      const companies = await client.getCompanies(1);
      if (companies?.[0]?.name) companyName = companies[0].name;

      const transactionDate = new Date();
      const deliveryDate = new Date(transactionDate);
      deliveryDate.setDate(deliveryDate.getDate() + 21);

      const createdOrder = await client.createSalesOrder({
        customer: customerId,
        company: companyName,
        transaction_date: transactionDate.toISOString().split('T')[0],
        delivery_date: deliveryDate.toISOString().split('T')[0],
        shipping_address_name: shipTo,
        items,
      });

      const lineImageUrls: string[] = expandedForms.map(() => '');
      for (let i = 0; i < expandedForms.length; i += 1) {
        const form = expandedForms[i];
        if (!form.referenceImageUri) continue;
        try {
          const uploadResponse = await client.uploadFileToDoc(
            form.referenceImageUri,
            `sourcing-reference-${i + 1}-${Date.now()}.jpg`,
            'Sales Order',
            createdOrder.name,
            false
          );
          const fileUrl = uploadResponse?.message?.file_url || uploadResponse?.file_url || '';
          if (fileUrl) lineImageUrls[i] = fileUrl;
        } catch (e) {
          console.warn('Could not upload one reference image:', e);
        }
      }

      if (lineImageUrls.some((u) => String(u || '').trim())) {
        try {
          await client.applySalesOrderLineImagesByIndex(createdOrder.name, lineImageUrls);
        } catch (e) {
          console.warn('Could not set sales order line images:', e);
        }
      }

      const orderName = createdOrder.name;

      if (lockedRecipient) {
        try {
          const channelId = await resolveRavenChannelForSupplierShare({
            sessionEmail: sessionEmail || null,
            ravenChannelId: paramChannelId,
            peerUserId: paramPeerUserId,
          });
          await shareSalesOrderInRavenChat(channelId, orderName, orderName);
          await markSalesOrderSharedLocally(orderName);

          const channelRows = await listRavenChannelsForSessionUser(sessionEmail || null);
          const channelRow = channelRows.find((c) => String(c.name || '').trim() === channelId);
          const peerUserId =
            paramPeerUserId || getRavenDmPeerUserId(channelRow, sessionEmail) || '';

          shareCompleted = true;
          shareSentRef.current = true;
          showSalesOrderShareSentAndOpenChat({
            t,
            navigation: navigation as { dispatch: (action: unknown) => void },
            sessionEmail: sessionEmail || null,
            channelId,
            peerUserId,
            workspaceId: paramWorkspaceId || String(channelRow?.workspace || '').trim(),
          });
        } catch (shareError: unknown) {
          console.error('Error sharing sourcing request in chat:', shareError);
          Alert.error(
            t('salesOrderShare.title'),
            shareError instanceof Error ? shareError.message : t('salesOrderShare.shareFailed'),
            [
              {
                text: t('contactUs.ok'),
                onPress: () =>
                  navigateToSalesOrderDetail(
                    navigation as { navigate: (name: string, params?: object) => void },
                    orderName,
                    { replace: true }
                  ),
              },
            ]
          );
        }
        return;
      }

      navigateToSalesOrderDetail(
        navigation as { navigate: (name: string, params?: object) => void },
        orderName,
        { replace: true }
      );
    } catch (error: any) {
      console.error(editMode ? 'Error updating sales order:' : 'Error creating sourcing request order:', error);
      const code = (error as { code?: string })?.code;
      if (code === 'SALES_ORDER_NOT_EDITABLE' || String(error?.message || '').includes('SALES_ORDER_NOT_EDITABLE')) {
        Alert.alert(t('orderDetails.editNotAllowedTitle'), t('orderDetails.editNotAllowedBody'));
        return;
      }
      Alert.error(
        editMode ? t('orderDetails.errorTitle') : 'Request Failed',
        error?.message || (editMode ? t('orderDetails.errorHint') : 'Unable to submit request right now.')
      );
    } finally {
      if (!shareCompleted) setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header
        showBackButton
        title={editMode ? t('sourcing.editTitle') : t('sourcing.stackTitle')}
        subtitle={
          editMode
            ? paramSalesOrderName
            : lockedRecipient
            ? supplierLabel
              ? t('salesOrderShare.formForSupplier', { name: supplierLabel })
              : t('salesOrderShare.sendToOpenChat')
            : undefined
        }
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 40 + (Platform.OS === 'android' ? keyboardPad : 0) },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
        {loadingOrder ? (
          <View style={styles.orderLoading}>
            <ActivityIndicator color={Colors.WINE} />
          </View>
        ) : loadOrderError ? (
          <View style={styles.orderLoading}>
            <Text style={styles.loadOrderErrorText}>{loadOrderError}</Text>
            <TouchableOpacity
              style={styles.loadOrderBackBtn}
              onPress={() => (navigation as { goBack: () => void }).goBack()}
              activeOpacity={0.85}
            >
              <Text style={styles.loadOrderBackText}>{t('contactUs.ok')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loadingOrder && !loadOrderError
          ? forms.map((form, idx) => {
          const itemLabel = form.selectedCategoryName.trim() || t('sourcing.tapToExpand');

          return (
            <View key={form.id} style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => updateForm(form.id, { expanded: !form.expanded })}
              >
                <View>
                  <Text style={styles.cardTitle}>{t('sourcing.lineLabel', { n: idx + 1 })}</Text>
                  {!form.expanded && (
                    <Text style={styles.cardSubtitle}>
                      {itemLabel}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={form.expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.TEXT_SECONDARY}
                />
              </TouchableOpacity>

              {form.expanded && (
                <>
                  {supplierSourcingMode ? (
                    <>
                      <Text style={styles.label}>{t('sourcing.fieldCategory')} *</Text>
                      {loadingGroups || loadingSupplierGroup ? (
                        <ActivityIndicator
                          size="small"
                          color={Colors.WINE}
                          style={styles.categoryLoading}
                        />
                      ) : supplierLockedCategory ? (
                        <>
                          <TextInput
                            style={[styles.input, styles.inputLocked]}
                            value={form.selectedCategoryName || supplierLockedCategory.name}
                            editable={false}
                          />
                          <Text style={styles.fieldHint}>{t('sourcing.supplierCategoryHint')}</Text>
                        </>
                      ) : (
                        <Text style={styles.fieldHint}>{t('sourcing.noSupplierGroup')}</Text>
                      )}

                      <Text style={styles.label}>{t('sourcing.fieldItem')} *</Text>
                      <TextInput
                        style={[styles.input, styles.inputLocked]}
                        value={form.selectedCategoryName || supplierLockedCategory?.name || ''}
                        editable={false}
                      />
                      <Text style={styles.fieldHint}>{t('sourcing.categoryLockedItemHint')}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.label}>{t('sourcing.fieldCategory')} *</Text>
                      <SearchableSelect
                        options={itemCategoryList}
                        selectedId={form.selectedCategoryId}
                        selectedLabel={form.selectedCategoryName}
                        onSelect={(category) => {
                          updateForm(form.id, lockCategoryAsItem(category.id, category.name));
                        }}
                        placeholder="Select item category"
                        searchPlaceholder="Search categories..."
                        loading={loadingGroups}
                        emptyText="No item categories available right now."
                      />

                      <Text style={styles.label}>{t('sourcing.fieldItem')} *</Text>
                      {form.selectedCategoryId ? (
                        <>
                          <TextInput
                            style={[styles.input, styles.inputLocked]}
                            value={form.selectedCategoryName}
                            editable={false}
                          />
                          <Text style={styles.fieldHint}>{t('sourcing.categoryLockedItemHint')}</Text>
                        </>
                      ) : (
                        <Text style={styles.fieldHint}>{t('sourcing.phItemNeedCategory')}</Text>
                      )}
                    </>
                  )}

                  <Text style={styles.label}>{t('sourcing.fieldDescription')} *</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={form.itemDescription}
                    onChangeText={(v) => updateForm(form.id, { itemDescription: v })}
                    placeholder="Describe the item you need"
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.label}>Preference Image *</Text>
                  <TouchableOpacity style={styles.imagePickerButton} onPress={() => pickImageFor(form.id)}>
                    <Ionicons name="image-outline" size={18} color={Colors.WINE} />
                    <Text style={styles.imagePickerButtonText}>
                      {form.referenceImageUri ? 'Change Image' : 'Upload Image'}
                    </Text>
                  </TouchableOpacity>
                  {form.referenceImageUri && (
                    <View style={styles.imagePreviewWrap}>
                      <Image source={{ uri: form.referenceImageUri }} style={styles.imagePreview} />
                      <TouchableOpacity
                        onPress={() => updateForm(form.id, { referenceImageUri: null })}
                        style={styles.removeImageButton}
                      >
                        <Ionicons name="close-circle" size={20} color={Colors.ERROR} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <Text style={styles.label}>Quantity *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.quantity}
                    onChangeText={(v) => updateForm(form.id, { quantity: v.replace(/[^0-9]/g, '') })}
                    keyboardType="numeric"
                    placeholder="Enter quantity"
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                  />

                  <Text style={styles.label}>{t('sourcing.fieldRate')} *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.expectedRate}
                    onChangeText={(v) => updateForm(form.id, { expectedRate: v.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder={t('sourcing.phRate')}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                  />
                </>
              )}
            </View>
          );
        })
          : null}

        {!loadingOrder && !loadOrderError ? (
          <>
        <TouchableOpacity style={styles.addAnotherButton} onPress={addAnotherItem}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.WINE} />
          <Text style={styles.addAnotherText}>Add Another Item</Text>
        </TouchableOpacity>

        <ShipToAddressField
          value={shipToAddressName}
          onChange={onShipToChange}
          userEmail={user?.email}
          disabled={submitting}
          required
        />

        <TouchableOpacity
          style={[styles.submitButton, (submitting || !shipToAddressName.trim()) && styles.submitButtonDisabled]}
          onPress={submitAll}
          disabled={submitting || !shipToAddressName.trim()}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.submitButtonText}>
              {editMode ? t('sourcing.saveEdits') : t('sourcing.submitAll')}
            </Text>
          )}
        </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.OFF_WHITE },
  keyboardAvoid: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 12,
    paddingBottom: 40,
  },
  orderLoading: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  loadOrderErrorText: {
    textAlign: 'center',
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  loadOrderBackBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: hairline,
    borderColor: Colors.WINE,
  },
  loadOrderBackText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.WINE,
  },
  card: {
    backgroundColor: Colors.WHITE,
    marginBottom: 0,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    paddingBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.BLACK, letterSpacing: -0.2 },
  cardSubtitle: { fontSize: 13, color: Colors.TEXT_SECONDARY, marginTop: 4, fontWeight: '500' },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    lineHeight: 17,
    marginTop: 6,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  categoryLoading: {
    alignSelf: 'flex-start',
    marginHorizontal: 4,
    marginVertical: 12,
  },
  input: {
    marginHorizontal: 4,
    borderWidth: 0,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    borderRadius: 0,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 4,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.BLACK,
  },
  inputLocked: {
    backgroundColor: Colors.OFF_WHITE,
    color: Colors.TEXT_SECONDARY,
  },
  textArea: { minHeight: 90, paddingTop: 12 },
  imagePickerButton: {
    marginHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: hairline,
    borderBottomColor: 'rgba(230, 0, 18, 0.35)',
    backgroundColor: Colors.WHITE,
  },
  imagePickerButtonText: { fontSize: 15, fontWeight: '600', color: Colors.WINE },
  imagePreviewWrap: { marginTop: 12, marginHorizontal: 4, position: 'relative', width: 140, height: 140, backgroundColor: Colors.LIGHT_GRAY, borderWidth: hairline, borderColor: Colors.BORDER },
  imagePreview: { width: '100%', height: '100%', backgroundColor: Colors.LIGHT_GRAY },
  removeImageButton: { position: 'absolute', right: 6, top: 6, backgroundColor: Colors.WHITE, borderRadius: 14, padding: 2 },
  addAnotherButton: {
    marginTop: 16,
    marginBottom: 12,
    borderBottomWidth: hairline,
    borderBottomColor: 'rgba(230, 0, 18, 0.35)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.WHITE,
  },
  addAnotherText: { fontSize: 15, fontWeight: '700', color: Colors.WINE },
  submitButton: {
    marginTop: 8,
    backgroundColor: Colors.WINE,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: Colors.WHITE, fontSize: 16, fontWeight: '700' },
});
