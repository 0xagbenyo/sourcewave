import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { getERPNextBaseUrl } from '../services/erpnext';

type Props = {
  linkDoctype: string;
  linkDocument: string;
};

/** ERPNext desk path uses lowercased doctype with spaces → hyphens (e.g. `Purchase Order` → `purchase-order`). */
function deskRouteSlug(doctype: string): string {
  return doctype.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildDeskDocUrl(doctype: string, docname: string): string {
  const base = getERPNextBaseUrl().replace(/\/+$/, '');
  const slug = deskRouteSlug(doctype);
  const name = encodeURIComponent(docname.trim());
  return `${base}/app/${slug}/${name}`;
}

/**
 * Linked Raven message for any Frappe DocType (not handled by a dedicated in-app card).
 * Matches Raven web’s “document chip” at a minimal level so the thread never shows an empty bubble.
 */
export const RavenLinkedGenericDocMessage: React.FC<Props> = ({ linkDoctype, linkDocument }) => {
  const dt = linkDoctype.trim();
  const dn = linkDocument.trim();

  const openInDesk = useCallback(() => {
    const url = buildDeskDocUrl(dt, dn);
    void Linking.canOpenURL(url).then((ok) => {
      if (ok) void Linking.openURL(url);
      else Alert.alert('Open document', 'Could not open this URL on your device.');
    });
  }, [dt, dn]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={openInDesk}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Open ${dt} ${dn}`}
    >
      <View style={styles.head}>
        <Ionicons name="document-text-outline" size={22} color={RavenLight.accent} style={{ marginRight: 8 }} />
        <Text style={styles.headTitle} numberOfLines={1}>
          {dt}
        </Text>
      </View>
      <Text style={styles.docId} numberOfLines={2}>
        {dn}
      </Text>
      <View style={styles.row}>
        <Text style={styles.hint}>View document</Text>
        <Ionicons name="open-outline" size={18} color={RavenLight.accent} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: RavenLight.radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    backgroundColor: RavenLight.panel,
    padding: 12,
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: RavenLight.text },
  docId: { marginTop: 6, fontSize: 15, fontWeight: '600', color: RavenLight.accent },
  row: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { fontSize: 12, color: RavenLight.textSubtle },
});
