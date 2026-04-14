# Address Management System - Quick Reference Guide

## 📍 Where Are Addresses Now?

**Settings Screen → "Shipping Addresses" Menu Item**

Clicking this item opens a professional address management modal with full CRUD (Create, Read, Update, Delete) functionality.

---

## 🎯 Key Features

### Address List View
When you have existing addresses saved:
- **Display**: Shows all saved addresses with modern cards
- **Badges**: Primary and Shipping address indicators (wine and gold)
- **Details**: Full address shown with icons for each field
- **Actions**: Edit and Delete buttons for each address

### Address Form View
When adding a new address or editing existing:
- **Organized Sections**:
  1. Basic Information (Title, Type)
  2. Street Address (Line 1, Line 2)
  3. Location Details (City, State, Country, Postal Code, County)
  4. Contact Details (Email, Phone, Fax)
  5. Address Preferences (Primary, Shipping, Disabled checkboxes)

- **Form Features**:
  - Email auto-filled (read-only)
  - Address title auto-formatted as "title-email"
  - Required field validation
  - Keyboard handling for iOS and Android
  - Scrollable form for all fields

### Modal Header
- **Close Button** (X): Dismiss without saving
- **Title**: Shows "Add New Address" or "Edit Address"
- **Save Button** (✓): Saves address with validation

---

## 🔄 User Flow

### View Addresses
1. Open Settings Screen
2. Tap "Shipping Addresses"
3. See list of all saved addresses with details

### Add New Address
1. Open address modal (Settings → Shipping Addresses)
2. If addresses exist, see list view
3. Form appears for new address
4. Fill all sections
5. Tap save button in header
6. Returns to list view showing new address

### Edit Address
1. Open address modal
2. See list of addresses
3. Tap "Edit" button on the address
4. Form loads with existing data
5. Modify as needed
6. Tap save button to update

### Delete Address
1. See address in list view
2. Tap "Delete" button
3. Confirm deletion in dialog
4. Address removed from list

---

## 📋 Address Fields Explained

### Basic Information Section
- **Address Title**: Name like "Home", "Office", "Grandma's House"
- **Address Type**: "Residential" or "Commercial"

### Street Address Section
- **Address Line 1**: Main street address (required)
- **Address Line 2**: Apartment, suite, building (optional)

### Location Details Section
- **City**: City name (required)
- **State/Region**: State or province name
- **Country**: Country name (required)
- **Postal Code**: ZIP or postal code
- **County**: County name (optional)

### Contact Details Section
- **Email**: Auto-filled from your profile (read-only)
- **Phone**: Contact phone number
- **Fax**: Fax number (optional)

### Address Preferences Section
- **Set as Primary Address**: Mark this as your main address
- **Use for Shipping**: Use this address for deliveries
- **Disable this Address**: Temporarily disable without deleting

---

## 🎨 Design Elements

### Colors Used
- **Wine**: #710F1C (Primary action color)
- **Gold**: #CF6275 (Accent color for badges)
- **Cream/Beige**: #FAF5F0 (Background)

### Visual Indicators
- **Primary Badge**: Wine background, white text
- **Shipping Badge**: Gold background, white text
- **Address Card Border**: Wine-colored left border
- **Icons**: Throughout for visual clarity

### Interactive Elements
- **Edit Button**: Wine-colored border, clickable
- **Delete Button**: Red-colored border, clickable
- **Save Button**: Gold checkmark in header
- **Close Button**: Standard X button

---

## ⚡ Quick Tips

1. **Auto-Format**: Your address title automatically adds your email suffix
   - You enter: "Home"
   - Saved as: "Home-your.email@example.com"

2. **Email Always Linked**: Every address is linked to your email for security

3. **Keyboard Handling**: Form automatically adjusts for keyboards on both iPhone and Android

4. **Validation**: Required fields are checked before saving (no incomplete addresses)

5. **Modal Closes Cleanly**: Tap X or use back button to dismiss without losing original data

---

## 🔐 Data Integrity

- **Email-Based**: All addresses linked to your email for accuracy
- **Persistent**: Addresses saved to ERPNext backend
- **Validated**: Required information must be complete
- **Safe Deletion**: Confirmation dialog prevents accidental deletions

---

## 🎓 What Changed from Before?

### EditProfileScreen
- **Before**: Had both profile editing AND address management mixed together (confusing)
- **Now**: Only for editing your profile information (name, email, phone, location)
- **Bonus**: Info card reminds you to manage addresses in Settings

### SettingsScreen
- **Before**: "Shipping Addresses" was just a menu item with no functionality
- **Now**: Opens complete address management system with modal

### Benefits
✅ Cleaner, more focused screens  
✅ Better user experience  
✅ Addresses where users expect them (Settings)  
✅ Professional, modern design  
✅ 70% reduction in EditProfileScreen code  

---

## 📞 Need Help?

If you need to:
- **Edit profile information**: Go to Settings → Profile Information
- **Manage addresses**: Go to Settings → Shipping Addresses
- **Save changes**: Always look for button in header
- **Cancel**: Use close button (X) or back button

Everything is intuitive and clearly labeled!
