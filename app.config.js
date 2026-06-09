/**
 * Expo config — Android App Links + iOS Universal Links use the **same hostname**
 * as `EXPO_PUBLIC_ERPNEXT_URL` (your Frappe / ERPNext site).
 *
 * Set before EAS build, e.g.:
 *   EXPO_PUBLIC_ERPNEXT_URL=https://sourcewave.frappe.cloud npx eas build --platform all
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

function erpHostnameFromEnv() {
  const raw = process.env.EXPO_PUBLIC_ERPNEXT_URL || 'https://sourcewave.frappe.cloud';
  try {
    return new URL(raw.trim()).hostname;
  } catch {
    return 'sourcewave.frappe.cloud';
  }
}

module.exports = () => {
  const host = erpHostnameFromEnv();
  const expo = { ...appJson.expo };

  // iOS Universal Links — must match hosted `apple-app-site-association` on this host.
  expo.ios = {
    ...expo.ios,
    bundleIdentifier: expo.ios?.bundleIdentifier || 'com.agbenyo.sourcewaveapp',
    associatedDomains: [`applinks:${host}`],
  };

  // Android App Links — `autoVerify` + HTTPS host + pathPrefix for Frappe reset link.
  expo.android = {
    ...expo.android,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host,
            pathPrefix: '/update-password',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  };

  return { expo };
};
