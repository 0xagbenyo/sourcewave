# Let the API user write **Raven User.custom_customer**

The app sets **`custom_customer`** with `frappe.client.set_value` or `PUT /api/resource/Raven User/{name}`. Frappe checks the **User** linked to your **API key** (the one in `EXPO_PUBLIC_ERPNEXT_API_KEY` / `EXPO_PUBLIC_ERPNEXT_API_SECRET`). That user must have **Write** on **Raven User** (there is no separate “field-only” write for Link fields—the whole document needs **Write**).

## 1. Find the integration user

**Users** → open the user whose credentials you use in the app → note **Roles** (e.g. `System Manager`, a custom **Integration** role, etc.).

## 2. Role Permission Manager

**Role Permission Manager** → **Select Role** = one of those roles (repeat for each role if the user has several that should be able to update Raven User).

Set **Document Type** to **Raven User**.

## 3. Turn on Read + Write

For **Raven User**, enable at least:

- **Read**
- **Write**

Save.

If your site uses **Level** permissions (Perm Level), ensure level **0** (or the level that contains `custom_customer`) allows **Write** for that role.

## 4. User permissions (if updates still fail)

If **Raven User** has **User Permissions** or row-level rules, the API user must still be allowed to see and save the row you update (same `name` as in the error, often equal to the Frappe user id / email).

## 5. Cache

Self-hosted: `bench clear-cache`. Frappe Cloud: wait a short time or reload.

## 6. Fallback in the app

If you intentionally keep the API user without **Write** on **Raven User**, set **`EXPO_PUBLIC_RAVEN_USER_SET_CUSTOMER_METHOD`** in `.env` to a **whitelisted** server method that updates **`custom_customer`** (see `.env.example` for a minimal example).
