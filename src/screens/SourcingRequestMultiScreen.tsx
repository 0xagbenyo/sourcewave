import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Header } from '../components/Header';
import { useUserSession } from '../context/UserContext';
import { useTranslation } from 'react-i18next';
import { getERPNextClient } from '../services/erpnext';
import {
  buildSourcingCategoryOptions,
  isTopLevelItemGroupParent,
  resolveItemGroupIdsForSourcingCategory,
} from '../utils/itemGroup';
import { Category } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { withOtherItemOption, SourcingItemOption, resolveSubcategorySourcingItem, prependSourcingItemOption } from '../utils/sourcingItems';
import { buildSourcingSalesOrderLines } from '../utils/sourcingSubmit';

const hairline = StyleSheet.hairlineWidth;

type DropdownItem = SourcingItemOption;
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
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

export const SourcingRequestMultiScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const { user } = useUserSession();
  const insets = useSafeAreaInsets();
  const [keyboardPad, setKeyboardPad] = useState(0);

  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forms, setForms] = useState<RequestForm[]>([newForm(true)]);
  const [productsByFormId, setProductsByFormId] = useState<Record<string, DropdownItem[]>>({});
  const [didAutoPrefill, setDidAutoPrefill] = useState(false);

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

  const itemCategoryList = useMemo(
    () => buildSourcingCategoryOptions(allGroups),
    [allGroups]
  );

  const updateForm = (formId: string, updates: Partial<RequestForm>) => {
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, ...updates } : f)));
  };

  const fetchItemsForForm = async (
    formId: string,
    categoryId: string,
    prefillSubcategory?: { name?: string; item_group_name?: string } | null
  ) => {
    try {
      updateForm(formId, { loadingProducts: true });
      const client = getERPNextClient();
      const groupIds = resolveItemGroupIdsForSourcingCategory(categoryId, categoryTree);
      const items = await client.getRawItemsByGroups(groupIds, 500);
      const unique = new Map<string, any>();
      items.forEach((item: any) => {
        if (item?.name) unique.set(item.name, item);
      });
      let dropdownItems: DropdownItem[] = withOtherItemOption(
        Array.from(unique.values())
          .filter((item: any) => Number(item?.disabled) !== 1)
          .map((item: any) => ({
            id: item.name,
            name: item.item_name || item.name,
            itemCode: item.name,
          }))
      );

      if (prefillSubcategory) {
        const subItem = resolveSubcategorySourcingItem(prefillSubcategory, dropdownItems);
        dropdownItems = withOtherItemOption(
          prependSourcingItemOption(
            dropdownItems.filter((item) => item.id !== 'Other'),
            subItem
          )
        );
        updateForm(formId, { selectedProductId: subItem.id });
      }

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

  useEffect(() => {
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

    updateForm(firstForm.id, {
      selectedCategoryId: categoryId,
      selectedCategoryName: categoryName,
      selectedProductId: '',
    });

    void fetchItemsForForm(firstForm.id, categoryId, matchedSubcategoryRaw);

    setDidAutoPrefill(true);
  }, [didAutoPrefill, loadingGroups, allGroups, forms, route?.params]);

  const addAnotherItem = () => {
    setForms((prev) => [...prev.map((f) => ({ ...f, expanded: false })), newForm(true)]);
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
    if (forms.length === 0) {
      Alert.alert('Missing Items', 'Please add at least one item request.');
      return;
    }

    for (let i = 0; i < forms.length; i += 1) {
      const form = forms[i];
      const product = selectedProductFor(form);
      const qty = parseInt(form.quantity, 10);
      const rate = parseFloat(form.expectedRate);
      const requestNum = i + 1;

      if (!form.selectedCategoryId) {
        Alert.alert('Missing Category', `Item request #${requestNum}: please select an item category.`);
        return;
      }
      if (!product) {
        Alert.alert('Missing Item', `Item request #${requestNum}: please select an item.`);
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
        Alert.alert('Invalid Rate', `Item request #${requestNum}: expected rate must be greater than 0.`);
        return;
      }
    }

    const expandedForms = forms;

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
      const companies = await client.getCompanies(1);
      if (companies?.[0]?.name) companyName = companies[0].name;

      const transactionDate = new Date();
      const deliveryDate = new Date(transactionDate);
      deliveryDate.setDate(deliveryDate.getDate() + 21);

      const orderLines = expandedForms.map((form) => {
        const product = selectedProductFor(form) as DropdownItem;
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

      for (let i = 0; i < expandedForms.length; i += 1) {
        const form = expandedForms[i];
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
          console.warn('Could not upload one reference image:', e);
        }
      }

      Alert.alert('Success', 'Order request sent successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error creating sourcing request order:', error);
      Alert.alert('Request Failed', error?.message || 'Unable to submit request right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={t('sourcing.stackTitle')} />
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
        {forms.map((form, idx) => {
          const product = selectedProductFor(form);
          const formProducts = productsByFormId[form.id] || [];

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
                      {product?.name || 'Tap to edit'}
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
                  <Text style={styles.label}>Item Category *</Text>
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
                    placeholder="Select item category"
                    searchPlaceholder="Search categories..."
                    loading={loadingGroups}
                    emptyText="No item categories available right now."
                  />

                  <Text style={styles.label}>Item *</Text>
                  <SearchableSelect
                    options={formProducts}
                    selectedId={form.selectedProductId}
                    selectedLabel={product?.name}
                    onSelect={(item) => updateForm(form.id, { selectedProductId: item.id })}
                    placeholder={form.selectedCategoryId ? 'Select item' : 'Select item category first'}
                    searchPlaceholder="Search items..."
                    disabled={!form.selectedCategoryId}
                    loading={form.loadingProducts}
                    emptyText="No items found in this category."
                    listMaxHeight={320}
                  />

                  <Text style={styles.label}>Item Description *</Text>
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

                  <Text style={styles.label}>Expected Rate (GH₵) *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.expectedRate}
                    onChangeText={(v) => updateForm(form.id, { expectedRate: v.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    placeholder="Enter expected rate"
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                  />
                </>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.addAnotherButton} onPress={addAnotherItem}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.WINE} />
          <Text style={styles.addAnotherText}>Add Another Item</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={submitAll}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color={Colors.WHITE} /> : <Text style={styles.submitButtonText}>Submit Request</Text>}
        </TouchableOpacity>
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
