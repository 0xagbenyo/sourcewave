import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import { getRavenChannelDisplayLabel, type RavenChannelRow } from '../services/ravenNativeApi';
import { isDmChannel, initialsFromUserId, pastelAvatarBg } from '../utils/ravenChatUi';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';

export type RavenChannelPeerAvatarProps = {
  channel: RavenChannelRow;
  currentUserEmail?: string | null;
  size?: number;
  /** `raven` = light Raven UI; `wine` = NativeRavenChat bar. */
  variant?: 'raven' | 'wine';
};

/**
 * Avatar for a Raven channel row: DM → peer photo or initials; group → generic channel icon.
 */
export const RavenChannelPeerAvatar: React.FC<RavenChannelPeerAvatarProps> = ({
  channel,
  currentUserEmail,
  size = 36,
  variant = 'raven',
}) => {
  const s = size;
  const dm = isDmChannel(channel);
  const label = getRavenChannelDisplayLabel(channel, currentUserEmail);
  const seed = (channel.peer_user_id || channel.channel_name || channel.name || label || '?').trim();
  const img = channel.peer_user_image != null ? String(channel.peer_user_image).trim() : '';

  if (dm) {
    const initialsSource = label || seed;
    return (
      <View style={[styles.wrap, { width: s, height: s, borderRadius: s / 2 }]}>
        {img ? (
          <ErpAuthenticatedImage
            uri={img}
            style={{ width: s, height: s, borderRadius: s / 2 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.fallback,
              { width: s, height: s, borderRadius: s / 2, backgroundColor: pastelAvatarBg(seed || initialsSource) },
            ]}
          >
            <Text style={[styles.initials, { fontSize: Math.max(11, s * 0.36) }]}>
              {initialsFromUserId(initialsSource)}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const isWine = variant === 'wine';
  return (
    <View
      style={[
        styles.wrap,
        styles.groupWrap,
        {
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: isWine ? '#FAF0F2' : RavenLight.canvas,
        },
      ]}
    >
      <Ionicons name="people-outline" size={s * 0.48} color={isWine ? Colors.WINE : RavenLight.textMuted} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800', color: '#fff' },
  groupWrap: { alignItems: 'center', justifyContent: 'center' },
});
