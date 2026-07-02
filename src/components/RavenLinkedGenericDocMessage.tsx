import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getERPNextBaseUrl } from '../services/erpnext';
import { appAlert as Alert } from '../services/appAlert';
import { ravenChatDocCardColors, ravenChatDocCardStyle, ravenChatDocSharedLabelStyle } from '../utils/ravenChatDocCard';

type Props = {
  linkDoctype: string;
  linkDocument: string;
  mine?: boolean;
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
export const RavenLinkedGenericDocMessage: React.FC<Props> = ({ linkDoctype, linkDocument, mine }) => {
  const dt = linkDoctype.trim();
  const dn = linkDocument.trim();
  const colors = ravenChatDocCardColors(mine);

  const openInDesk = useCallback(() => {
    const url = buildDeskDocUrl(dt, dn);
    void Linking.canOpenURL(url).then((ok) => {
      if (ok) void Linking.openURL(url);
      else Alert.alert('Open document', 'Could not open this URL on your device.');
    });
  }, [dt, dn]);

  return (
    <TouchableOpacity
      style={ravenChatDocCardStyle(mine)}
      onPress={openInDesk}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Open ${dt} ${dn}`}
    >
      {mine ? <Text style={ravenChatDocSharedLabelStyle(mine)}>You shared</Text> : null}
      <View style={styles.head}>
        <Ionicons name="document-text-outline" size={22} color={colors.icon} style={{ marginRight: 8 }} />
        <Text style={[styles.headTitle, { color: colors.title }]} numberOfLines={1}>
          {dt}
        </Text>
      </View>
      <Text style={[styles.docId, { color: colors.body }]} numberOfLines={2}>
        {dn}
      </Text>
      <View style={styles.row}>
        <Text style={[styles.hint, { color: colors.hint }]}>View document</Text>
        <Ionicons name="open-outline" size={18} color={colors.icon} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  docId: { marginTop: 6, fontSize: 15, fontWeight: '600' },
  row: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { fontSize: 12 },
});
