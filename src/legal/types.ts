export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'notice'; text: string };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  id: 'privacy' | 'terms';
  title: string;
  metaLine: string;
  intro?: string;
  sections: LegalSection[];
  closing?: string;
  footerLine?: string;
};

/** Bump when policy text changes — users must re-accept before registering. */
export const LEGAL_ACCEPTANCE_VERSION = '1.0';
