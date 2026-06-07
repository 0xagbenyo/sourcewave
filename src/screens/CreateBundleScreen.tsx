import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { useUserSession } from '../context/UserContext';
import { useNavigation } from '@react-navigation/native';
import { getERPNextClient } from '../services/erpnext';
import { mapERPItemToProduct } from '../services/mappers';
import { ErpAuthenticatedImage } from '../components/ErpAuthenticatedImage';

interface BundleItem {
  id: string;
  item_code: string;
  item_name: string;
  qty: number;
  description: string;
}

interface SearchItem {
  id: string;
  name: string;
  item_code: string;
  item_name: string;
  images?: string[];
}

const { width } = Dimensions.get('window');

export const CreateBundleScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useUserSession();
  
  // Form state
  const [parentItemCode, setParentItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [customer, setCustomer] = useState('');
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);
  
  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingBundle, setCreatingBundle] = useState(false);
  const [showSearch, setShowSearch] = useState(true);

  // Set customer email from user session on mount
  useEffect(() => {
    if (user?.email) {
      setCustomer(user.email);
    }
  }, [user?.email]);

  // Search items
  const searchItems = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      const client = getERPNextClient();
      const results = await client.searchWebsiteItems(query);
      const mappedResults = (results || []).map((item: any) => ({
        id: item.name,
        name: item.name,
        item_code: item.item_code,
        item_name: item.item_name || item.name,
        images: mapERPItemToProduct(item).images,
      }));
      setSearchResults(mappedResults);
    } catch (error) {
      console.error('Error searching items:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = (item: SearchItem) => {
    // Check if item already exists
    if (bundleItems.some(bi => bi.item_code === item.item_code)) {
      Alert.alert('Info', 'This item is already in the bundle');
      return;
    }

    const newItem: BundleItem = {
      id: Math.random().toString(),
      item_code: item.item_code,
      item_name: item.item_code,
      qty: 1,
      description: '',
    };
    setBundleItems([...bundleItems, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setBundleItems(bundleItems.filter(item => item.id !== id));
  };

  const handleUpdateQty = (id: string, qty: number) => {
    setBundleItems(bundleItems.map(item => 
      item.id === id ? { ...item, qty: Math.max(1, qty) } : item
    ));
  };

  const handleUpdateDesc = (id: string, description: string) => {
    setBundleItems(bundleItems.map(item => 
      item.id === id ? { ...item, description } : item
    ));
  };

  const handleCreateBundle = async () => {
    const trimmedBundleTitle = parentItemCode.trim();
    
    if (!trimmedBundleTitle) {
      Alert.alert('Error', 'Please enter a bundle title');
      return;
    }

    if (!customer.trim()) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }

    if (bundleItems.length === 0) {
      Alert.alert('Error', 'Please add at least one item to the bundle');
      return;
    }

    setCreatingBundle(true);
    try {
      const client = getERPNextClient();
      
      // Step 1: Create the Item with item_group "Product Bundle"
      const itemData = {
        item_code: trimmedBundleTitle,
        item_name: trimmedBundleTitle,
        item_group: 'Product Bundle',
        description: description || '',
        is_item: 1,
        is_stock_item: 0,
        stock_uom: 'Nos',
      };

      console.log('Creating item:', itemData);
      await (client as any).client.post('/api/resource/Item', itemData);
      console.log('Item created successfully');

      // Step 2: Create the Product Bundle
      const bundleData: any = {
        new_item_code: trimmedBundleTitle,
        description: description,
        items: bundleItems.map((item, index) => ({
          item_code: item.item_code,
          qty: item.qty,
          description: item.description,
          idx: index + 1,
        })),
      };

      // Only include customer if it's a valid customer (you can add validation here)
      if (customer && customer.trim()) {
        bundleData.custom_customer = customer;
      }

      console.log('Creating bundle:', bundleData);
      await (client as any).client.post('/api/resource/Product Bundle', bundleData);
      console.log('Bundle created successfully');
      
      Alert.alert('Success', 'Bundle created successfully!', [
        {
          text: 'OK',
          onPress: () => (navigation as any).goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error creating bundle:', error);
      
      // Check if it's a duplicate item error
      if (error.response?.status === 409 || error.message?.includes('DuplicateEntryError') || 
          (error.response?.data?._server_messages && error.response.data._server_messages.includes('already exists'))) {
        Alert.alert(
          'Item Already Exists',
          `An item with the name "${parentItemCode}" already exists in the system. Please use a different bundle title.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to create bundle. Please try again.');
      }
    } finally {
      setCreatingBundle(false);
    }
  };

  const renderSearchItem = ({ item }: { item: SearchItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.searchItemCard,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => handleAddItem(item)}
    >
      <View style={styles.searchItemContent}>
        {item.images && item.images[0] && (
          <ErpAuthenticatedImage uri={item.images[0]} style={styles.searchItemImage} resizeMode="cover" />
        )}
        <View style={styles.searchItemText}>
          <Text style={styles.searchItemName} numberOfLines={2}>{item.item_name}</Text>
          <Text style={styles.searchItemCode} numberOfLines={1}>{item.id}</Text>
        </View>
      </View>
      <Ionicons name="add-circle" size={24} color="#34C759" />
    </Pressable>
  );

  const renderBundleItem = ({ item, index }: { item: BundleItem; index: number }) => (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.noColumn]}>{index + 1}</Text>
      <View style={[styles.tableCell, styles.itemColumn]}>
        <Text numberOfLines={1}>{item.item_name}</Text>
      </View>
      <View style={[styles.tableCell, styles.qtyColumn]}>
        <TouchableOpacity
          onPress={() => handleUpdateQty(item.id, item.qty - 1)}
          style={styles.qtyButtonMinus}
        >
          <Ionicons name="remove" size={14} color="white" />
        </TouchableOpacity>
        <TextInput
          style={styles.qtyInput}
          value={item.qty.toString()}
          onChangeText={(val) => handleUpdateQty(item.id, parseInt(val) || 1)}
          keyboardType="numeric"
        />
        <TouchableOpacity
          onPress={() => handleUpdateQty(item.id, item.qty + 1)}
          style={styles.qtyButtonPlus}
        >
          <Ionicons name="add" size={14} color="white" />
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.tableCell, styles.descColumn]}
        placeholder="Desc"
        value={item.description}
        onChangeText={(text) => handleUpdateDesc(item.id, text)}
        placeholderTextColor={Colors.TEXT_SECONDARY}
      />
      <TouchableOpacity
        style={[styles.tableCell, styles.actionColumn]}
        onPress={() => handleRemoveItem(item.id)}
      >
        <Ionicons name="trash-outline" size={14} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
        <TouchableOpacity onPress={() => (navigation as any).goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.ROYAL_BLUE} />
        </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Bundle</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Bundle Details Header */}
        <View style={styles.bundleDetailsHeaderContainer}>
          <TouchableOpacity 
            style={styles.toggleSearchButton}
            onPress={() => setShowSearch(!showSearch)}
          >
            <Ionicons 
              name={showSearch ? "chevron-back" : "chevron-forward"} 
              size={24} 
              color={Colors.WHITE}
            />
          </TouchableOpacity>
          <Text style={styles.bundleDetailsTitle}>Bundle Details</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* LEFT SIDE - Search */}
        {showSearch && (
          <View style={styles.leftPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Search Items</Text>
              <TouchableOpacity onPress={() => setShowSearch(false)}>
                <Ionicons name="chevron-back" size={24} color="#2D2D4A" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.TEXT_SECONDARY} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search items..."
                value={searchInput}
                onChangeText={(text) => {
                  setSearchInput(text);
                  searchItems(text);
                }}
                placeholderTextColor={Colors.TEXT_SECONDARY}
              />
            </View>

            {loading && <ActivityIndicator size="large" color="#5E72E4" />}
            
            <FlatList
              data={searchResults}
              renderItem={renderSearchItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={true}
              style={styles.searchList}
            />
          </View>
        )}

        {/* RIGHT SIDE - Forms & Table */}
        <View style={[styles.rightPanel, !showSearch && styles.rightPanelExpanded]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Bundle Details */}
            <View style={styles.formSection}>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Bundle Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter bundle title"
                  value={parentItemCode}
                  onChangeText={setParentItemCode}
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter description"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Customer *</Text>
                <TextInput
                  style={[styles.input, styles.readOnlyInput]}
                  value={customer}
                  editable={false}
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                />
              </View>
            </View>

            {/* Bundle Items Table */}
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Items in Bundle</Text>
              
              {bundleItems.length > 0 ? (
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, styles.noColumn]}>No.</Text>
                    <Text style={[styles.tableHeaderCell, styles.itemColumn]}>Item</Text>
                    <Text style={[styles.tableHeaderCell, styles.qtyColumn]}>Qty</Text>
                    <Text style={[styles.tableHeaderCell, styles.descColumn]}>Description</Text>
                    <Text style={[styles.tableHeaderCell, styles.actionColumn]}>Act</Text>
                  </View>
                  <FlatList
                    data={bundleItems}
                    renderItem={renderBundleItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                  />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={40} color={Colors.TEXT_SECONDARY} />
                  <Text style={styles.emptyText}>No items added yet</Text>
                  <Text style={styles.emptySubtext}>Search and add items from the left</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, creatingBundle && styles.submitButtonDisabled]}
            onPress={handleCreateBundle}
            disabled={creatingBundle}
          >
            {creatingBundle ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.WHITE} />
                <Text style={styles.submitButtonText}>Create Bundle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF7FF',
  },
  header: {
    flexDirection: 'column',
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 55,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ROYAL_BLUE,
    letterSpacing: 0.5,
  },
  bundleDetailsHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.ROYAL_BLUE,
    borderTopWidth: 0,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bundleDetailsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.WHITE,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  toggleSearchButton: {
    padding: 8,
    position: 'absolute',
    left: 16,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#E8E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FAFBFE',
  },
  rightPanel: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#F8F7FF',
  },
  rightPanelExpanded: {
    flex: 1.6,
  },
  expandButton: {
    padding: 8,
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2D2D4A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 10,
    fontSize: 14,
    color: Colors.BLACK,
    fontWeight: '500',
  },
  searchList: {
    flex: 1,
  },
  searchItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.WHITE,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.GOLD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchItemImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F0F0FF',
    borderWidth: 1,
    borderColor: '#E8E8F0',
  },
  searchItemText: {
    flex: 1,
  },
  searchItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2D4A',
  },
  searchItemCode: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
  formSection: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 6,
    elevation: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.WINE,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2D4A',
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  input: {
    borderWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.BLACK,
    backgroundColor: Colors.WHITE,
    fontWeight: '500',
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  readOnlyInput: {
    backgroundColor: '#F0F4FF',
    color: '#5E72E4',
    fontWeight: '700',
    borderColor: '#DDE2F5',
  },
  tableContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 0,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F5E8ED',
    paddingVertical: 0,
  },
  tableHeaderCell: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.WINE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: Colors.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8F0',
    alignItems: 'center',
  },
  tableCell: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 12,
    color: '#2D2D4A',
    fontWeight: '500',
  },
  noColumn: {
    width: '8%',
    textAlign: 'center',
  },
  itemColumn: {
    width: '32%',
  },
  qtyColumn: {
    width: '20%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  descColumn: {
    width: '25%',
    borderWidth: 0,
    borderRadius: 6,
    paddingHorizontal: 6,
    marginHorizontal: 2,
  },
  actionColumn: {
    width: '15%',
    textAlign: 'center',
    justifyContent: 'center',
  },
  qtyButton: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  qtyButtonMinus: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.ERROR,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  qtyButtonPlus: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  qtyInput: {
    width: 24,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2D4A',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D4A',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: Colors.SUCCESS,
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    shadowColor: Colors.SUCCESS,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.WHITE,
    letterSpacing: 0.5,
  },
});
