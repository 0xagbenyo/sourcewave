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

type DropdownItem = { id: string; name: string; itemCode: string };
type RequestForm = {
  id: string;
  expanded: boolean;
  selectedParentId: string;
  selectedParentName: string;
  selectedChildId: string;
  selectedChildName: string;
  selectedProductId: string;
  itemDescription: string;
  referenceImageUri: string | null;
  quantity: string;
  expectedRate: string;
  showParentPicker: boolean;
  showChildPicker: boolean;
  showItemPicker: boolean;
  loadingProducts: boolean;
};

const newForm = (expanded: boolean): RequestForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  expanded,
  selectedParentId: '',
  selectedParentName: '',
  selectedChildId: '',
  selectedChildName: '',
  selectedProductId: '',
  itemDescription: '',
  referenceImageUri: null,
  quantity: '1',
  expectedRate: '',
  showParentPicker: false,
  showChildPicker: false,
  showItemPicker: false,
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

  const parentGroupList = useMemo(() => {
    return allGroups
      .filter((group: any) => {
        const isGroup = Number(group?.is_group) === 1;
        const parent = String(group?.parent_item_group || '').trim();
        return isGroup && (parent === '' || parent === 'All Item Groups');
      })
      .map((group: any) => ({
        id: group.name,
        name: group.item_group_name || group.name,
      }));
  }, [allGroups]);

  const childGroupListFor = (form: RequestForm) =>
    allGroups
      .filter((group: any) => {
        const parent = String(group?.parent_item_group || '').trim();
        return parent === form.selectedParentId || parent === form.selectedParentName;
      })
      .map((group: any) => ({
        id: group.name,
        name: group.item_group_name || group.name,
      }));

  const updateForm = (formId: string, updates: Partial<RequestForm>) => {
    setForms((prev) => prev.map((f) => (f.id === formId ? { ...f, ...updates } : f)));
  };

  const fetchItemsForForm = async (formId: string, childId: string, childName: string) => {
    try {
      updateForm(formId, { loadingProducts: true });
      const client = getERPNextClient();
      const byId = await client.getRawItemsByGroup(childId, 500);
      const byName = childName && childName !== childId ? await client.getRawItemsByGroup(childName, 500) : [];
      const merged = [...(byId || []), ...(byName || [])];
      const unique = new Map<string, any>();
      merged.forEach((item: any) => {
        if (item?.name) unique.set(item.name, item);
      });
      const dropdownItems: DropdownItem[] = Array.from(unique.values())
        .filter((item: any) => Number(item?.disabled) !== 1)
        .map((item: any) => ({
          id: item.name,
          name: item.item_name || item.name,
          itemCode: item.name,
        }));
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

    const parentId = matchedParentRaw.name;
    const parentName = matchedParentRaw.item_group_name || matchedParentRaw.name;

    const matchedChildRaw = allGroups.find((group: any) => {
      const parent = String(group?.parent_item_group || '').trim().toLowerCase();
      const name = String(group?.name || '').trim().toLowerCase();
      const label = String(group?.item_group_name || '').trim().toLowerCase();
      return (parent === String(parentId).trim().toLowerCase() || parent === String(parentName).trim().toLowerCase())
        && (name === childParam || label === childParam);
    });

    updateForm(firstForm.id, {
      selectedParentId: parentId,
      selectedParentName: parentName,
      selectedChildId: matchedChildRaw?.name || '',
      selectedChildName: matchedChildRaw ? (matchedChildRaw.item_group_name || matchedChildRaw.name) : '',
      selectedProductId: '',
      showParentPicker: false,
      showChildPicker: false,
      showItemPicker: false,
    });

    if (matchedChildRaw?.name) {
      fetchItemsForForm(firstForm.id, matchedChildRaw.name, matchedChildRaw.item_group_name || matchedChildRaw.name);
    }

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
    const expandedForms = forms.filter((f) => f.selectedProductId);
    if (expandedForms.length === 0) {
      Alert.alert('Missing Items', 'Please add at least one item request.');
      return;
    }

    for (let i = 0; i < expandedForms.length; i += 1) {
      const form = expandedForms[i];
      const product = selectedProductFor(form);
      const qty = parseInt(form.quantity, 10);
      const rate = parseFloat(form.expectedRate);
      const isOther = (product?.name || '').trim().toLowerCase() === 'other';

      if (!product) {
        Alert.alert('Missing Item', `Item request #${i + 1} has no selected item.`);
        return;
      }
      if (!qty || qty < 1) {
        Alert.alert('Invalid Quantity', `Item request #${i + 1} has invalid quantity.`);
        return;
      }
      if (!rate || rate <= 0) {
        Alert.alert('Invalid Rate', `Item request #${i + 1} has invalid expected rate.`);
        return;
      }
      if (isOther && !form.itemDescription.trim()) {
        Alert.alert('Description Required', `Item request #${i + 1} requires description for "Other".`);
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
      const companies = await client.getCompanies(1);
      if (companies?.[0]?.name) companyName = companies[0].name;

      const transactionDate = new Date();
      const deliveryDate = new Date(transactionDate);
      deliveryDate.setDate(deliveryDate.getDate() + 21);

      const items = expandedForms.map((form) => {
        const product = selectedProductFor(form) as DropdownItem;
        const qty = parseInt(form.quantity, 10);
        const rate = parseFloat(form.expectedRate);
        const isOther = (product?.name || '').trim().toLowerCase() === 'other';
        const description = isOther
          ? form.itemDescription.trim()
          : (form.itemDescription.trim() || `Sourcing request from China - ${form.selectedParentName} / ${form.selectedChildName}`);

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

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {forms.map((form, idx) => {
          const product = selectedProductFor(form);
          const isOther = (product?.name || '').trim().toLowerCase() === 'other';
          const childGroups = childGroupListFor(form);
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
                  <Text style={styles.label}>Parent Group</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => updateForm(form.id, { showParentPicker: !form.showParentPicker })}
                  >
                    <Text style={styles.selectorText}>{form.selectedParentName || 'Select parent group'}</Text>
                    <Ionicons name={form.showParentPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
                  </TouchableOpacity>
                  {form.showParentPicker && (
                    <View style={styles.optionsContainer}>
                      {loadingGroups ? (
                        <ActivityIndicator color={Colors.ROYAL_BLUE} />
                      ) : (
                        parentGroupList.map((parent) => (
                          <TouchableOpacity
                            key={parent.id}
                            style={styles.option}
                            onPress={() =>
                              updateForm(form.id, {
                                selectedParentId: parent.id,
                                selectedParentName: parent.name,
                                selectedChildId: '',
                                selectedChildName: '',
                                selectedProductId: '',
                                showParentPicker: false,
                                showChildPicker: false,
                                showItemPicker: false,
                              })
                            }
                          >
                            <Text style={styles.optionText}>{parent.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}

                  <Text style={styles.label}>Category</Text>
                  <TouchableOpacity
                    style={[styles.selector, !form.selectedParentId && styles.selectorDisabled]}
                    disabled={!form.selectedParentId}
                    onPress={() => updateForm(form.id, { showChildPicker: !form.showChildPicker })}
                  >
                    <Text style={styles.selectorText}>{form.selectedChildName || 'Select category'}</Text>
                    <Ionicons name={form.showChildPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
                  </TouchableOpacity>
                  {form.showChildPicker && !!form.selectedParentId && (
                    <View style={styles.optionsContainer}>
                      {childGroups.length === 0 ? (
                        <Text style={styles.emptyText}>No categories found under this parent group.</Text>
                      ) : (
                        childGroups.map((child) => (
                          <TouchableOpacity
                            key={child.id}
                            style={styles.option}
                            onPress={async () => {
                              updateForm(form.id, {
                                selectedChildId: child.id,
                                selectedChildName: child.name,
                                selectedProductId: '',
                                showChildPicker: false,
                                showItemPicker: false,
                              });
                              await fetchItemsForForm(form.id, child.id, child.name);
                            }}
                          >
                            <Text style={styles.optionText}>{child.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}

                  <Text style={styles.label}>Item</Text>
                  <TouchableOpacity
                    style={[styles.selector, !form.selectedChildId && styles.selectorDisabled]}
                    disabled={!form.selectedChildId}
                    onPress={() => updateForm(form.id, { showItemPicker: !form.showItemPicker })}
                  >
                    <Text style={styles.selectorText}>{product?.name || 'Select item'}</Text>
                    <Ionicons name={form.showItemPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
                  </TouchableOpacity>
                  {form.showItemPicker && !!form.selectedChildId && (
                    <View style={styles.optionsContainer}>
                      {form.loadingProducts ? (
                        <ActivityIndicator color={Colors.ROYAL_BLUE} />
                      ) : formProducts.length === 0 ? (
                        <Text style={styles.emptyText}>No items found in this category.</Text>
                      ) : (
                        formProducts.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.option}
                            onPress={() => updateForm(form.id, { selectedProductId: item.id, showItemPicker: false })}
                          >
                            <Text style={styles.optionText}>{item.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  )}

                  <Text style={styles.label}>{isOther ? 'Item Description *' : 'Item Description (Optional)'}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={form.itemDescription}
                    onChangeText={(v) => updateForm(form.id, { itemDescription: v })}
                    placeholder={isOther ? 'Describe the "Other" item you need' : 'Add extra details (optional)'}
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                    multiline
                    textAlignVertical="top"
                  />

                  <Text style={styles.label}>Reference Image (Optional)</Text>
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

                  <Text style={styles.label}>Quantity</Text>
                  <TextInput
                    style={styles.input}
                    value={form.quantity}
                    onChangeText={(v) => updateForm(form.id, { quantity: v.replace(/[^0-9]/g, '') })}
                    keyboardType="numeric"
                    placeholder="Enter quantity"
                    placeholderTextColor={Colors.TEXT_SECONDARY}
                  />

                  <Text style={styles.label}>Expected Rate (GH₵)</Text>
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
  selector: {
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorDisabled: { opacity: 0.6 },
  selectorText: { fontSize: 13, color: Colors.BLACK, flex: 1, marginRight: 8 },
  optionsContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingVertical: 4,
    maxHeight: 200,
  },
  option: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.LIGHT_GRAY },
  optionText: { fontSize: 13, color: Colors.BLACK },
  emptyText: { fontSize: 12, color: Colors.TEXT_SECONDARY, padding: 12 },
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
