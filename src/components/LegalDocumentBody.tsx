import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import type { LegalDocument } from '../legal/types';

type Props = {
  document: LegalDocument;
  /** Skip title and meta (e.g. when stacked after a section heading on the consent screen). */
  hideHeader?: boolean;
};

export const LegalDocumentBody: React.FC<Props> = ({ document, hideHeader }) => {
  return (
    <View>
      {!hideHeader ? (
        <>
          <Text style={styles.docTitle}>{document.title}</Text>
          <Text style={styles.meta}>{document.metaLine}</Text>
        </>
      ) : null}
      {document.intro ? <Text style={styles.paragraph}>{document.intro}</Text> : null}
      {document.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.sectionHeading}>{section.heading}</Text>
          {section.blocks.map((block, i) => {
            if (block.type === 'p') {
              return (
                <Text key={`${section.heading}-p-${i}`} style={styles.paragraph}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === 'notice') {
              return (
                <View key={`${section.heading}-n-${i}`} style={styles.noticeBox}>
                  <Text style={styles.noticeText}>{block.text}</Text>
                </View>
              );
            }
            return (
              <View key={`${section.heading}-ul-${i}`} style={styles.listWrap}>
                {block.items.map((item) => (
                  <View key={item.slice(0, 48)} style={styles.listRow}>
                    <Text style={styles.bullet}>{'\u2022'}</Text>
                    <Text style={styles.listItem}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ))}
      {document.closing ? <Text style={styles.closing}>{document.closing}</Text> : null}
      {document.footerLine ? <Text style={styles.footer}>{document.footerLine}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  docTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.BLACK,
    letterSpacing: -0.4,
  },
  meta: {
    marginTop: 6,
    marginBottom: Spacing.MD,
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontWeight: '600',
  },
  section: {
    marginTop: Spacing.LG,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.BLACK,
    letterSpacing: 0.3,
    marginBottom: Spacing.SM,
    textTransform: 'uppercase',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
    marginBottom: Spacing.SM,
  },
  listWrap: {
    marginBottom: Spacing.SM,
    gap: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
    marginTop: 1,
  },
  listItem: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
  },
  noticeBox: {
    marginVertical: Spacing.SM,
    padding: Spacing.MD,
    borderRadius: 10,
    backgroundColor: '#FFF8E6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8D5A0',
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.DARK_GRAY,
  },
  closing: {
    marginTop: Spacing.LG,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.BLACK,
  },
  footer: {
    marginTop: Spacing.MD,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
});
