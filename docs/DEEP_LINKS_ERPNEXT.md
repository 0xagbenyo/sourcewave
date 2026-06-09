# Android App Links & iOS Universal Links (ERPNext / Frappe domain)

Password reset emails from ERPNext use links like:

`https://YOUR-SITE/update-password?key=...`

This app is configured so **the same hostname** as `EXPO_PUBLIC_ERPNEXT_URL` opens the in-app **Set new password** screen when the app is installed.

## 1. Keep `EXPO_PUBLIC_ERPNEXT_URL` as the site root

Use the **origin only** (no `/app`, `/desk`, `/login`):

```text
EXPO_PUBLIC_ERPNEXT_URL=https://sourcewave.frappe.cloud
```

`app.config.js` reads this at **EAS build** time to set:

- **Android**: `intent-filter` with `android:autoVerify="true"`, `https`, your host, `pathPrefix="/update-password"`.
- **iOS**: `associatedDomains` → `applinks:YOUR_HOST`.

Rebuild the app after changing the env var.

## 2. Android — host `assetlinks.json`

Serve this file **without redirects** (HTTPS, `200`, `application/json`):

`https://YOUR-SITE/.well-known/assetlinks.json`

Use the template in `hosting/well-known/assetlinks.json.example`:

1. Set `package_name` to your Android application id (this project: `com.agbenyo.sourcewaveapp` from `app.json` / `app.config.js`).
2. Set `sha256_cert_fingerprints` to your **Play App Signing** certificate SHA-256 (Google Play Console → Your app → **Test and release** → **App integrity** → **App signing key certificate**).  
   - For local debug builds, you can temporarily add your **debug** keystore SHA-256; production must use the key Google uses to sign releases.

3. Install on device, then verify:

```bash
adb shell pm get-app-links com.agbenyo.sourcewaveapp
```

Look for your host in `Verified` / `approved` state after Google has crawled `assetlinks.json` (can take up to a day; sometimes faster).

## 3. iOS — Associated Domains + `apple-app-site-association`

1. In **Apple Developer** → Identifiers → your App ID → **Associated Domains** capability: enable it.
2. In Xcode / EAS credentials, ensure the app’s **bundle identifier** matches what you put in the AASA file (this repo sets `com.agbenyo.sourcewaveapp` in `app.config.js` if missing from `app.json`).
3. Add domain: `applinks:YOUR_HOST` (same host as ERP, no `https://`).

Host **either**:

- `https://YOUR-SITE/.well-known/apple-app-site-association`  
  **or**
- `https://YOUR-SITE/apple-app-site-association`

Apple expects **no** `.json` extension, `Content-Type: application/json`, HTTPS, no redirects.

Edit `hosting/well-known/apple-app-site-association.example`:

- Replace `TEAMID` with your **Apple Team ID** (Membership page).
- Replace `com.agbenyo.sourcewaveapp` if your bundle id differs.
- Keep paths including `/update-password` (and optional `*` variants if you use trailing segments).

After deploy, use Apple’s **CDN** (they cache AASA); search “apple app site association validator” to test.

## 4. Nginx (Frappe / ERPNext behind reverse proxy)

Example locations (adjust `YOUR-SITE`):

```nginx
location = /.well-known/assetlinks.json {
    default_type application/json;
    add_header Cache-Control "public, max-age=3600";
    alias /var/www/erp-well-known/assetlinks.json;
}

location = /.well-known/apple-app-site-association {
    default_type application/json;
    add_header Cache-Control "public, max-age=3600";
    alias /var/www/erp-well-known/apple-app-site-association;
}
```

Do **not** redirect these URLs to `/login` or `/desk`.

## 5. App behaviour (already wired)

- **Cold start** on `https://HOST/update-password?key=...` → root **PasswordReset** screen with `key` passed in.
- **Warm open** → React Navigation `linking` config in `src/navigation/rootLinking.ts` maps the same path.
- Submit calls Frappe guest API `frappe.core.doctype.user.user.update_password` (`src/services/erpnext.ts` → `frappeGuestUpdatePasswordWithKey`).

## 6. If the app is not installed

The same URL still opens the ERPNext **web** reset page — no change required on the server for that fallback.

## 7. ERP upgrades

Keep nginx (or static file mounts) for `.well-known` outside Frappe’s release overwrite path, or re-copy the two files after upgrades if you manage them inside the bench.
