import type { LinkingOptions } from '@react-navigation/native';
import * as ExpoLinking from 'expo-linking';
import { getErpNextPublicSiteUrl } from '../services/erpnext';
import type { RootStackParamList } from '../types';

function linkingPrefixes(): string[] {
  const site = getErpNextPublicSiteUrl().replace(/\/+$/, '');
  const prefixes: string[] = [];
  if (site) prefixes.push(site);
  try {
    const u = ExpoLinking.createURL('/');
    const origin = u.split('?')[0];
    if (origin && !prefixes.includes(origin)) prefixes.push(origin);
  } catch {
    /* noop */
  }
  return prefixes.length ? prefixes : ['https://localhost'];
}

/**
 * Universal / App Links for the root stack. Password reset opens `PasswordReset`
 * when the path is `/update-password` on the ERP site.
 */
export function createRootLinking(): LinkingOptions<RootStackParamList> {
  return {
    prefixes: linkingPrefixes(),
    config: {
      screens: {
        PasswordReset: {
          path: 'update-password',
          parse: {
            key: (value: string | undefined) => (value == null ? '' : String(value)),
          },
        },
      },
    },
  };
}
