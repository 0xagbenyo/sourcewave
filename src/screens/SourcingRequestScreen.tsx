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
import { collectDescendantItemGroupIds } from '../utils/itemGroup';
import { Category } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import { withOtherItemOption, SourcingItemOption } from '../utils/sourcingItems';

export const SourcingRequestScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [referenceImageUri, setReferenceImageUri] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [expectedRate, setExpectedRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState<SourcingItemOption[]>([]);
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

  useEffect(() => {
    const fetchProductsForCategory = async () => {
      if (!selectedCategoryId) {
        setCategoryProducts([]);
        return;
      }

      try {
        setLoadingProducts(true);
        const client = getERPNextClient();
        const groupIds = collectDescendantItemGroupIds(selectedCategoryId, categoryTree);
        const items = await client.getRawItemsByGroups(groupIds, 500);
        const uniqueMap = new Map<string, any>();
        items.forEach((item: any) => {
          if (item?.name) uniqueMap.set(item.name, item);
        });
        const dropdownItems: SourcingItemOption[] = Array.from(uniqueMap.values())
          .filter((item: any) => Number(item?.disabled) !== 1)
          .map((item: any) => ({
            id: item.name,
            name: item.item_name || item.name,
            itemCode: item.name,
          }));
        setCategoryProducts(withOtherItemOption(dropdownItems));
      } catch (error) {
        console.error('Error fetching category items:', error);
        setCategoryProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProductsForCategory();
  }, [selectedCategoryId, categoryTree]);

  const selectedProduct = useMemo(
    () => categoryProducts.find((product) => product.id === selectedProductId),
    [categoryProducts, selectedProductId]
  );
  const quantityNum = parseInt(quantity, 10);
  const rateNum = parseFloat(expectedRate);

  const canSubmit =
    !!selectedCategoryId &&
    !!selectedProduct &&
    !!itemDescription.trim() &&
    !!quantity.trim() &&
    quantityNum >= 1 &&
    !!expectedRate.trim() &&
    rateNum > 0 &&
    !!referenceImageUri &&
    !submitting;

  const handleCategorySelect = (category: { id: string; name: string }) => {
    setSelectedCategoryId(category.id);
    setSelectedCategoryName(category.name);
    setSelectedProductId('');
  };

  const handleItemSelect = (product: { id: string; name: string }) => {
    setSelectedProductId(product.id);
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
    if (!itemDescription.trim()) {
      Alert.alert('Description Required', 'Please enter an item description.');
      return;
    }
    if (!selectedCategoryId) {
      Alert.alert('Missing Category', 'Please select an item category.');
      return;
    }
    if (!referenceImageUri) {
      Alert.alert('Reference Image Required', 'Please upload a preference image before submitting.');
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
              itemDescription.trim(),
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

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <Text style={styles.label}>Item Category *</Text>
        <SearchableSelect
          options={parentCategoryList}
          selectedId={selectedCategoryId}
          selectedLabel={selectedCategoryName}
          onSelect={handleCategorySelect}
          placeholder="Select item category"
          searchPlaceholder="Search categories..."
          loading={loadingGroups}
          emptyText="No item categories available right now."
        />

        <Text style={styles.label}>Item *</Text>
        <SearchableSelect
          options={categoryProducts}
          selectedId={selectedProductId}
          selectedLabel={selectedProduct?.name}
          onSelect={handleItemSelect}
          placeholder={selectedCategoryId ? 'Select item' : 'Select item category first'}
          searchPlaceholder="Search items..."
          disabled={!selectedCategoryId}
          loading={loadingProducts}
          emptyText="No items found in this category."
          listMaxHeight={320}
        />

        <Text style={styles.label}>Item Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={itemDescription}
          onChangeText={setItemDescription}
          placeholder="Describe the item you need"
          placeholderTextColor={Colors.TEXT_SECONDARY}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Preference Image *</Text>
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

        <Text style={styles.label}>Quantity *</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={(value) => setQuantity(value.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
          placeholder="Enter quantity"
          placeholderTextColor={Colors.TEXT_SECONDARY}
        />

        <Text style={styles.label}>Expected Rate (GH₵) *</Text>
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
