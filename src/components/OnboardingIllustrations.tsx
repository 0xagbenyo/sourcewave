import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface IllustrationProps {
  size?: number;
  color?: string;
}

export const FindFavoriteItemsIllustration: React.FC<IllustrationProps> = ({ 
  size = 200, 
  color = '#FF6B6B' 
}) => (
  <View style={[styles.container, { width: size, height: size }]}>
    {/* Main Shopping Cart */}
    <View style={styles.mainIcon}>
      <Ionicons name="cart" size={size * 0.4} color={color} />
    </View>
    
    {/* Woman Icon */}
    <View style={styles.personIcon}>
      <Ionicons name="person" size={size * 0.3} color="#FFB6C1" />
    </View>
    
    {/* Search Icons */}
    <View style={styles.searchIcon}>
      <Ionicons name="search" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.checklistIcon}>
      <Ionicons name="checkmark-circle" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.bagIcon}>
      <Ionicons name="bag" size={size * 0.15} color={color} />
    </View>
    
    {/* Phone Icon */}
    <View style={styles.phoneIcon}>
      <Ionicons name="phone-portrait" size={size * 0.12} color="#4CAF50" />
    </View>
  </View>
);

export const EasyPaymentIllustration: React.FC<IllustrationProps> = ({ 
  size = 200, 
  color = '#FF6B6B' 
}) => (
  <View style={[styles.container, { width: size, height: size }]}>
    {/* Main Woman */}
    <View style={styles.mainIcon}>
      <Ionicons name="person" size={size * 0.4} color="#FFB6C1" />
    </View>
    
    {/* Phone with QR Code */}
    <View style={styles.phoneIcon}>
      <Ionicons name="phone-portrait" size={size * 0.2} color="#333" />
      <View style={styles.qrOverlay}>
        <Ionicons name="qr-code" size={size * 0.08} color="#000" />
      </View>
    </View>
    
    {/* Credit Card */}
    <View style={styles.cardIcon}>
      <Ionicons name="card" size={size * 0.25} color={color} />
    </View>
    
    {/* Security Icons */}
    <View style={styles.shieldIcon}>
      <Ionicons name="shield-checkmark" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.dollarIcon}>
      <Ionicons name="cash" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.clockIcon}>
      <Ionicons name="time" size={size * 0.15} color={color} />
    </View>
  </View>
);

export const ProductDeliveryIllustration: React.FC<IllustrationProps> = ({ 
  size = 200, 
  color = '#FF6B6B' 
}) => (
  <View style={[styles.container, { width: size, height: size }]}>
    {/* Main Scooter */}
    <View style={styles.mainIcon}>
      <Ionicons name="bicycle" size={size * 0.4} color={color} />
    </View>
    
    {/* Woman on Scooter */}
    <View style={styles.personIcon}>
      <Ionicons name="person" size={size * 0.3} color="#FFB6C1" />
    </View>
    
    {/* Package */}
    <View style={styles.packageIcon}>
      <Ionicons name="cube" size={size * 0.2} color="#4CAF50" />
    </View>
    
    {/* Delivery Icons */}
    <View style={styles.airplaneIcon}>
      <Ionicons name="airplane" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.locationIcon}>
      <Ionicons name="location" size={size * 0.15} color={color} />
    </View>
    
    <View style={styles.clockIcon}>
      <Ionicons name="time" size={size * 0.15} color={color} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainIcon: {
    position: 'absolute',
    zIndex: 1,
  },
  personIcon: {
    position: 'absolute',
    top: '25%',
    left: '35%',
    zIndex: 2,
  },
  phoneIcon: {
    position: 'absolute',
    top: '45%',
    right: '20%',
    zIndex: 3,
  },
  qrOverlay: {
    position: 'absolute',
    top: '20%',
    left: '20%',
  },
  cardIcon: {
    position: 'absolute',
    top: '50%',
    right: '10%',
    zIndex: 2,
  },
  searchIcon: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    zIndex: 3,
  },
  checklistIcon: {
    position: 'absolute',
    top: '20%',
    right: '15%',
    zIndex: 3,
  },
  bagIcon: {
    position: 'absolute',
    top: '10%',
    left: '25%',
    zIndex: 3,
  },
  shieldIcon: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    zIndex: 3,
  },
  dollarIcon: {
    position: 'absolute',
    top: '25%',
    right: '10%',
    zIndex: 3,
  },
  clockIcon: {
    position: 'absolute',
    top: '10%',
    left: '50%',
    zIndex: 3,
  },
  packageIcon: {
    position: 'absolute',
    top: '55%',
    right: '15%',
    zIndex: 2,
  },
  airplaneIcon: {
    position: 'absolute',
    top: '15%',
    left: '20%',
    zIndex: 3,
  },
  locationIcon: {
    position: 'absolute',
    top: '20%',
    right: '20%',
    zIndex: 3,
  },
});
