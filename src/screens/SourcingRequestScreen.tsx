import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../services/erpnext';
import {
  buildSourcingCategoryOptions,
  resolveItemGroupIdsForSourcingCategory,
} from '../utils/itemGroup';
import { Category } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { withOtherItemOption, SourcingItemOption } from '../utils/sourcingItems';
import { buildSourcingSalesOrderLines } from '../utils/sourcingSubmit';

const hairline = StyleSheet.hairlineWidth;

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
  loadingProducts: boolean;
};

const newForm = (expanded: boolean): RequestForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  expanded,
  selectedCategoryId: '',
  selectedCategoryName: '',
  selectedProductId: '',
  itemDescription: '',
  referenceImageUri: null,
  quantity: '1',
  expectedRate: '',
  loadingProducts: false,
});

export const SourcingRequestScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useUserSession();
  const insets = useSafeAreaInsets();
  const [keyboardPad, setKeyboardPad] = useState(0);

  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forms, setForms] = useState<RequestForm[]>([newForm(true)]);
  const [productsByFormId, setProductsByFormId] = useState<Record<string, SourcingItemOption[]>>({});

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
    void fetchGroups();
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

  const categoryTree = useMemo<Category[]>(
    () =>
      allGroups.map((group: any) => ({
        id: group.name,
        name: group.item_group_name || group.name,
        slug: group.name,
        image: group.image || '',
        parentId: group.parent_item_group,
      })),
    [allGroups]
  );

  const itemCategoryList = useMemo(() => buildSourcingCategoryOptions(allGroups), [allGroups]);

  const updateForm = (formId: string, updates: Partial<RequestForm>) => {
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, ...updates } : f)));
  };

  const fetchItemsForForm = async (formId: string, categoryId: string) => {
    try {
      updateForm(formId, { loadingProducts: true });
      const client = getERPNextClient();
      const groupIds = resolveItemGroupIdsForSourcingCategory(categoryId, categoryTree);
      const items = await client.getRawItemsByGroups(groupIds, 500);
      const unique = new Map<string, any>();
      items.forEach((item: any) => {
        if (item?.name) unique.set(item.name, item);
      });
      const dropdownItems: SourcingItemOption[] = withOtherItemOption(
        Array.from(unique.values())
          .filter((item: any) => Number(item?.disabled) !== 1)
          .map((item: any) => ({
            id: item.name,
            name: item.item_name || item.name,
            itemCode: item.name,
          }))
      );
      setProductsByFormId((prev) => ({ ...prev, [formId]: dropdownItems }));
    } catch (error) {
      console.error('Error fetching items for form:', error);
      setProductsByFormId((prev) => ({ ...prev, [formId]: [] }));
    } finally {
      updateForm(formId, { loadingProducts: false });
    }
  };

  const selectedProductFor = (form: RequestForm) =>
    (productsByFormId[form.id] || []).find((p) => p.id === form.selectedProductId);

  const addAnotherLine = () => {
    setForms((prev) => [...prev.map((f) => ({ ...f, expanded: false })), newForm(true)]);
  };

  const removeLine = (formId: string) => {
    setForms((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((f) => f.id !== formId);
    });
    setProductsByFormId((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  };

  const resetAll = useCallback(() => {
    setForms([newForm(true)]);
    setProductsByFormId({});
  }, []);

  const pickImageFor = async (formId: string) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow media library access to select an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Platform.OS === 'ios',
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        updateForm(formId, { referenceImageUri: result.assets[0].uri });
      }
    } catch {
      Alert.alert('Image Error', 'Unable to pick image right now.');
    }
  };

  const submitAll = async () => {
    for (let i = 0; i < forms.length; i += 1) {
      const form = forms[i];
      const product = selectedProductFor(form);
      const qty = parseInt(form.quantity, 10);
      const rate = parseFloat(form.expectedRate);
      const requestNum = i + 1;

      if (!form.selectedCategoryId) {
        Alert.alert('Missing Category', `Line ${requestNum}: select an item category.`);
        return;
      }
      if (!product) {
        Alert.alert('Missing Item', `Line ${requestNum}: select an item.`);
        return;
      }
      if (!form.itemDescription.trim()) {
        Alert.alert('Description Required', `Line ${requestNum}: enter an item description.`);
        return;
      }
      if (!form.referenceImageUri) {
        Alert.alert('Image Required', `Line ${requestNum}: upload a reference image.`);
        return;
      }
      if (!qty || qty < 1) {
        Alert.alert('Invalid Quantity', `Line ${requestNum}: quantity must be at least 1.`);
        return;
      }
      if (!rate || rate <= 0) {
        Alert.alert('Invalid budget', `Line ${requestNum}: my budget must be greater than 0.`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const client = getERPNextClient();
      const sessionUser = (user?.user || '').trim();
      const sessionEmail = (user?.email || '').trim();

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
      try {
        const companies = await client.getCompanies(1);
        if (companies?.[0]?.name) companyName = companies[0].name;
      } catch {
        console.warn('Could not auto-resolve company, using fallback value.');
      }

      const transactionDate = new Date();
      const deliveryDate = new Date(transactionDate);
      deliveryDate.setDate(deliveryDate.getDate() + 21);

      const orderLines = forms.map((form) => {
        const product = selectedProductFor(form) as SourcingItemOption;
        return {
          product,
          selectedCategoryId: form.selectedCategoryId,
          quantity: parseInt(form.quantity, 10),
          rate: parseFloat(form.expectedRate),
          description: form.itemDescription.trim(),
        };
      });

      const items = await buildSourcingSalesOrderLines(client, orderLines, allGroups);

      const createdOrder = await client.createSalesOrder({
        customer: customerId,
        company: companyName,
        transaction_date: transactionDate.toISOString().split('T')[0],
        delivery_date: deliveryDate.toISOString().split('T')[0],
        items,
      });

      for (let i = 0; i < forms.length; i += 1) {
        const form = forms[i];
        if (!form.referenceImageUri) continue;
        try {
          const uploadResponse = await client.uploadFileToDoc(
            form.referenceImageUri,
            `sourcing-reference-${i + 1}-${Date.now()}.jpg`,
            'Sales Order',
            createdOrder.name,
            true
          );
          const fileUrl = uploadResponse?.message?.file_url || uploadResponse?.file_url || '';
          if (fileUrl && i === 0) {
            try {
              await client.updateSalesOrder(createdOrder.name, { image: fileUrl });
            } catch {
              await client.updateSalesOrder(createdOrder.name, { custom_image: fileUrl });
            }
          }
        } catch (e) {
          console.warn('Reference image upload failed:', e);
        }
      }

      const orderName = createdOrder.name;
      Alert.alert(
        t('sourcing.submittedTitle'),
        t('sourcing.submittedBody', { name: orderName }),
        [{ text: t('contactUs.ok'), onPress: () => resetAll() }]
      );
    } catch (error: any) {
      console.error('Error creating sourcing request order:', error);
      Alert.alert('Request Failed', error?.message || 'Unable to submit request right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = forms.length > 0 && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header title={t('tabs.sourcing')} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: 48 + (Platform.OS === 'android' ? keyboardPad : 0) },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <Text style={styles.pageHint}>{t('sourcing.pageHint')}</Text>

          {forms.map((form, idx) => {
            const product = selectedProductFor(form);
            const formProducts = productsByFormId[form.id] || [];

            return (
              <View key={form.id} style={styles.lineCard}>
                <TouchableOpacity
                  style={styles.lineHeader}
                  onPress={() => updateForm(form.id, { expanded: !form.expanded })}
                  activeOpacity={0.75}
                >
                  <Text style={styles.lineIndex}>{String(idx + 1).padStart(2, '0')}</Text>
                  <View style={styles.lineHeaderText}>
                    <Text style={styles.lineTitle}>{t('sourcing.lineLabel', { n: idx + 1 })}</Text>
                    {!form.expanded ? (
                      <Text style={styles.linePreview} numberOfLines={1}>
                        {product?.name || t('sourcing.tapToExpand')}
                      </Text>
                    ) : null}
                  </View>
                  {forms.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => removeLine(form.id)}
                      style={styles.removeHit}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('sourcing.removeLineA11y')}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.TEXT_SECONDARY} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.removeHit} />
                  )}
                  <Ionicons
                    name={form.expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={Colors.TEXT_SECONDARY}
                  />
                </TouchableOpacity>

                {form.expanded ? (
                  <View style={styles.lineBody}>
                    <Text style={styles.fieldLabel}>{t('sourcing.fieldCategory')}</Text>
                    <SearchableSelect
                      options={itemCategoryList}
                      selectedId={form.selectedCategoryId}
                      selectedLabel={form.selectedCategoryName}
                      onSelect={async (category) => {
                        updateForm(form.id, {
                          selectedCategoryId: category.id,
                          selectedCategoryName: category.name,
                          selectedProductId: '',
                        });
                        await fetchItemsForForm(form.id, category.id);
                      }}
                      placeholder={t('sourcing.phCategory')}
                      searchPlaceholder={t('sourcing.searchCategory')}
                      loading={loadingGroups}
                      emptyText={t('sourcing.emptyCategories')}
                    />

                    <Text style={styles.fieldLabel}>{t('sourcing.fieldItem')}</Text>
                    <SearchableSelect
                      options={formProducts}
                      selectedId={form.selectedProductId}
                      selectedLabel={product?.name}
                      onSelect={(item) => updateForm(form.id, { selectedProductId: item.id })}
                      placeholder={
                        form.selectedCategoryId ? t('sourcing.phItem') : t('sourcing.phItemNeedCategory')
                      }
                      searchPlaceholder={t('sourcing.searchItem')}
                      disabled={!form.selectedCategoryId}
                      loading={form.loadingProducts}
                      emptyText={t('sourcing.emptyItems')}
                      listMaxHeight={320}
                    />

                    <Text style={styles.fieldLabel}>{t('sourcing.fieldDescription')}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={form.itemDescription}
                      onChangeText={(v) => updateForm(form.id, { itemDescription: v })}
                      placeholder={t('sourcing.phDescription')}
                      placeholderTextColor={Colors.TEXT_SECONDARY}
                      multiline
                      textAlignVertical="top"
                    />

                    <Text style={styles.fieldLabel}>{t('sourcing.fieldImage')}</Text>
                    <TouchableOpacity style={styles.imageRow} onPress={() => pickImageFor(form.id)}>
                      <Ionicons name="image-outline" size={20} color={Colors.WINE} />
                      <Text style={styles.imageRowText}>
                        {form.referenceImageUri ? t('sourcing.changeImage') : t('sourcing.uploadImage')}
                      </Text>
                    </TouchableOpacity>
                    {form.referenceImageUri ? (
                      <View style={styles.previewWrap}>
                        <Image source={{ uri: form.referenceImageUri }} style={styles.preview} />
                        <TouchableOpacity
                          onPress={() => updateForm(form.id, { referenceImageUri: null })}
                          style={styles.previewClear}
                        >
                          <Ionicons name="close-circle" size={22} color={Colors.ERROR} />
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={styles.rowTwo}>
                      <View style={styles.rowTwoCell}>
                        <Text style={styles.fieldLabel}>{t('sourcing.fieldQty')}</Text>
                        <TextInput
                          style={styles.input}
                          value={form.quantity}
                          onChangeText={(v) => updateForm(form.id, { quantity: v.replace(/[^0-9]/g, '') })}
                          keyboardType="numeric"
                          placeholder="1"
                          placeholderTextColor={Colors.TEXT_SECONDARY}
                        />
                      </View>
                      <View style={styles.rowTwoGap} />
                      <View style={styles.rowTwoCell}>
                        <Text style={styles.fieldLabel}>{t('sourcing.fieldRate')}</Text>
                        <TextInput
                          style={styles.input}
                          value={form.expectedRate}
                          onChangeText={(v) =>
                            updateForm(form.id, { expectedRate: v.replace(/[^0-9.]/g, '') })
                          }
                          keyboardType="decimal-pad"
                          placeholder={t('sourcing.phRate')}
                          placeholderTextColor={Colors.TEXT_SECONDARY}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <TouchableOpacity style={styles.addLine} onPress={addAnotherLine} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color={Colors.WINE} />
            <Text style={styles.addLineText}>{t('sourcing.addAnotherLine')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={submitAll}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.WHITE} />
            ) : (
              <Text style={styles.submitText}>{t('sourcing.submitAll')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  keyboardAvoid: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 10,
  },
  pageHint: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.TEXT_SECONDARY,
    marginBottom: 18,
    fontWeight: '500',
  },
  lineCard: {
    backgroundColor: Colors.WHITE,
    marginBottom: 14,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  lineIndex: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.WINE,
    width: 28,
    fontVariant: ['tabular-nums'],
  },
  lineHeaderText: { flex: 1, minWidth: 0 },
  lineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
    letterSpacing: -0.3,
  },
  linePreview: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '500',
  },
  removeHit: { width: 36, alignItems: 'center', justifyContent: 'center' },
  lineBody: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 0,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    paddingVertical: 10,
    paddingHorizontal: 2,
    fontSize: 16,
    color: Colors.BLACK,
    backgroundColor: Colors.WHITE,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 10,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: hairline,
    borderBottomColor: 'rgba(230, 0, 18, 0.25)',
  },
  imageRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.WINE,
  },
  previewWrap: {
    marginTop: 12,
    width: 132,
    height: 132,
    backgroundColor: Colors.LIGHT_GRAY,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  preview: { width: '100%', height: '100%' },
  previewClear: {
    position: 'absolute',
    right: 4,
    top: 4,
    backgroundColor: Colors.WHITE,
    borderRadius: 14,
    padding: 2,
  },
  rowTwo: {
    flexDirection: 'row',
    marginTop: 4,
  },
  rowTwoCell: { flex: 1 },
  rowTwoGap: { width: 14 },
  addLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 8,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: Colors.BORDER,
  },
  addLineText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.WINE,
  },
  submit: {
    marginTop: 12,
    backgroundColor: Colors.WINE,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
