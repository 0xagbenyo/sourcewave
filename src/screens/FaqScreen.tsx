import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TextInput,
  TouchableOpacity,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import type { RootStackParamList } from '../types';

const hairline = StyleSheet.hairlineWidth;

type FaqPage = { title: string; body: string };

type FaqJson = {
  buyerPages: FaqPage[];
  supplierPages: FaqPage[];
};

const faqContent = require('../locales/faqContent.json') as FaqJson;

function letterBucket(title: string): string {
  const c = title.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

function matchesLetterFilter(title: string, letterFilter: string | null): boolean {
  if (!letterFilter) return true;
  return letterBucket(title) === letterFilter;
}

export const FaqScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'Faq'>>();
  const scope = route.params?.scope === 'supplier' ? 'supplier' : 'buyer';
  const [query, setQuery] = useState('');
  const [letterFilter, setLetterFilter] = useState<string | null>(null);

  const pages = useMemo(
    () => (scope === 'supplier' ? faqContent.supplierPages : faqContent.buyerPages) || [],
    [scope]
  );

  const searching = query.trim().length > 0;

  useEffect(() => {
    if (searching) setLetterFilter(null);
  }, [searching]);

  const basePages = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = pages;
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
      );
    } else if (letterFilter) {
      list = list.filter((p) => matchesLetterFilter(p.title, letterFilter));
    }
    return list;
  }, [pages, query, letterFilter]);

  const letterBuckets = useMemo(() => {
    const set = new Set<string>();
    for (const p of pages) {
      set.add(letterBucket(p.title));
    }
    return [...set].sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
  }, [pages]);

  const sections = useMemo(() => {
    const map = new Map<string, FaqPage[]>();
    for (const p of basePages) {
      const key = letterBucket(p.title);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ title: k, data: map.get(k)! }));
  }, [basePages]);

  const title = scope === 'supplier' ? t('faq.supplierTitle') : t('faq.buyerTitle');

  const renderItem = ({ item }: { item: FaqPage }) => (
    <View style={styles.block}>
      <Text style={styles.itemTitle}>{item.title}</Text>
      <Text style={styles.itemBody}>{item.body}</Text>
    </View>
  );

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>
        {section.title === '#' ? t('faq.otherLetter') : section.title}
      </Text>
    </View>
  );

  const listEmpty = (
    <View style={styles.emptyWrap}>
      <Ionicons name="search-outline" size={40} color={Colors.MEDIUM_GRAY} />
      <Text style={styles.emptyText}>{t('faq.noResults')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Header showBackButton title={title} />
      <View style={styles.body}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={Colors.TEXT_SECONDARY} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('faq.searchPlaceholder')}
            placeholderTextColor={Colors.TEXT_SECONDARY}
            returnKeyType="search"
            clearButtonMode="never"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                Keyboard.dismiss();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('faq.clearSearchA11y')}
            >
              <Ionicons name="close-circle" size={22} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          ) : null}
        </View>

        {!searching && letterBuckets.length > 0 ? (
          <View style={styles.chipsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                onPress={() => setLetterFilter(null)}
                style={[styles.chip, !letterFilter && styles.chipActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, !letterFilter && styles.chipTextActive]}>
                  {t('faq.allLetters')}
                </Text>
              </TouchableOpacity>
              {letterBuckets.map((L) => {
                const active = letterFilter === L;
                const label = L === '#' ? t('faq.otherLetter') : L;
                return (
                  <TouchableOpacity
                    key={L}
                    onPress={() => setLetterFilter((prev) => (prev === L ? null : L))}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {basePages.length > 0 &&
        (searching || letterFilter !== null || basePages.length !== pages.length) ? (
          <Text style={styles.countLine}>{t('faq.matchingCount', { count: basePages.length })}</Text>
        ) : null}

        {basePages.length === 0 ? (
          <View style={styles.emptyContainer}>{listEmpty}</View>
        ) : (
          <SectionList
            style={styles.sectionList}
            sections={sections}
            keyExtractor={(item, index) => `${scope}-${item.title}-${index}`}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={Platform.OS === 'ios'}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <View style={styles.blockSep} />}
            onScrollBeginDrag={() => Keyboard.dismiss()}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.OFF_WHITE,
  },
  body: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.WHITE,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.BLACK,
    paddingVertical: 0,
    minHeight: 22,
  },
  chipsWrap: {
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
    backgroundColor: Colors.OFF_WHITE,
    paddingBottom: 8,
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    flexGrow: 0,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: hairline,
    borderColor: Colors.BORDER,
    backgroundColor: Colors.WHITE,
  },
  chipActive: {
    borderColor: Colors.WINE,
    backgroundColor: 'rgba(230, 0, 18, 0.06)',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  chipTextActive: {
    color: Colors.WINE,
  },
  countLine: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.TEXT_SECONDARY,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingTop: 4,
    paddingBottom: 6,
  },
  sectionList: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
    backgroundColor: Colors.WHITE,
  },
  sectionHeader: {
    backgroundColor: Colors.LIGHT_GRAY,
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 8,
    borderBottomWidth: hairline,
    borderBottomColor: Colors.BORDER,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.TEXT_SECONDARY,
    letterSpacing: 1,
  },
  block: {
    paddingHorizontal: Spacing.SCREEN_PADDING,
    paddingVertical: 14,
    backgroundColor: Colors.WHITE,
  },
  blockSep: {
    height: hairline,
    backgroundColor: Colors.BORDER,
    marginLeft: Spacing.SCREEN_PADDING,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.BLACK,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  itemBody: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
    fontWeight: '400',
  },
  emptyContainer: {
    flex: 1,
    minHeight: 200,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
});
