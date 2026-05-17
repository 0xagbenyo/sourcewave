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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { collectDescendantItemGroupIds } from '../utils/itemGroup';
import { Category } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { withOtherItemOption, SourcingItemOption } from '../utils/sourcingItems';

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
  const { user } = useUserSession();

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

  const parentCategoryList = useMemo(() => {
    return allGroups
      .filter((group: any) => {
        const isGroup = Number(group?.is_group) === 1;
        const parent = String(group?.parent_item_group || '').trim();
        return (
          isGroup &&
          (parent === '' || parent === 'All Item Groups' || parent === 'All Items Group')
        );
      })
      .map((group: any) => ({
        id: group.name,
        name: group.item_group_name || group.name,
      }));
  }, [allGroups]);

  const updateForm = (formId: string, updates: Partial<RequestForm>) => {
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, ...updates } : f)));
  };

  const fetchItemsForForm = async (
    formId: string,
    categoryId: string,
    restrictToGroupId?: string
  ) => {
    try {
      updateForm(formId, { loadingProducts: true });
      const client = getERPNextClient();
      const groupIds = restrictToGroupId
        ? [restrictToGroupId]
        : collectDescendantItemGroupIds(categoryId, categoryTree);
      const items = await client.getRawItemsByGroups(groupIds, 500);
      const unique = new Map<string, any>();
      items.forEach((item: any) => {
        if (item?.name) unique.set(item.name, item);
      });
      const dropdownItems: DropdownItem[] = withOtherItemOption(
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

  useEffect(() => {
    if (didAutoPrefill) return;
    if (loadingGroups) return;
    if (!allGroups || allGroups.length === 0) return;
    if (!forms[0]) return;

    const parentParam = String(route?.params?.parentCategory || '').trim().toLowerCase();
    const childParam = String(route?.params?.subCategory || '').trim().toLowerCase();
    if (!parentParam || !childParam) return;

    const firstForm = forms[0];
    const matchedParentRaw = allGroups.find((group: any) => {
      const name = String(group?.name || '').trim().toLowerCase();
      const label = String(group?.item_group_name || '').trim().toLowerCase();
      const isGroup = Number(group?.is_group) === 1;
      const parent = String(group?.parent_item_group || '').trim();
      const isTopLevel = parent === '' || parent === 'All Item Groups';
      return isGroup && isTopLevel && (name === parentParam || label === parentParam);
    });

    if (!matchedParentRaw) {
      setDidAutoPrefill(true);
      return;
    }

    const categoryId = matchedParentRaw.name;
    const categoryName = matchedParentRaw.item_group_name || matchedParentRaw.name;

    const matchedSubcategoryRaw = allGroups.find((group: any) => {
      const parent = String(group?.parent_item_group || '').trim().toLowerCase();
      const name = String(group?.name || '').trim().toLowerCase();
      const label = String(group?.item_group_name || '').trim().toLowerCase();
      return (
        (parent === String(categoryId).trim().toLowerCase() ||
          parent === String(categoryName).trim().toLowerCase()) &&
        (name === childParam || label === childParam)
      );
    });

    updateForm(firstForm.id, {
      selectedCategoryId: categoryId,
      selectedCategoryName: categoryName,
      selectedProductId: '',
    });

    fetchItemsForForm(
      firstForm.id,
      categoryId,
      matchedSubcategoryRaw?.name
    );

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
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

      const items = expandedForms.map((form) => {
        const product = selectedProductFor(form) as DropdownItem;
        const qty = parseInt(form.quantity, 10);
        const rate = parseFloat(form.expectedRate);
        const description = form.itemDescription.trim();

        return {
          item_code: product.itemCode || product.id,
          qty,
          rate,
          amount: qty * rate,
          description,
        };
      });

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.BLACK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Items From China</Text>
        <View style={styles.headerIconButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
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
                  <Text style={styles.cardTitle}>Item Request #{idx + 1}</Text>
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
                    options={parentCategoryList}
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
                    <Ionicons name="image-outline" size={16} color={Colors.ROYAL_BLUE} />
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
          <Ionicons name="add-circle-outline" size={18} color={Colors.ROYAL_BLUE} />
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.BACKGROUND },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  headerIconButton: { width: 28, alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '700', color: Colors.BLACK },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  card: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 10,
    backgroundColor: Colors.WHITE,
    padding: 12,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.BLACK },
  cardSubtitle: { fontSize: 11, color: Colors.TEXT_SECONDARY, marginTop: 3 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.BLACK, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: Colors.BLACK,
  },
  textArea: { minHeight: 90, paddingTop: 10 },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  imagePickerButtonText: { fontSize: 13, fontWeight: '600', color: Colors.ROYAL_BLUE },
  imagePreviewWrap: { marginTop: 10, position: 'relative', width: 120, height: 120 },
  imagePreview: { width: 120, height: 120, borderRadius: 8, backgroundColor: Colors.LIGHT_GRAY },
  removeImageButton: { position: 'absolute', right: -8, top: -8, backgroundColor: Colors.WHITE, borderRadius: 10 },
  addAnotherButton: {
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.WHITE,
  },
  addAnotherText: { fontSize: 13, fontWeight: '700', color: Colors.ROYAL_BLUE },
  submitButton: {
    marginTop: 6,
    backgroundColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: Colors.WHITE, fontSize: 14, fontWeight: '700' },
});
