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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { useUserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';

export const SourcingRequestScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedParentName, setSelectedParentName] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedChildName, setSelectedChildName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [referenceImageUri, setReferenceImageUri] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [expectedRate, setExpectedRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showParentPicker, setShowParentPicker] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState<Array<{ id: string; name: string; itemCode: string }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

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

  const childGroupList = useMemo(() => {
    if (!selectedParentId) return [];
    return allGroups
      .filter((group: any) => {
        const parent = String(group?.parent_item_group || '').trim();
        return parent === selectedParentId || parent === selectedParentName;
      })
      .map((group: any) => ({
        id: group.name,
        name: group.item_group_name || group.name,
        isGroup: Number(group?.is_group) === 1,
      }));
  }, [allGroups, selectedParentId, selectedParentName]);

  useEffect(() => {
    const fetchProductsForChildGroup = async () => {
      if (!selectedChildId) {
        setCategoryProducts([]);
        return;
      }

      try {
        setLoadingProducts(true);
        const client = getERPNextClient();
        // Use raw Item list (not Website Item), filtered by selected group.
        const byId = await client.getRawItemsByGroup(selectedChildId, 500);
        const byName =
          selectedChildName && selectedChildName !== selectedChildId
            ? await client.getRawItemsByGroup(selectedChildName, 500)
            : [];
        const merged = [...(byId || []), ...(byName || [])];
        const uniqueMap = new Map<string, any>();
        merged.forEach((item: any) => {
          if (item?.name) uniqueMap.set(item.name, item);
        });
        const dropdownItems = Array.from(uniqueMap.values())
          .filter((item: any) => Number(item?.disabled) !== 1)
          .map((item: any) => ({
            id: item.name,
            name: item.item_name || item.name,
            itemCode: item.name,
          }));
        setCategoryProducts(dropdownItems);
      } catch (error) {
        console.error('Error fetching subgroup items:', error);
        setCategoryProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProductsForChildGroup();
  }, [allGroups, selectedChildId, selectedChildName]);

  const selectedProduct = useMemo(
    () => categoryProducts.find((product) => product.id === selectedProductId),
    [categoryProducts, selectedProductId]
  );
  const isOtherItemSelected = (selectedProduct?.name || '').trim().toLowerCase() === 'other';

  const canSubmit = !!selectedChildId && !!selectedProduct && !!expectedRate && !submitting;

  const handleParentSelect = (parent: any) => {
    setSelectedParentId(parent.id);
    setSelectedParentName(parent.name);
    setSelectedChildId('');
    setSelectedChildName('');
    setSelectedProductId('');
    setShowParentPicker(false);
    setShowChildPicker(false);
    setShowItemPicker(false);
  };

  const handleChildSelect = (child: any) => {
    setSelectedChildId(child.id);
    setSelectedChildName(child.name);
    setSelectedProductId('');
    setShowChildPicker(false);
    setShowItemPicker(false);
  };

  const handleItemSelect = (product: any) => {
    setSelectedProductId(product.id);
    setShowItemPicker(false);
  };

  const handlePickImage = async () => {
    try {
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

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setReferenceImageUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Image Error', 'Unable to pick image right now.');
    }
  };

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    const rate = parseFloat(expectedRate);

    if (!selectedProduct) {
      Alert.alert('Missing Item', 'Please select an item to request.');
      return;
    }
    if (!qty || qty < 1) {
      Alert.alert('Invalid Quantity', 'Quantity must be at least 1.');
      return;
    }
    if (!rate || rate <= 0) {
      Alert.alert('Invalid Expected Rate', 'Expected rate must be greater than 0.');
      return;
    }
    if (isOtherItemSelected && !itemDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a description for "Other" item.');
      return;
    }

    try {
      setSubmitting(true);
      const client = getERPNextClient();
      const sessionUser = (user?.user || '').trim();
      const sessionEmail = (user?.email || '').trim();

      // Always resolve ERPNext Customer ID (e.g., CUST-00001), not email.
      let customerId = '';
      if (sessionEmail) {
        const customerByEmail = await client.getCustomerByEmail(sessionEmail);
        if (customerByEmail?.name) {
          customerId = customerByEmail.name;
        }
      }
      if (!customerId && sessionUser && !sessionUser.includes('@')) {
        customerId = sessionUser;
      }

      if (!customerId) {
        Alert.alert('Error', 'Unable to resolve your customer profile. Please log in again.');
        setSubmitting(false);
        return;
      }

      // Resolve a valid company from ERPNext.
      let companyName = 'Your Company';
      try {
        const companies = await client.getCompanies(1);
        if (companies && companies.length > 0 && companies[0]?.name) {
          companyName = companies[0].name;
        }
      } catch (error) {
        console.warn('Could not auto-resolve company, using fallback value.');
      }

      const transactionDate = new Date();
      const deliveryDate = new Date(transactionDate);
      deliveryDate.setDate(deliveryDate.getDate() + 21);

      const orderData = {
        customer: customerId,
        company: companyName,
        transaction_date: transactionDate.toISOString().split('T')[0],
        delivery_date: deliveryDate.toISOString().split('T')[0],
        items: [
          {
            item_code: selectedProduct.itemCode || selectedProduct.id,
            qty,
            rate,
            amount: qty * rate,
            description: [
              isOtherItemSelected
                ? itemDescription.trim()
                : (itemDescription.trim() || `Sourcing request from China - ${selectedParentName} / ${selectedChildName}`),
              referenceImageUri ? `Reference Image: ${referenceImageUri}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };

      const createdOrder = await client.createSalesOrder(orderData);

      // Upload and attach reference image to the created Sales Order.
      if (referenceImageUri) {
        try {
          const fileName = `sourcing-reference-${Date.now()}.jpg`;
          const uploadResponse = await client.uploadFileToDoc(
            referenceImageUri,
            fileName,
            'Sales Order',
            createdOrder.name,
            true
          );

          // If Sales Order has an image field, populate it with uploaded file URL.
          const fileUrl =
            uploadResponse?.message?.file_url ||
            uploadResponse?.message?.file_url?.toString?.() ||
            uploadResponse?.file_url ||
            '';
          if (fileUrl) {
            try {
              await client.updateSalesOrder(createdOrder.name, { image: fileUrl });
            } catch (imageFieldError: any) {
              const errText = String(imageFieldError?.message || '');
              if (errText.includes('image')) {
                // Fallback for custom field naming used in many ERPNext instances.
                await client.updateSalesOrder(createdOrder.name, { custom_image: fileUrl });
              } else {
                throw imageFieldError;
              }
            }
          }
        } catch (uploadError) {
          console.warn('Reference image upload failed:', uploadError);
          Alert.alert(
            'Image Not Attached',
            'Order was created, but the reference image could not be attached.'
          );
        }
      }

      await client.submitSalesOrder(createdOrder.name);

      Alert.alert(
        'Request Submitted',
        `Purchase order ${createdOrder.name} has been created successfully.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
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
        <Text style={styles.headerTitle}>Request Item From China</Text>
        <View style={styles.headerIconButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.label}>Parent Group</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setShowParentPicker((prev) => !prev)}>
          <Text style={styles.selectorText}>
            {selectedParentName || 'Select parent group'}
          </Text>
          <Ionicons name={showParentPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        {showParentPicker && (
          <View style={styles.optionsContainer}>
            {loadingGroups ? (
              <ActivityIndicator color={Colors.ROYAL_BLUE} />
            ) : parentGroupList.length === 0 ? (
              <Text style={styles.emptyText}>No parent groups available right now.</Text>
            ) : (
              parentGroupList.map((parent) => (
                <TouchableOpacity
                  key={parent.id}
                  style={styles.option}
                  onPress={() => handleParentSelect(parent)}
                >
                  <Text style={styles.optionText}>{parent.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>Category</Text>
        <TouchableOpacity
          style={[styles.selector, !selectedParentId && styles.selectorDisabled]}
          onPress={() => selectedParentId && setShowChildPicker((prev) => !prev)}
          disabled={!selectedParentId}
        >
          <Text style={styles.selectorText}>
            {selectedChildName || (selectedParentId ? 'Select category' : 'Select parent group first')}
          </Text>
          <Ionicons name={showChildPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        {showChildPicker && selectedParentId && (
          <View style={styles.optionsContainer}>
            {childGroupList.length === 0 ? (
              <Text style={styles.emptyText}>No categories found under this parent group.</Text>
            ) : (
              childGroupList.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={styles.option}
                  onPress={() => handleChildSelect(child)}
                >
                  <Text style={styles.optionText}>{child.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>Item</Text>
        <TouchableOpacity
          style={[styles.selector, !selectedChildId && styles.selectorDisabled]}
          onPress={() => selectedChildId && setShowItemPicker((prev) => !prev)}
          disabled={!selectedChildId}
        >
          <Text style={styles.selectorText}>
            {selectedProduct?.name || (selectedChildId ? 'Select item' : 'Select category first')}
          </Text>
          <Ionicons name={showItemPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.TEXT_SECONDARY} />
        </TouchableOpacity>

        {showItemPicker && selectedChildId && (
          <View style={styles.optionsContainer}>
            {loadingProducts ? (
              <ActivityIndicator color={Colors.ROYAL_BLUE} />
            ) : categoryProducts.length === 0 ? (
              <Text style={styles.emptyText}>No items found in this category.</Text>
            ) : (
              categoryProducts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={styles.option}
                  onPress={() => handleItemSelect(product)}
                >
                  <Text style={styles.optionText}>{product.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.label}>{isOtherItemSelected ? 'Item Description *' : 'Item Description (Optional)'}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={itemDescription}
          onChangeText={setItemDescription}
          placeholder={isOtherItemSelected ? 'Describe the "Other" item you need' : 'Add extra details (optional)'}
          placeholderTextColor={Colors.TEXT_SECONDARY}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Reference Image (Optional)</Text>
        <TouchableOpacity style={styles.imagePickerButton} onPress={handlePickImage}>
          <Ionicons name="image-outline" size={16} color={Colors.ROYAL_BLUE} />
          <Text style={styles.imagePickerButtonText}>
            {referenceImageUri ? 'Change Image' : 'Upload Image'}
          </Text>
        </TouchableOpacity>
        {referenceImageUri && (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: referenceImageUri }} style={styles.imagePreview} />
            <TouchableOpacity onPress={() => setReferenceImageUri(null)} style={styles.removeImageButton}>
              <Ionicons name="close-circle" size={20} color={Colors.ERROR} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Quantity</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={(value) => setQuantity(value.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
          placeholder="Enter quantity"
          placeholderTextColor={Colors.TEXT_SECONDARY}
        />

        <Text style={styles.label}>Expected Rate (GH₵)</Text>
        <TextInput
          style={styles.input}
          value={expectedRate}
          onChangeText={(value) => setExpectedRate(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="Enter expected rate"
          placeholderTextColor={Colors.TEXT_SECONDARY}
        />

        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.submitButtonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BACKGROUND,
  },
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
  headerIconButton: {
    width: 28,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.BLACK,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.BLACK,
    marginBottom: 6,
    marginTop: 10,
  },
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
  selectorDisabled: {
    opacity: 0.6,
  },
  selectorText: {
    fontSize: 13,
    color: Colors.BLACK,
    flex: 1,
    marginRight: 8,
  },
  optionsContainer: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.BORDER,
    borderRadius: 8,
    backgroundColor: Colors.WHITE,
    paddingVertical: 4,
    maxHeight: 200,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.LIGHT_GRAY,
  },
  optionText: {
    fontSize: 13,
    color: Colors.BLACK,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.TEXT_SECONDARY,
    padding: 12,
  },
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
  textArea: {
    minHeight: 90,
    paddingTop: 10,
  },
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
  imagePickerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ROYAL_BLUE,
  },
  imagePreviewWrap: {
    marginTop: 10,
    position: 'relative',
    width: 120,
    height: 120,
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: Colors.LIGHT_GRAY,
  },
  removeImageButton: {
    position: 'absolute',
    right: -8,
    top: -8,
    backgroundColor: Colors.WHITE,
    borderRadius: 10,
  },
  submitButton: {
    marginTop: 24,
    backgroundColor: Colors.ROYAL_BLUE,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
});
