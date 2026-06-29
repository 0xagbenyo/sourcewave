import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErpAuthenticatedImage } from './ErpAuthenticatedImage';
import type { ChatImageGalleryItem } from '../utils/ravenChatImageGallery';

type Props = {
  visible: boolean;
  items: ChatImageGalleryItem[];
  initialIndex: number;
  onClose: () => void;
};

export const ChatImageGalleryModal: React.FC<Props> = ({ visible, items, initialIndex, onClose }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ChatImageGalleryItem>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const safeInitial = Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0));

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(safeInitial);
    const t = setTimeout(() => {
      if (items.length === 0) return;
      try {
        listRef.current?.scrollToIndex({ index: safeInitial, animated: false });
      } catch {
        listRef.current?.scrollToOffset({ offset: safeInitial * width, animated: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [visible, safeInitial, items.length, width]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / width);
      if (idx >= 0 && idx < items.length) setActiveIndex(idx);
    },
    [items.length, width]
  );

  const activeItem = items[activeIndex];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarText}>
            <Text style={styles.title} numberOfLines={1}>
              {activeItem?.title || 'Image'}
            </Text>
            {items.length > 1 ? (
              <Text style={styles.counter}>
                {activeIndex + 1} / {items.length}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close-circle" size={40} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {items.length > 0 ? (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={items.length > 0 ? safeInitial : undefined}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onMomentumScrollEnd={onMomentumScrollEnd}
            renderItem={({ item }) => (
              <View style={[styles.page, { width, height: height - insets.top - insets.bottom - 72 }]}>
                <ErpAuthenticatedImage uri={item.uri} style={styles.image} resizeMode="contain" />
              </View>
            )}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 50,
    elevation: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topBarText: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  counter: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: { padding: 4 },
  page: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});
