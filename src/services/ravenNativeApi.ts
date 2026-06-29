/**
 * Native chat: call Raven/Frappe like the Raven web app — whitelisted methods + resource APIs.
 * After password login, requests use the **Frappe session cookie** so messages and uploads are attributed
 * to the logged-in user; without a captured session, calls fall back to the API key (integration user).
 * Channel lists use `raven.api.raven_channel.get_channels`, not raw resource filters where possible.
 * Global search uses `raven.api.search.get_search_result` (same server query as Raven web Cmd/Ctrl+K search).
 *
 * @see https://github.com/The-Commit-Company/raven
 */
import {
  ravenCallFrappeMethod,
  ravenListResourceRows,
  ravenCreateResourceDoc,
  ravenCallMultipartFrappeMethod,
  ravenGetResourceDoc,
  ravenDeleteResourceDoc,
  hasFrappeRavenSession,
} from './frappeRavenSession';
import { plainTextFromMaybeHtml } from '../utils/chatPlainText';
import { sanitizeRavenWebMessageFileUrl } from '../utils/ravenFileUrl';
import { prepareLocalFileUriForUpload } from '../utils/ravenUploadFilePrep';
import { getERPNextClient } from './erpnext';
import {
  friendlySenderLabel,
  ravenUserProfileFullName,
  resolveRavenUserDisplayName,
  type RavenUserDisplayProfiles,
} from '../utils/ravenSearchPreview';
import { dedupeRavenWorkspaceMembersByUser } from '../utils/ravenWorkspaceMemberVisibility';
import { classifyRavenAttachment } from '../utils/ravenAttachment';
import {
  ravenChannelFileMatchesTypeFilter,
  type RavenChannelFileTypeFilter,
} from '../utils/ravenChannelFileTypeFilter';
import { tryParseQuotationDraftFromMessage } from '../utils/chatQuotationDraftMessage';

export type RavenUserProfileRecord = {
  full_name?: string;
  user_image?: string | null;
};

export type RavenUserProfileMap = Record<string, RavenUserProfileRecord>;

/** Merge profile maps (later maps do not wipe earlier `full_name` / `user_image`). */
export function mergeRavenUserProfileMaps(...maps: RavenUserProfileMap[]): RavenUserProfileMap {
  const out: RavenUserProfileMap = {};
  const put = (id: string, patch: RavenUserProfileRecord) => {
    const k = id.trim();
    if (!k) return;
    const prev = out[k] ?? out[k.toLowerCase()] ?? {};
    const fn =
      patch.full_name != null && String(patch.full_name).trim()
        ? String(patch.full_name).trim()
        : prev.full_name;
    const img =
      patch.user_image != null && String(patch.user_image).trim()
        ? String(patch.user_image).trim()
        : prev.user_image ?? null;
    const entry = { full_name: fn, user_image: img };
    out[k] = entry;
    const lo = k.toLowerCase();
    if (lo !== k) out[lo] = entry;
  };
  for (const map of maps) {
    for (const [id, p] of Object.entries(map)) put(id, p);
  }
  return out;
}

/**
 * Same source as Raven web `UserListProvider` — `raven.api.raven_users.get_list`.
 * Keys are **Raven User.name** (also used as `peer_user_id` on DM channels).
 */
export async function fetchRavenUsersDirectory(): Promise<RavenUserProfileMap> {
  const out: RavenUserProfileMap = {};
  try {
    const data = await ravenCallFrappeMethod('raven.api.raven_users.get_list');
    const rows = Array.isArray(data?.message) ? data.message : [];
    for (const r of rows as { name?: string; full_name?: string; user_image?: string | null }[]) {
      const name = r?.name != null ? String(r.name).trim() : '';
      if (!name) continue;
      const entry: RavenUserProfileRecord = {
        full_name: r.full_name != null ? String(r.full_name).trim() : undefined,
        user_image: r.user_image ?? null,
      };
      out[name] = entry;
      const nl = name.toLowerCase();
      if (nl !== name) out[nl] = entry;
    }
  } catch (e) {
    console.warn(LOG, 'fetchRavenUsersDirectory', e);
  }
  return out;
}

const LOG = '[ravenNativeApi]';

export type RavenWorkspaceRow = {
  name: string;
  workspace_name?: string;
  /** Raven Workspace `logo` (Attach Image) — `/files/…` or full URL. */
  logo?: string | null;
  /** Present when the signed-in user is a Raven Workspace Member for this workspace. */
  workspace_member_name?: string | null;
  /** Raven Workspace `type`: `Public` (discoverable) or `Private` (members only). */
  type?: string;
  /** From `get_list` when the viewer is a member — workspace admin flag. */
  is_admin?: number | boolean | string;
};

/** True when `get_list` included a membership row for the current session user. */
export function ravenWorkspaceRowHasMembership(w: RavenWorkspaceRow): boolean {
  return w.workspace_member_name != null && String(w.workspace_member_name).trim().length > 0;
}

/**
 * Match Raven `get_list` visibility: show **Public** workspaces to everyone, **Private** only when the
 * user is a member (`workspace_member_name` set). Use as defense-in-depth if the API ever returns extra rows.
 * When `type` is missing (older payloads), rows are kept unchanged.
 */
export function filterRavenWorkspacesByVisibility(rows: RavenWorkspaceRow[]): RavenWorkspaceRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((w) => {
    if (!w?.name) return false;
    const t = String(w.type ?? '').trim().toLowerCase();
    if (!t) return true;
    if (t === 'public') return true;
    return ravenWorkspaceRowHasMembership(w);
  });
}

export type RavenChannelRow = {
  name: string;
  channel_name?: string;
  workspace?: string;
  type?: string;
  is_archived?: number;
  /** Raven Channel — moves with new messages; best sort key without calling `get_messages_with_dates`. */
  last_message_timestamp?: string;
  /** Channel document `modified` — fallback sort when `last_message_timestamp` is empty. */
  modified?: string;
  /** From Raven `get_channels` — JSON (string or object) snapshot of the channel's newest message. */
  last_message_details?: unknown;
  /** From Raven `get_channels` — DM peer Frappe User.name (usually email). */
  peer_user_id?: string;
  /** From Raven `get_channels` — User.full_name of peer for DMs. */
  full_name?: string;
  /** Frappe `User.user_image` for the DM peer (filled by `enrichRavenChannelsWithPeerProfiles`). */
  peer_user_image?: string | null;
  is_direct_message?: number | boolean;
  is_self_message?: number | boolean;
};

export type RavenMessageRow = {
  name: string;
  channel_id?: string;
  text?: string;
  /** Raven v2 plain-text body derived from rich `text` on the server. */
  content?: string;
  owner?: string;
  creation?: string;
  /** Frappe `modified` — useful when `creation` is missing on some API payloads. */
  modified?: string;
  message_type?: string;
  file?: string;
  /** Smaller preview path — sometimes present when `file` is awkward for clients. */
  file_thumbnail?: string;
  /** Raven Message `thumbnail_width` / `thumbnail_height` (Data in Frappe) — used by web for inline image/video box size. */
  thumbnail_width?: number;
  thumbnail_height?: number;
  /** Raven Message `image_width` / `image_height` (parsed from API; optional future use). */
  image_width?: number;
  image_height?: number;
  is_reply?: number | boolean;
  linked_message?: string;
  /** Raven `before_insert` snapshot of parent; JSON string or object from API. */
  replied_message_details?: unknown;
  /** ERPNext / Frappe doc shared into chat (“Send a Raven” from Desk). */
  link_doctype?: string;
  link_document?: string;
  /** JSON map of emoji reactions (Raven `message_reactions`). */
  message_reactions?: string;
  /** Raven Check — forwarded copy of another message. */
  is_forwarded?: number | boolean;
  /** Raven Check — message body was edited after send. */
  is_edited?: number | boolean;
};

/** Unix ms for sorting (creation, then modified). Handles Frappe datetimes, numeric unix, and missing `T`. */
export function ravenMessageRowSortTimeMs(row: RavenMessageRow | undefined | null): number {
  if (!row) return 0;

  const parseOne = (raw: unknown): number => {
    if (raw == null) return NaN;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (raw > 1e12) return raw;
      if (raw > 1e9) return Math.round(raw * 1000);
      return NaN;
    }
    const s = String(raw).trim();
    if (!s) return NaN;
    if (/^\d{10,13}$/.test(s)) {
      const n = parseInt(s, 10);
      if (n > 1e12) return n;
      if (n > 1e9) return n * 1000;
    }
    let normalized = s;
    if (!normalized.includes('T')) {
      normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2})[ ](.+)$/, '$1T$2');
    }
    const t = Date.parse(normalized);
    return Number.isNaN(t) ? NaN : t;
  };

  for (const candidate of [row.creation, row.modified]) {
    const t = parseOne(candidate);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** Unix ms from channel activity fields (no message fetch; does not mark read). */
export function ravenChannelLastActivitySortTimeMs(ch: RavenChannelRow | undefined | null): number {
  if (!ch) return 0;
  const fromMsgTs = ravenMessageRowSortTimeMs({
    name: ch.name,
    creation: ch.last_message_timestamp,
  } as RavenMessageRow);
  if (fromMsgTs > 0) return fromMsgTs;
  return ravenMessageRowSortTimeMs({
    name: ch.name,
    creation: ch.modified,
  } as RavenMessageRow);
}

function sortMessagesNewestFirst(rows: RavenMessageRow[]): RavenMessageRow[] {
  rows.sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
  return rows;
}

/**
 * Custom **Link** to ERPNext **Supplier** on Raven Workspace Member.
 * Frappe stores this as **`custom_supplier`**; we also accept legacy `supplier` if present.
 */
export type RavenWorkspaceMemberRow = {
  name: string;
  user: string;
  /** Raven Check field; may arrive as 0/1, boolean, or string from the API. */
  is_admin?: number | boolean | string;
  creation?: string;
  /** Frappe custom field — Link to Supplier (e.g. `SUP-00001` / supplier name). */
  custom_supplier?: string | null;
  /** Non-custom field name, if your site used it instead of `custom_supplier`. */
  supplier?: string | null;
  /** Supplier `image` (batched in `fetchWorkspaceMembers` from ERPNext **Supplier**). */
  supplier_image?: string | null;
  /** Frappe `User.user_image` for this member (`user` → User.name); batched in `fetchWorkspaceMembers`. */
  user_profile_image?: string | null;
  /** **Raven User.full_name** (filled in `fetchWorkspaceMembers` profile merge). */
  full_name?: string | null;
};

/** Non-string / empty values are ignored (avoids treating Check `0` as a Supplier id). */
function maybeSupplierLinkValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'boolean' || typeof v === 'number') return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * ERPNext **Supplier** link on **Raven Workspace Member** is usually `custom_supplier`, but stock Raven
 * does not ship this field — sites add their own custom Link names. We read known keys, then any
 * `custom_*` field whose name suggests a Supplier link.
 */
function parseLinkedSupplierFromWorkspaceMemberResourceRow(r: Record<string, unknown>): string | null {
  for (const k of ['custom_supplier', 'supplier'] as const) {
    const hit = maybeSupplierLinkValue(r[k]);
    if (hit) return hit;
  }
  for (const key of Object.keys(r)) {
    const kl = key.toLowerCase();
    if (kl === 'supplier' || kl === 'custom_supplier') continue;
    if (!kl.startsWith('custom_') || !kl.includes('supplier')) continue;
    const hit = maybeSupplierLinkValue(r[key]);
    if (hit) return hit;
  }
  return null;
}

/** Resolved Supplier document id / name from a workspace member row (prefers `custom_supplier`). */
export function ravenWorkspaceMemberLinkedSupplierId(m: RavenWorkspaceMemberRow | null | undefined): string {
  if (!m) return '';
  return parseLinkedSupplierFromWorkspaceMemberResourceRow(m as unknown as Record<string, unknown>) ?? '';
}

const SUPPLIER_IMAGE_BATCH = 100;

async function mergeSupplierProfileImagesIntoMembers(
  members: RavenWorkspaceMemberRow[]
): Promise<RavenWorkspaceMemberRow[]> {
  if (members.length === 0) return members;
  const ids = [
    ...new Set(
      members
        .map((m) => ravenWorkspaceMemberLinkedSupplierId(m).trim())
        .filter((id): id is string => id.length > 0)
    ),
  ];
  if (ids.length === 0) return members;
  const imageBySupplier = new Map<string, string | null>();
  try {
    for (let i = 0; i < ids.length; i += SUPPLIER_IMAGE_BATCH) {
      const slice = ids.slice(i, i + SUPPLIER_IMAGE_BATCH);
      const rows = await ravenListResourceRows('Supplier', {
        filters: [['name', 'in', slice]],
        fields: ['name', 'image'],
        limit_page_length: Math.max(slice.length, 10),
      });
      for (const r of rows as Record<string, unknown>[]) {
        const n = String(r.name ?? '').trim();
        if (!n) continue;
        const img = r.image != null ? String(r.image).trim() : '';
        imageBySupplier.set(n, img || null);
      }
    }
  } catch (e) {
    console.warn(LOG, 'mergeSupplierProfileImagesIntoMembers', e);
    return members;
  }
  if (imageBySupplier.size === 0) return members;
  return members.map((m) => {
    const sid = ravenWorkspaceMemberLinkedSupplierId(m).trim();
    if (!sid || !imageBySupplier.has(sid)) return m;
    return { ...m, supplier_image: imageBySupplier.get(sid) ?? null };
  });
}

/** Same rule as the WebView bridge: avoid generic workspace named "Raven" when others exist. */
export function pickRavenWorkspaceId(rows: RavenWorkspaceRow[]): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const withMember = rows.filter(
    (w) => w?.workspace_member_name != null && String(w.workspace_member_name).length > 0
  );
  const pool = withMember.length > 0 ? withMember : rows;
  const nonGeneric = pool.filter((w) => w?.name && String(w.name).toLowerCase() !== 'raven');
  const chosen = nonGeneric.length > 0 ? nonGeneric[0] : pool[0];
  return chosen?.name ? String(chosen.name) : null;
}

function parseMethodMessage<T>(data: any): T {
  const msg = data?.message;
  if (typeof msg === 'string') {
    try {
      return JSON.parse(msg) as T;
    } catch {
      return [] as unknown as T;
    }
  }
  return msg as T;
}

/**
 * Raven's `get_messages_with_dates` returns `message`: `{ block_type: 'date'|'message', data }[]`.
 */
function parseRavenMessageDimension(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Parent Raven Message `name` for replies; tolerates camelCase and optional `replied_message_details` hints. */
export function ravenMessageReplyLinkedId(m: RavenMessageRow | Record<string, unknown>): string | undefined {
  return coerceLinkedMessageFromApiRecord(m as Record<string, unknown>);
}

/** Plain snippet from Raven `replied_message_details` when the parent row is not in the loaded list. */
export function ravenRepliedDetailsPlainText(details: unknown): string | undefined {
  if (details == null) return undefined;
  let o: Record<string, unknown> | null = null;
  if (typeof details === 'string' && details.trim()) {
    try {
      o = JSON.parse(details) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  } else if (typeof details === 'object' && !Array.isArray(details)) {
    o = details as Record<string, unknown>;
  }
  if (!o) return undefined;
  const t = o.content ?? o.text;
  if (t == null) return undefined;
  const s = String(t).trim();
  return s || undefined;
}

/** Raven / Frappe Check or API flag for “this message is a reply”. */
export function ravenIsReplyMessage(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

/** True when the row should render the inline reply quote UI (linked parent or Raven `replied_message_details`). */
export function ravenMessageShowsReplyQuoteRow(item: RavenMessageRow): boolean {
  if ((ravenMessageReplyLinkedId(item) ?? '').trim()) return true;
  if (ravenRepliedDetailsPlainText(item.replied_message_details)) return true;
  return ravenIsReplyMessage(item.is_reply);
}

/** True when the row links to ERPNext **Supplier Quotation** (spacing / underscore variants on `link_doctype`). */
export function ravenRowIsSupplierQuotationDocLink(linkDoctype: unknown, linkDocument: unknown): boolean {
  const dn = String(linkDocument ?? '').trim();
  if (!dn) return false;
  const norm = String(linkDoctype ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
  return norm === 'supplier quotation' || norm === 'supplierquotation';
}

/** True when the row links to ERPNext **Sales Order**. */
export function ravenRowIsSalesOrderDocLink(linkDoctype: unknown, linkDocument: unknown): boolean {
  const dn = String(linkDocument ?? '').trim();
  if (!dn) return false;
  const norm = String(linkDoctype ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
  return norm === 'sales order' || norm === 'salesorder';
}

/** True when the row links to ERPNext **Sales Invoice**. */
export function ravenRowIsSalesInvoiceDocLink(linkDoctype: unknown, linkDocument: unknown): boolean {
  const dn = String(linkDocument ?? '').trim();
  if (!dn) return false;
  const norm = String(linkDoctype ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
  return norm === 'sales invoice' || norm === 'salesinvoice';
}

/**
 * Whether a Raven message was authored by the signed-in user. Frappe `owner` is `User.name` (often the
 * login id / email), while the app session may store that in {@link UserSession.user} and/or {@link UserSession.email}
 * (e.g. supplier portal: `user` = Frappe name, `email` = typed login). Matching only `email` hid suppliers’ own
 * quotations on the “mine” side and broke bubble layout.
 */
export function ravenMessageOwnerMatchesSession(
  messageOwner: string | undefined,
  session: { email?: string | null; user?: string | null } | null | undefined
): boolean {
  if (!session) return false;
  const o = (messageOwner || '').trim().toLowerCase();
  if (!o) return false;
  for (const key of [session.user, session.email]) {
    const c = (key || '').trim().toLowerCase();
    if (c && c === o) return true;
  }
  return false;
}

function coerceLinkedMessageFromApiRecord(m: Record<string, unknown>): string | undefined {
  for (const c of [m.linked_message, m.linkedMessage, m.reply_to, m.reply_to_message, m.parent_message]) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  const rawDetails = m.replied_message_details;
  let details: Record<string, unknown> | null = null;
  if (typeof rawDetails === 'string' && rawDetails.trim()) {
    try {
      details = JSON.parse(rawDetails) as Record<string, unknown>;
    } catch {
      details = null;
    }
  } else if (rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)) {
    details = rawDetails as Record<string, unknown>;
  }
  if (details) {
    for (const k of ['message', 'message_id', 'name', 'linked_message', 'id']) {
      const v = details[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return undefined;
}

/** Raven may store the visible body in `content` (v2 / rich text) while `text` is empty. */
function pickMessageBodyText(m: Record<string, unknown>): string | undefined {
  const fromText = m.text != null ? String(m.text) : '';
  if (fromText.trim()) return fromText;
  const fromContent = m.content != null ? String(m.content) : '';
  if (fromContent.trim()) return fromContent;
  return undefined;
}

/** Parse Raven `message_details` when the API returns a JSON string (links sometimes only live there). */
function messageDetailsAsRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p != null && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Pull document link fields from top-level or Raven `message_details` (object or JSON string). */
function pickLinkFieldsFromApiRecord(m: Record<string, unknown>): { link_doctype?: string; link_document?: string } {
  let dt = m.link_doctype != null ? String(m.link_doctype).trim() : '';
  let dn = m.link_document != null ? String(m.link_document).trim() : '';
  const md = messageDetailsAsRecord(m.message_details);
  if (md && (!dt || !dn)) {
    if (!dt && md.link_doctype != null) dt = String(md.link_doctype).trim();
    if (!dn && md.link_document != null) dn = String(md.link_document).trim();
    if (!dn && md.link_name != null) dn = String(md.link_name).trim();
  }
  return {
    link_doctype: dt || undefined,
    link_document: dn || undefined,
  };
}

function mapApiRecordToRavenMessageRow(m: Record<string, unknown>): RavenMessageRow {
  const creation =
    m.creation instanceof Date
      ? m.creation.toISOString()
      : m.creation != null
        ? String(m.creation)
        : undefined;
  const linked = coerceLinkedMessageFromApiRecord(m);
  const { link_doctype: ldt, link_document: ldn } = pickLinkFieldsFromApiRecord(m);
  return {
    name: String(m.name ?? ''),
    channel_id: m.channel_id != null ? String(m.channel_id) : undefined,
    text: pickMessageBodyText(m),
    content: m.content != null ? String(m.content) : undefined,
    owner: m.owner != null ? String(m.owner) : undefined,
    creation,
    modified: m.modified != null ? String(m.modified) : undefined,
    message_type: m.message_type != null ? String(m.message_type) : undefined,
    file: m.file != null ? String(m.file) : undefined,
    file_thumbnail: m.file_thumbnail != null ? String(m.file_thumbnail) : undefined,
    thumbnail_width: parseRavenMessageDimension(m.thumbnail_width),
    thumbnail_height: parseRavenMessageDimension(m.thumbnail_height),
    image_width: parseRavenMessageDimension(m.image_width),
    image_height: parseRavenMessageDimension(m.image_height),
    is_reply: m.is_reply as RavenMessageRow['is_reply'],
    linked_message: linked,
    replied_message_details: m.replied_message_details,
    link_doctype: ldt,
    link_document: ldn,
    message_reactions:
      m.message_reactions != null ? String(m.message_reactions) : undefined,
    is_forwarded: m.is_forwarded as RavenMessageRow['is_forwarded'],
    is_edited: m.is_edited as RavenMessageRow['is_edited'],
  };
}

/** Some Raven/Frappe paths return message `data` as a JSON string instead of an object. */
function normalizeRavenMessageApiDict(raw: unknown): Record<string, unknown> {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p != null && typeof p === 'object' && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      /* noop */
    }
  }
  return {};
}

function flattenMessagesFromRavenBlocks(message: unknown, limit: number): RavenMessageRow[] {
  const blocks = Array.isArray(message) ? message : [];
  const rows: RavenMessageRow[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Record<string, unknown>;
    const bt = String(block.block_type ?? '').toLowerCase();
    if (bt !== 'message' || block.data == null) continue;
    const m = normalizeRavenMessageApiDict(block.data);
    const row = mapApiRecordToRavenMessageRow(m);
    if (!String(row.name ?? '').trim()) continue;
    rows.push(row);
  }
  rows.sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
  return rows.slice(0, limit);
}

/** Unwrap `data.message` from `get_messages_with_dates` or chat-stream-shaped `{ messages: [...] }`. */
function unwrapRavenMessageMethodPayload(data: any): unknown[] | null {
  const raw = data?.message;
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object' && Array.isArray((p as { messages?: unknown[] }).messages)) {
        return (p as { messages: unknown[] }).messages;
      }
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && Array.isArray((raw as { messages?: unknown[] }).messages)) {
    return (raw as { messages: unknown[] }).messages;
  }
  return null;
}

function isBlockFormattedRavenMessages(arr: unknown[]): boolean {
  const first = arr[0];
  if (!first || typeof first !== 'object') return false;
  return 'block_type' in (first as object);
}

function mapRawMessageListToRows(arr: unknown[], limit: number): RavenMessageRow[] {
  const rows: RavenMessageRow[] = [];
  for (const item of arr) {
    const m = normalizeRavenMessageApiDict(item);
    const row = mapApiRecordToRavenMessageRow(m);
    if (!String(row.name ?? '').trim()) continue;
    rows.push(row);
  }
  rows.sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
  return rows.slice(0, limit);
}

/**
 * Load messages around a specific message (Raven web: `?message_id=` + `chat_stream.get_messages`).
 * Used when jumping to an in-chat search hit that is not on the current first page.
 */
export async function fetchChannelMessagesAroundBaseMessage(
  channelId: string,
  baseMessageId: string
): Promise<{ messages: RavenMessageRow[]; hasMoreOlder: boolean; hasMoreNewer: boolean }> {
  const cid = channelId.trim();
  const base = baseMessageId.trim();
  if (!cid || !base) {
    throw new Error('Missing channel or message id.');
  }

  const data = await ravenCallFrappeMethod('raven.api.chat_stream.get_messages', {
    channel_id: cid,
    base_message: base,
  });

  let payload: Record<string, unknown> | null = null;
  const raw = data?.message;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    payload = raw as Record<string, unknown>;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }
  }

  const arr = payload?.messages;
  const rawList = Array.isArray(arr) ? arr : [];
  const rows = sortMessagesNewestFirst(mapMessagePlainText(mapRawMessageListToRows(rawList, rawList.length + 1)));

  const hasMoreOlder = payload?.has_old_messages === true || payload?.has_old_messages === 1;
  const hasMoreNewer = payload?.has_new_messages === true || payload?.has_new_messages === 1;

  return { messages: rows, hasMoreOlder, hasMoreNewer };
}

function mapMessagePlainText(rows: RavenMessageRow[]): RavenMessageRow[] {
  return rows.map((r) => ({
    ...r,
    text: r.text != null && r.text !== '' ? plainTextFromMaybeHtml(r.text) : r.text,
  }));
}

/**
 * Normalize a single message dict from a whitelisted method (`send_message` return, etc.).
 */
export function ravenMessageRowFromFrappeApiPayload(raw: unknown): RavenMessageRow | null {
  let inner: unknown = raw;
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    const msg = (inner as { message?: unknown }).message;
    if (msg != null && typeof msg === 'object' && !Array.isArray(msg)) {
      inner = msg;
    }
  }
  const m = normalizeRavenMessageApiDict(inner);
  const row = mapApiRecordToRavenMessageRow(m);
  if (!String(row.name ?? '').trim()) return null;
  return mapMessagePlainText([row])[0];
}

/**
 * When merging a refreshed `Raven Message` into UI state, keep `link_doctype` / `link_document` if the
 * new payload omitted them (field permissions, partial API rows). Prevents linked document bubbles from
 * turning blank after `loadMessages(..., { silent: true })` polling.
 */
export function ravenCoalesceDocumentLinkFields(fresh: RavenMessageRow, previous?: RavenMessageRow): RavenMessageRow {
  if (!previous) return fresh;
  const fdt = String(fresh.link_doctype || '').trim();
  const fdn = String(fresh.link_document || '').trim();
  if (fdt && fdn) return fresh;
  const pdt = String(previous.link_doctype || '').trim();
  const pdn = String(previous.link_document || '').trim();
  if (pdt && pdn) {
    return { ...fresh, link_doctype: pdt, link_document: pdn };
  }
  return fresh;
}

/** Apply {@link ravenCoalesceDocumentLinkFields} for every row in `rows` against `previous` by message `name`. */
export function ravenRefreshMessagesPreservingDocLinks(
  rows: RavenMessageRow[],
  previous: RavenMessageRow[]
): RavenMessageRow[] {
  const prevByName = new Map<string, RavenMessageRow>(
    previous.map((m) => [(m.name || '').trim(), m] as const).filter(([k]) => k.length > 0)
  );
  return rows.map((m) => {
    const k = (m.name || '').trim();
    if (!k) return m;
    return ravenCoalesceDocumentLinkFields(m, prevByName.get(k));
  });
}

/**
 * Merge fields from a freshly inserted `Raven Message` when `listMessagesForChannel` / `get_messages`
 * rows omit them (reply metadata, or `link_doctype` / `link_document` for Desk-style document shares).
 */
export function ravenMergeMessageRowFromSendResponse(rows: RavenMessageRow[], sentRaw: unknown): RavenMessageRow[] {
  const sent = ravenMessageRowFromFrappeApiPayload(sentRaw);
  if (!sent?.name) return rows;
  const hasReplyHint =
    !!(sent.linked_message && String(sent.linked_message).trim()) ||
    sent.replied_message_details != null ||
    ravenIsReplyMessage(sent.is_reply);
  const hasLinkHint =
    !!(sent.link_doctype && String(sent.link_doctype).trim()) &&
    !!(sent.link_document && String(sent.link_document).trim());
  if (!hasReplyHint && !hasLinkHint) return rows;
  let hit = false;
  const next = rows.map((r) => {
    if (r.name !== sent.name) return r;
    hit = true;
    const lm = (sent.linked_message ?? r.linked_message) as string | undefined;
    const linked = lm != null && String(lm).trim() ? String(lm).trim() : r.linked_message;
    return {
      ...r,
      ...(hasReplyHint
        ? {
            is_reply: sent.is_reply ?? r.is_reply,
            linked_message: linked,
            replied_message_details: sent.replied_message_details ?? r.replied_message_details,
          }
        : {}),
      ...(hasLinkHint
        ? {
            link_doctype: sent.link_doctype ?? r.link_doctype,
            link_document: sent.link_document ?? r.link_document,
          }
        : {}),
    };
  });
  if (hit) return mapMessagePlainText(next);
  return mapMessagePlainText([sent, ...rows]);
}

function workspaceMatches(
  channelWorkspace: unknown,
  expectedDocId: string,
  aliasKeys?: Iterable<string>
): boolean {
  if (!expectedDocId?.trim()) return true;
  const cw = channelWorkspace == null ? '' : String(channelWorkspace).trim().toLowerCase();
  if (!cw) return false;
  const exp = expectedDocId.trim().toLowerCase();
  if (cw === exp) return true;
  if (aliasKeys) {
    for (const a of aliasKeys) {
      const key = String(a).trim().toLowerCase();
      if (key && cw === key) return true;
    }
  }
  return false;
}

/** Match Raven Workspace by document `name` or display `workspace_name`. */
export function matchRavenWorkspaceRow(
  hint: string,
  rows: RavenWorkspaceRow[]
): RavenWorkspaceRow | null {
  const h = hint.trim().toLowerCase();
  if (!h || !rows.length) return null;
  return (
    rows.find((w) => String(w.name || '').trim().toLowerCase() === h) ??
    rows.find((w) => String(w.workspace_name || '').trim().toLowerCase() === h) ??
    null
  );
}

/** Resolve env / UI label to Raven Workspace document `name` when possible. */
export function resolveRavenWorkspaceDocId(hint: string, rows?: RavenWorkspaceRow[]): string {
  const t = hint.trim();
  if (!t) return '';
  if (rows?.length) {
    const m = matchRavenWorkspaceRow(t, rows);
    if (m?.name) return String(m.name).trim();
  }
  return t;
}

function workspaceAliasKeys(hint: string, rows: RavenWorkspaceRow[]): Set<string> {
  const keys = new Set<string>();
  const t = hint.trim().toLowerCase();
  if (t) keys.add(t);
  const row = matchRavenWorkspaceRow(hint, rows);
  if (row) {
    const n = String(row.name || '').trim().toLowerCase();
    const wn = String(row.workspace_name || '').trim().toLowerCase();
    if (n) keys.add(n);
    if (wn) keys.add(wn);
  }
  return keys;
}

const workspaceChannelMismatchWarned = new Set<string>();

function filterChannelsForWorkspace(
  list: RavenChannelRow[],
  docId: string,
  aliasKeys: Set<string>
): RavenChannelRow[] {
  const inWs = list.filter((c) => workspaceMatches(c.workspace, docId, aliasKeys));
  if (inWs.length > 0) return inWs;
  const orphanDms = list.filter(
    (c) => isDMChannelRow(c) && (c.workspace == null || String(c.workspace).trim() === '')
  );
  if (orphanDms.length > 0) return orphanDms;
  const channelWorkspaceIds = [
    ...new Set(list.map((c) => String(c.workspace || '').trim()).filter(Boolean)),
  ];
  if (channelWorkspaceIds.length === 1) {
    const onlyWs = channelWorkspaceIds[0];
    const matched = list.filter((c) => workspaceMatches(c.workspace, onlyWs, aliasKeys));
    if (matched.length > 0) return matched;
  }
  return list;
}

/** Raven channel list methods return either `message: [...]` or `message: { channels, dm_channels }`. */
function channelsFromMethodResponse(data: any): RavenChannelRow[] {
  const msg = data?.message;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const ch = (msg as { channels?: RavenChannelRow[]; dm_channels?: RavenChannelRow[] }).channels;
    const dms = (msg as { dm_channels?: RavenChannelRow[] }).dm_channels;
    const merged = [...(Array.isArray(ch) ? ch : []), ...(Array.isArray(dms) ? dms : [])];
    if (merged.length) return merged;
  }
  const parsed = parseMethodMessage<RavenChannelRow[]>(data);
  return Array.isArray(parsed) ? parsed : [];
}

function isTruthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function isDMChannelRow(c: RavenChannelRow): boolean {
  if (isTruthy(c.is_direct_message)) return true;
  const t = (c.type || '').toLowerCase();
  if (t.includes('direct') || t.includes('dm')) return true;
  const cn = c.channel_name || '';
  if (cn.includes(' _ ') && cn.includes('@')) return true;
  return false;
}

function userIdToShortLabel(userId: string): string {
  const u = userId.trim();
  if (!u) return 'User';
  if (u.includes('@')) return u.split('@')[0] || u;
  return u;
}

/** If DM `channel_name` is `a@x _ b@y`, return the other id when `me` matches one side. */
function peerFromDmChannelName(channelName: string | undefined, meLower: string): string | null {
  if (!channelName || !channelName.includes(' _ ')) return null;
  const parts = channelName
    .split(' _ ')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const a = parts[0].toLowerCase();
  const b = parts[1].toLowerCase();
  if (meLower && (a === meLower || b === meLower)) {
    return a === meLower ? parts[1] : parts[0];
  }
  return parts[1];
}

/**
 * DM / group channel title — mirrors Raven web:
 * - DMs: **Raven User.full_name** (user directory), then enriched channel field, then id fallback
 * - Groups: `channel_name`
 */
export function getRavenChannelDisplayLabel(
  c: RavenChannelRow,
  currentUserEmail?: string | null,
  profiles?: RavenUserDisplayProfiles
): string {
  const me = (currentUserEmail || '').trim().toLowerCase();

  if (isTruthy(c.is_self_message)) {
    return 'You';
  }

  if (isDMChannelRow(c)) {
    const peer =
      getRavenDmPeerUserId(c, currentUserEmail) ||
      (c.peer_user_id != null ? String(c.peer_user_id).trim() : '') ||
      peerFromDmChannelName(c.channel_name, me) ||
      '';

    if (peer && peer.toLowerCase() !== me) {
      const fromProfile = ravenUserProfileFullName(peer, profiles);
      if (fromProfile) return fromProfile;

      const fn = c.full_name != null ? String(c.full_name).trim() : '';
      if (fn) return fn;

      return friendlySenderLabel(peer);
    }

    const fn = c.full_name != null ? String(c.full_name).trim() : '';
    if (fn) return fn;
    return userIdToShortLabel(c.channel_name || c.name || 'DM');
  }

  return (c.channel_name || c.name || '').trim() || 'Channel';
}

/** Raven/Frappe user id (email) of the other person in a DM, or `null` for non-DMs / self-DM edge cases. */
export function getRavenDmPeerUserId(
  c: RavenChannelRow | null | undefined,
  currentUserEmail?: string | null
): string | null {
  if (!c) return null;
  const meLower = (currentUserEmail || '').trim().toLowerCase();
  if (!isDMChannelRow(c)) return null;
  const peer = c.peer_user_id != null ? String(c.peer_user_id).trim() : '';
  if (peer && peer.toLowerCase() !== meLower) return peer;
  const cn = c.channel_name;
  if (cn && cn.includes(' _ ')) {
    const parts = cn
      .split(' _ ')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0].toLowerCase();
      const b = parts[1].toLowerCase();
      if (meLower && (a === meLower || b === meLower)) return a === meLower ? parts[1] : parts[0];
      return parts[1];
    }
  }
  return null;
}

export async function fetchRavenUserProfilesByIds(
  userIds: string[]
): Promise<Map<string, { full_name?: string; user_image?: string | null }>> {
  const map = new Map<string, { full_name?: string; user_image?: string | null }>();
  const unique = [...new Set(userIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!unique.length) return map;

  const putEntry = (
    userKey: string,
    patch: { full_name?: string; user_image?: string | null }
  ) => {
    const k = userKey.trim();
    if (!k) return;
    const prev = map.get(k) ?? map.get(k.toLowerCase()) ?? {};
    const fullName =
      patch.full_name != null && String(patch.full_name).trim()
        ? String(patch.full_name).trim()
        : prev.full_name;
    const userImage =
      patch.user_image != null && String(patch.user_image).trim()
        ? String(patch.user_image).trim()
        : prev.user_image ?? null;
    const entry = { full_name: fullName, user_image: userImage };
    map.set(k, entry);
    const kl = k.toLowerCase();
    if (kl !== k) map.set(kl, entry);
  };

  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const [byUser, byName] = await Promise.all([
        ravenListResourceRows('Raven User', {
          filters: [['user', 'in', chunk]],
          fields: ['name', 'user', 'full_name', 'user_image'],
          limit_page_length: chunk.length,
        }),
        ravenListResourceRows('Raven User', {
          filters: [['name', 'in', chunk]],
          fields: ['name', 'user', 'full_name', 'user_image'],
          limit_page_length: chunk.length,
        }),
      ]);
      for (const r of [...byUser, ...byName] as {
        name?: string;
        user?: string;
        full_name?: string;
        user_image?: string | null;
      }[]) {
        const docName = r?.name != null ? String(r.name).trim() : '';
        const linkedUser = r?.user != null ? String(r.user).trim() : '';
        const patch = { full_name: r.full_name, user_image: r.user_image };
        if (docName) putEntry(docName, patch);
        if (linkedUser) putEntry(linkedUser, patch);
      }
    } catch (e) {
      console.warn(LOG, 'fetchRavenUserProfilesByIds Raven User', e);
    }
  }

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const rows = await ravenListResourceRows('User', {
        filters: [['name', 'in', chunk]],
        fields: ['name', 'full_name', 'user_image'],
        limit_page_length: chunk.length,
      });
      for (const r of rows as { name?: string; full_name?: string; user_image?: string | null }[]) {
        const n = r?.name != null ? String(r.name).trim() : '';
        if (!n) continue;
        const prev = map.get(n) ?? map.get(n.toLowerCase());
        putEntry(n, {
          full_name: prev?.full_name?.trim() ? prev.full_name : r.full_name,
          user_image: prev?.user_image?.trim() ? prev.user_image : r.user_image,
        });
      }
    } catch (e) {
      console.warn(LOG, 'fetchRavenUserProfilesByIds User', e);
    }
  }
  return map;
}

/**
 * Attach `peer_user_image` (and `full_name` when missing) for DM channels by loading **Raven User** / `User` rows.
 */
export async function enrichRavenChannelsWithPeerProfiles(
  channels: RavenChannelRow[],
  currentUserEmail?: string | null
): Promise<RavenChannelRow[]> {
  const peerIds: string[] = [];
  for (const c of channels) {
    const pid = getRavenDmPeerUserId(c, currentUserEmail);
    if (pid) peerIds.push(pid);
  }
  if (!peerIds.length) return channels;
  const profiles = await fetchRavenUserProfilesByIds(peerIds);
  return channels.map((c) => {
    const pid = getRavenDmPeerUserId(c, currentUserEmail);
    if (!pid) return c;
    const p = profiles.get(pid) ?? profiles.get(pid.toLowerCase());
    if (!p) return c;
    const existingName = c.full_name != null ? String(c.full_name).trim() : '';
    const fetchedName = p.full_name != null ? String(p.full_name).trim() : '';
    const img = p.user_image != null ? String(p.user_image).trim() : '';
    return {
      ...c,
      full_name: fetchedName || existingName || c.full_name,
      peer_user_image: img || c.peer_user_image,
    };
  });
}

/** Frappe **`User.user_image`** for workspace member rows (`user` → `User.name`, usually email). */
async function mergeFrappeUserProfileImagesIntoMembers(
  members: RavenWorkspaceMemberRow[]
): Promise<RavenWorkspaceMemberRow[]> {
  if (members.length === 0) return members;
  const ids = [...new Set(members.map((m) => (m.user || '').trim()).filter(Boolean))];
  if (ids.length === 0) return members;
  const map = await fetchRavenUserProfilesByIds(ids);
  if (map.size === 0) return members;
  return members.map((m) => {
    const u = (m.user || '').trim();
    if (!u) return m;
    const p = map.get(u) ?? map.get(u.toLowerCase());
    if (!p) return m;
    const img = p.user_image != null ? String(p.user_image).trim() : '';
    const fn = p.full_name != null ? String(p.full_name).trim() : '';
    if (!img && !fn) return m;
    return {
      ...m,
      user_profile_image: img || m.user_profile_image,
      full_name: fn || m.full_name,
    };
  });
}

async function finalizeWorkspaceMembersWithImages(
  members: RavenWorkspaceMemberRow[]
): Promise<RavenWorkspaceMemberRow[]> {
  const deduped = dedupeRavenWorkspaceMembersByUser(members);
  return mergeFrappeUserProfileImagesIntoMembers(await mergeSupplierProfileImagesIntoMembers(deduped));
}

async function finalizeChannelListWithProfiles(
  rows: RavenChannelRow[],
  currentUserEmail?: string | null
): Promise<RavenChannelRow[]> {
  if (!rows.length) return rows;
  if (!currentUserEmail?.trim()) return rows;
  try {
    return await enrichRavenChannelsWithPeerProfiles(rows, currentUserEmail);
  } catch (e) {
    console.warn(LOG, 'finalizeChannelListWithProfiles', e);
    return rows;
  }
}

export async function listChannelsForWorkspace(
  workspace: string,
  currentUserEmail?: string | null
): Promise<RavenChannelRow[]> {
  const wsHint = workspace.trim();
  if (!wsHint) return [];

  const wsRows = await fetchRavenWorkspaces();
  const docId = resolveRavenWorkspaceDocId(wsHint, wsRows);
  const aliasKeys = workspaceAliasKeys(wsHint, wsRows);

  // Prefer Raven's whitelisted API — uses the same membership/workspace rules as the web app.
  // Plain GET /api/resource/Raven Channel often returns [] for the integration user (permissions / link fields).
  try {
    let data = await ravenCallFrappeMethod('raven.api.raven_channel.get_channels', {
      hide_archived: true,
    });
    let list = channelsFromMethodResponse(data);
    if (list.length === 0) {
      data = await ravenCallFrappeMethod('raven.api.raven_channel.get_all_channels', {
        hide_archived: 'true',
      });
      list = channelsFromMethodResponse(data);
    }
    const filtered = filterChannelsForWorkspace(list, docId, aliasKeys);
    if (filtered.length > 0) {
      const usedFallback =
        filtered.length === list.length &&
        list.length > 0 &&
        !list.some((c) => workspaceMatches(c.workspace, docId, aliasKeys));
      if (usedFallback && !workspaceChannelMismatchWarned.has(docId)) {
        workspaceChannelMismatchWarned.add(docId);
        console.warn(
          LOG,
          'get_channels returned',
          list.length,
          'channels but none matched workspace',
          JSON.stringify(docId),
          wsHint !== docId ? `(from ${JSON.stringify(wsHint)})` : '',
          '- showing all session channels'
        );
      }
      return finalizeChannelListWithProfiles(filtered, currentUserEmail);
    }
  } catch (e) {
    console.warn(LOG, 'get_channels / get_all_channels failed, trying resource API', e);
  }

  const filters: any[][] = [['workspace', '=', docId]];
  try {
    const rows = await ravenListResourceRows('Raven Channel', {
      filters,
      fields: [
        'name',
        'channel_name',
        'workspace',
        'type',
        'is_archived',
        'is_direct_message',
        'is_self_message',
        'last_message_timestamp',
        'modified',
      ],
      order_by: 'last_message_timestamp desc',
      limit_page_length: 100,
    });
    return finalizeChannelListWithProfiles(rows, currentUserEmail);
  } catch (e) {
    console.warn(LOG, 'listResourceRows Raven Channel', e);
    return [];
  }
}

/** For Raven Channel Member fallback: prefer caller hint, else Frappe `User.name` from the active session. */
async function resolveRavenSessionUserNameHint(hint?: string | null): Promise<string> {
  const h = (hint || '').trim();
  if (h) return h;
  try {
    const data = await ravenCallFrappeMethod('frappe.auth.get_logged_user', {});
    const u = (data as { message?: unknown })?.message ?? data;
    if (typeof u === 'string' && u.trim()) return u.trim();
  } catch {
    /* noop */
  }
  return '';
}

/**
 * Every **Raven Channel** the logged-in session user is a member of (all workspaces).
 * Uses Raven’s `get_channels` / `get_all_channels` (same membership rules as the web app).
 * Falls back to `Raven Channel Member` → `Raven Channel` when those methods are unavailable.
 */
export async function listRavenChannelsForSessionUser(
  currentUserEmail?: string | null,
  opts?: { enrichProfiles?: boolean }
): Promise<RavenChannelRow[]> {
  const enrichProfiles = opts?.enrichProfiles !== false;
  try {
    let data = await ravenCallFrappeMethod('raven.api.raven_channel.get_channels', {
      hide_archived: true,
    });
    let list = channelsFromMethodResponse(data);
    if (list.length === 0) {
      data = await ravenCallFrappeMethod('raven.api.raven_channel.get_all_channels', {
        hide_archived: 'true',
      });
      list = channelsFromMethodResponse(data);
    }
    if (list.length > 0) {
      if (!enrichProfiles) return list;
      return finalizeChannelListWithProfiles(list, currentUserEmail);
    }
  } catch (e) {
    console.warn(LOG, 'listRavenChannelsForSessionUser get_channels failed', e);
  }

  const me = await resolveRavenSessionUserNameHint(currentUserEmail);
  if (!me) {
    console.warn(LOG, 'listRavenChannelsForSessionUser: no user id for Raven Channel Member fallback');
    return [];
  }

  try {
    const memberRows = await ravenListResourceRows('Raven Channel Member', {
      filters: [['user', '=', me]],
      fields: ['channel', 'parent'],
      limit_page_length: 500,
    });
    const channelIds = [
      ...new Set(
        (memberRows as { channel?: string; parent?: string }[])
          .map((r) => String(r.channel || r.parent || '').trim())
          .filter(Boolean)
      ),
    ];
    if (!channelIds.length) return [];

    const out: RavenChannelRow[] = [];
    const chunkSize = 40;
    for (let i = 0; i < channelIds.length; i += chunkSize) {
      const chunk = channelIds.slice(i, i + chunkSize);
      const rows = await ravenListResourceRows('Raven Channel', {
        filters: [['name', 'in', chunk]],
        fields: [
          'name',
          'channel_name',
          'workspace',
          'type',
          'is_archived',
          'is_direct_message',
          'is_self_message',
          'last_message_timestamp',
          'modified',
        ],
        order_by: 'last_message_timestamp desc',
        limit_page_length: chunk.length,
      });
      out.push(...(rows as RavenChannelRow[]));
    }
    return enrichProfiles ? finalizeChannelListWithProfiles(out, currentUserEmail) : out;
  } catch (e2) {
    console.warn(LOG, 'listRavenChannelsForSessionUser Raven Channel Member fallback', e2);
    return [];
  }
}

export async function fetchRavenWorkspaces(): Promise<RavenWorkspaceRow[]> {
  try {
    const data = await ravenCallFrappeMethod('raven.api.workspaces.get_list', {});
    const list = parseMethodMessage<RavenWorkspaceRow[]>(data);
    const raw = Array.isArray(list) ? list : [];
    return filterRavenWorkspacesByVisibility(raw);
  } catch (e) {
    console.warn(LOG, 'fetchRavenWorkspaces failed', e);
    return [];
  }
}

/**
 * After password login (Frappe session + Raven cookie session), join **every Public** Raven workspace as
 * **`frappe.session.user`**. Uses `raven.api.workspaces.join_workspace` — this is allowed for Public
 * workspaces without being a workspace admin (unlike `add_workspace_members` from an integration user).
 */
export async function joinAllPublicRavenWorkspacesAsSessionUser(): Promise<void> {
  if (!hasFrappeRavenSession()) {
    console.warn(
      LOG,
      'joinAllPublicRavenWorkspacesAsSessionUser: no cookie session after login; skip (API-key calls would join the wrong user)'
    );
    return;
  }
  let rows: RavenWorkspaceRow[] = [];
  try {
    rows = await fetchRavenWorkspaces();
  } catch (e) {
    console.warn(LOG, 'joinAllPublicRavenWorkspacesAsSessionUser: list failed', e);
    return;
  }
  const publicWs = rows.filter(
    (w) => String(w.type ?? '').trim().toLowerCase() === 'public' && String(w.name ?? '').trim().length > 0
  );
  const seen = new Set<string>();
  for (const w of publicWs) {
    const id = String(w.name).trim();
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      await ravenCallFrappeMethod('raven.api.workspaces.join_workspace', { workspace: id });
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { message?: string; exc?: string } } };
      const msg = `${err?.message ?? ''} ${err?.response?.data?.message ?? ''} ${err?.response?.data?.exc ?? ''}`.toLowerCase();
      if (
        msg.includes('duplicate') ||
        msg.includes('already') ||
        msg.includes('exists') ||
        msg.includes('unique') ||
        msg.includes('same user')
      ) {
        continue;
      }
      console.warn(LOG, `join_workspace(${id})`, e);
    }
  }
}

export function getConfiguredRavenWorkspace(): string | undefined {
  const w = process.env.EXPO_PUBLIC_RAVEN_WORKSPACE?.trim();
  return w || undefined;
}

export async function resolveRavenWorkspaceId(explicit?: string): Promise<string | null> {
  const hint = (explicit?.trim() || getConfiguredRavenWorkspace() || '').trim();
  const rows = await fetchRavenWorkspaces();
  if (hint) {
    return resolveRavenWorkspaceDocId(hint, rows) || hint;
  }
  return pickRavenWorkspaceId(rows);
}

export type RavenChannelType = 'Public' | 'Private' | 'Open';

export async function listMessagesForChannel(
  channelId: string,
  limit = 80,
  opts?: {
    /**
     * When true, do not call `get_messages_with_dates` — Raven runs `track_channel_visit` there,
     * which updates `last_visit` and marks the channel read. Use for inbox lists / previews only.
     */
    skipChannelVisit?: boolean;
    /**
     * Frappe `limit_start` for paged loads (skip N newest rows). When greater than zero, only the
     * resource API is used — `get_messages_with_dates` does not support this offset.
     */
    limitStart?: number;
  }
): Promise<RavenMessageRow[]> {
  const limitStart = Math.max(0, Math.floor(opts?.limitStart ?? 0));

  if (limitStart === 0 && !opts?.skipChannelVisit) {
    try {
      const data = await ravenCallFrappeMethod('raven.api.raven_message.get_messages_with_dates', {
        channel_id: channelId,
      });
      const arr = unwrapRavenMessageMethodPayload(data);
      if (arr?.length) {
        if (isBlockFormattedRavenMessages(arr)) {
          return sortMessagesNewestFirst(mapMessagePlainText(flattenMessagesFromRavenBlocks(arr, limit)));
        }
        return sortMessagesNewestFirst(mapMessagePlainText(mapRawMessageListToRows(arr, limit)));
      }
    } catch (e) {
      console.warn(LOG, 'get_messages_with_dates failed, falling back to resource API', e);
    }
  }

  const fields = [
    'name',
    'channel_id',
    'text',
    'content',
    'owner',
    'creation',
    'modified',
    'message_type',
    'file',
    'file_thumbnail',
    'is_reply',
    'linked_message',
    'replied_message_details',
    'link_doctype',
    'link_document',
    'message_reactions',
    'is_forwarded',
    'is_edited',
  ];
  const tryFilters: any[][][] = [
    [['channel_id', '=', channelId]],
    [['channel', '=', channelId]],
  ];
  const listParams: {
    filters: any[][];
    fields: string[];
    order_by: string;
    limit_page_length: number;
    limit_start?: number;
  } = {
    filters: [['channel_id', '=', channelId]],
    fields,
    order_by: 'creation desc',
    limit_page_length: limit,
  };
  if (limitStart > 0) {
    listParams.limit_start = limitStart;
  }
  for (const filters of tryFilters) {
    try {
      listParams.filters = filters;
      const rows = await ravenListResourceRows('Raven Message', listParams);
      const mapped = (Array.isArray(rows) ? rows : []).map((r) =>
        mapApiRecordToRavenMessageRow(r as Record<string, unknown>)
      );
      return sortMessagesNewestFirst(mapMessagePlainText(mapped));
    } catch {
      /* try next field name */
    }
  }
  return [];
}

/** One item in channel shared lists — file attachment or linked ERP document. */
export type RavenSharedChatItemKind = 'photo' | 'video' | 'file' | 'quotation' | 'order' | 'invoice';

/** @deprecated Use {@link RavenChannelFileTypeFilter} or {@link RavenSharedDocumentFilter}. */
export type RavenSharedChatFilter = 'all' | RavenSharedChatItemKind;

export type RavenSharedDocumentFilter = 'any' | 'quotation' | 'order' | 'invoice';

/** Row from Raven `get_all_files_shared_in_channel` (aligned with Raven web `FileInChannel`). */
export type RavenChannelFileRow = {
  messageName: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  message_type?: 'File' | 'Image' | string;
  owner?: string;
  creation?: string;
  fileThumbnail?: string;
};

export type RavenSharedChatItem = {
  messageName: string;
  kind: RavenSharedChatItemKind;
  /** Primary line shown in the shared list. */
  label: string;
  owner?: string;
  creation?: string;
  /** Present for file attachments. */
  file?: string;
  message_type?: string;
  linkDoctype?: string;
  linkDocument?: string;
};

/** @deprecated Prefer {@link RavenSharedChatItem}. File attachments only. */
export type RavenSharedChatAttachment = {
  messageName: string;
  /** Sanitized `/files/…` or URL — same as Raven web uses for downloads. */
  file: string;
  owner?: string;
  creation?: string;
  message_type?: string;
};

const RAVEN_SHARED_ATTACH_PAGE = 100;
/** Cap scan (~8k messages) so opening the menu stays responsive on huge channels. */
const RAVEN_SHARED_ATTACH_MAX_PAGES = 80;
/** Max messages parsed when scanning a channel for shared files / ERP links. */
const RAVEN_SHARED_SCAN_MESSAGE_LIMIT = 20000;
const RAVEN_CHANNEL_FILES_API_PAGE = 100;
const RAVEN_CHANNEL_FILES_API_MAX_PAGES = 50;

function dedupeRavenChannelFileRows(rows: RavenChannelFileRow[]): RavenChannelFileRow[] {
  const seen = new Set<string>();
  const out: RavenChannelFileRow[] = [];
  for (const row of rows) {
    const key = `${row.messageName}::${row.fileUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Load all channel messages for shared-content scans.
 * Uses Raven's whitelisted `get_messages_with_dates` so every member's messages are included.
 * The Frappe resource list (used when `skipChannelVisit` is set) often returns only the current user's rows.
 */
async function fetchAllChannelMessagesForSharedScan(channelId: string): Promise<RavenMessageRow[]> {
  const cid = channelId.trim();
  if (!cid) return [];

  try {
    const data = await ravenCallFrappeMethod('raven.api.raven_message.get_messages_with_dates', {
      channel_id: cid,
    });
    const arr = unwrapRavenMessageMethodPayload(data);
    if (arr?.length) {
      if (isBlockFormattedRavenMessages(arr)) {
        return sortMessagesNewestFirst(
          mapMessagePlainText(flattenMessagesFromRavenBlocks(arr, RAVEN_SHARED_SCAN_MESSAGE_LIMIT))
        );
      }
      return sortMessagesNewestFirst(
        mapMessagePlainText(mapRawMessageListToRows(arr, RAVEN_SHARED_SCAN_MESSAGE_LIMIT))
      );
    }
  } catch (e) {
    console.warn(LOG, 'fetchAllChannelMessagesForSharedScan get_messages_with_dates failed', e);
  }

  const merged: RavenMessageRow[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < RAVEN_SHARED_ATTACH_MAX_PAGES; page++) {
    const start = page * RAVEN_SHARED_ATTACH_PAGE;
    const rows = await listMessagesForChannel(cid, RAVEN_SHARED_ATTACH_PAGE, {
      limitStart: start,
      skipChannelVisit: true,
    });
    if (!rows.length) break;
    for (const row of rows) {
      const id = String(row.name || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
    }
    if (rows.length < RAVEN_SHARED_ATTACH_PAGE) break;
  }
  return sortMessagesNewestFirst(mapMessagePlainText(merged));
}

function collectSharedItemsFromMessages(rows: RavenMessageRow[]): RavenSharedChatItem[] {
  const seenFiles = new Set<string>();
  const seenQuotations = new Set<string>();
  const seenOrders = new Set<string>();
  const seenInvoices = new Set<string>();
  const out: RavenSharedChatItem[] = [];

  for (const m of rows) {
    const rawFile = m.file?.trim();
    if (rawFile) {
      const key = sanitizeRavenWebMessageFileUrl(rawFile);
      if (key && !seenFiles.has(key)) {
        seenFiles.add(key);
        const { kind, displayName } = classifyRavenAttachment(key, m.message_type);
        out.push({
          messageName: m.name,
          kind: ravenAttachmentKindToSharedKind(kind),
          label: displayName || 'Attachment',
          owner: m.owner,
          creation: m.creation,
          file: key,
          message_type: m.message_type,
        });
      }
    }

    const linkDt = String(m.link_doctype || '').trim();
    const linkDn = String(m.link_document || '').trim();
    if (linkDn) {
      if (ravenRowIsSupplierQuotationDocLink(linkDt, linkDn)) {
        if (!seenQuotations.has(linkDn)) {
          seenQuotations.add(linkDn);
          out.push({
            messageName: m.name,
            kind: 'quotation',
            label: linkDn,
            owner: m.owner,
            creation: m.creation,
            linkDoctype: linkDt,
            linkDocument: linkDn,
          });
        }
      } else if (ravenRowIsSalesOrderDocLink(linkDt, linkDn)) {
        if (!seenOrders.has(linkDn)) {
          seenOrders.add(linkDn);
          out.push({
            messageName: m.name,
            kind: 'order',
            label: linkDn,
            owner: m.owner,
            creation: m.creation,
            linkDoctype: linkDt,
            linkDocument: linkDn,
          });
        }
      } else if (ravenRowIsSalesInvoiceDocLink(linkDt, linkDn)) {
        if (!seenInvoices.has(linkDn)) {
          seenInvoices.add(linkDn);
          out.push({
            messageName: m.name,
            kind: 'invoice',
            label: linkDn,
            owner: m.owner,
            creation: m.creation,
            linkDoctype: linkDt,
            linkDocument: linkDn,
          });
        }
      }
    }

    const qDraft = tryParseQuotationDraftFromMessage(m.text);
    if (qDraft?.name && !seenQuotations.has(qDraft.name)) {
      seenQuotations.add(qDraft.name);
      out.push({
        messageName: m.name,
        kind: 'quotation',
        label: qDraft.title?.trim() || qDraft.name,
        owner: m.owner,
        creation: m.creation,
        linkDocument: qDraft.name,
      });
    }
  }

  out.sort(
    (a, b) =>
      ravenMessageRowSortTimeMs({ name: b.messageName, creation: b.creation }) -
      ravenMessageRowSortTimeMs({ name: a.messageName, creation: a.creation })
  );
  return out;
}

function ravenAttachmentKindToSharedKind(
  attachmentKind: ReturnType<typeof classifyRavenAttachment>['kind']
): RavenSharedChatItemKind {
  if (attachmentKind === 'image') return 'photo';
  if (attachmentKind === 'video') return 'video';
  return 'file';
}

/**
 * All shared content in a channel: photos, videos, files, and linked quotations / orders / invoices.
 * Newest-first scan with dedupe per file path or document name.
 */
export async function listSharedItemsInChannel(channelId: string): Promise<RavenSharedChatItem[]> {
  const cid = channelId.trim();
  if (!cid) return [];
  const rows = await fetchAllChannelMessagesForSharedScan(cid);
  return collectSharedItemsFromMessages(rows);
}

function mapRavenApiFileInChannelRow(raw: Record<string, unknown>): RavenChannelFileRow | null {
  const messageName = String(raw.message_id ?? raw.name ?? '').trim();
  const fileUrl = sanitizeRavenWebMessageFileUrl(String(raw.file_url ?? ''));
  const fileName = String(raw.file_name ?? '').trim() || fileUrl.split('/').pop() || 'File';
  if (!messageName || !fileUrl) return null;
  return {
    messageName,
    fileName,
    fileUrl,
    fileType: raw.file_type != null ? String(raw.file_type) : undefined,
    fileSize: typeof raw.file_size === 'number' ? raw.file_size : undefined,
    message_type: raw.message_type != null ? String(raw.message_type) : undefined,
    owner: raw.owner != null ? String(raw.owner) : undefined,
    creation: raw.creation != null ? String(raw.creation) : undefined,
    fileThumbnail: raw.file_thumbnail != null ? String(raw.file_thumbnail) : undefined,
  };
}

function sharedChatItemToChannelFileRow(row: RavenSharedChatItem): RavenChannelFileRow | null {
  const fileUrl = row.file?.trim();
  if (!fileUrl) return null;
  const { ext } = classifyRavenAttachment(fileUrl, row.message_type);
  return {
    messageName: row.messageName,
    fileName: row.label || fileUrl.split('/').pop() || 'File',
    fileUrl,
    fileType: ext || undefined,
    message_type: row.message_type,
    owner: row.owner,
    creation: row.creation,
  };
}

/**
 * Files shared in a channel — same API as Raven web “View Files”.
 * @see raven.api.raven_message.get_all_files_shared_in_channel
 */
export async function listRavenFilesSharedInChannel(
  channelId: string,
  opts?: {
    fileName?: string;
    fileType?: RavenChannelFileTypeFilter;
    startAfter?: number;
    pageLength?: number;
  }
): Promise<RavenChannelFileRow[]> {
  const cid = channelId.trim();
  if (!cid) return [];

  const fileType = opts?.fileType && opts.fileType !== 'any' ? opts.fileType : undefined;
  const pageLength = opts?.pageLength ?? RAVEN_CHANNEL_FILES_API_PAGE;
  const search = opts?.fileName?.trim();

  try {
    const aggregated: RavenChannelFileRow[] = [];
    let startAfter = Math.max(0, Math.floor(opts?.startAfter ?? 0));
    for (let page = 0; page < RAVEN_CHANNEL_FILES_API_MAX_PAGES; page++) {
      const body: Record<string, unknown> = {
        channel_id: cid,
        start_after: startAfter,
        page_length: pageLength,
      };
      if (search) body.file_name = search;
      if (fileType) body.file_type = fileType;

      const data = await ravenCallFrappeMethod('raven.api.raven_message.get_all_files_shared_in_channel', body);
      const rows = Array.isArray(data?.message) ? data.message : [];
      const mapped = (rows as Record<string, unknown>[])
        .map(mapRavenApiFileInChannelRow)
        .filter((row): row is RavenChannelFileRow => row != null);
      aggregated.push(...mapped);
      if (rows.length < pageLength) break;
      startAfter += pageLength;
    }

    if (aggregated.length > 0) {
      return dedupeRavenChannelFileRows(aggregated);
    }
  } catch (e) {
    console.warn(LOG, 'listRavenFilesSharedInChannel fallback scan', e);
  }

  const scanned = await listSharedItemsInChannel(cid);
  const filter = opts?.fileType ?? 'any';
  return scanned
    .filter((row) => row.kind === 'photo' || row.kind === 'video' || row.kind === 'file')
    .map(sharedChatItemToChannelFileRow)
    .filter((row): row is RavenChannelFileRow => row != null)
    .filter((row) => ravenChannelFileMatchesTypeFilter(row.fileType, row.message_type, filter))
    .filter((row) => {
      if (!search) return true;
      return row.fileName.toLowerCase().includes(search.toLowerCase());
    });
}

/** Linked ERP documents and quotation drafts shared in a channel. */
export async function listSharedDocumentsInChannel(channelId: string): Promise<RavenSharedChatItem[]> {
  const items = await listSharedItemsInChannel(channelId);
  return items.filter((row) => row.kind === 'quotation' || row.kind === 'order' || row.kind === 'invoice');
}

/**
 * All distinct file attachments in a channel (newest-first scan), for legacy callers.
 */
export async function listSharedAttachmentsInChannel(channelId: string): Promise<RavenSharedChatAttachment[]> {
  const items = await listSharedItemsInChannel(channelId);
  return items
    .filter((row): row is RavenSharedChatItem & { file: string } => !!row.file?.trim())
    .map((row) => ({
      messageName: row.messageName,
      file: row.file,
      owner: row.owner,
      creation: row.creation,
      message_type: row.message_type,
    }));
}

const RAVEN_INBOX_TEXT_SCAN_PAGE = 40;
/** Safety cap: 500 × 40 ≈ 20k messages scanned per channel (newest first) when searching for a text body. */
const RAVEN_INBOX_TEXT_SCAN_MAX_PAGES = 500;

function messageRowHasPlainTextBody(m: RavenMessageRow): boolean {
  if (((m.text != null ? String(m.text) : '') || '').trim().length > 0) return true;
  if (String(m.link_document || '').trim()) return true;
  if (String(m.file || '').trim() || String(m.file_thumbnail || '').trim()) return true;
  return false;
}

/** Newest row + newest row with plain text (input must be creation-desc, e.g. from `listMessagesForChannel`). */
function unpackMessagesForInboxScan(rows: RavenMessageRow[]): {
  latest: RavenMessageRow | undefined;
  latestText: RavenMessageRow | null;
} {
  if (!rows?.length) return { latest: undefined, latestText: null };
  return {
    latest: rows[0],
    latestText: rows.find(messageRowHasPlainTextBody) ?? null,
  };
}

function mergeInboxMessagePair(
  a: { latest?: RavenMessageRow; latestText: RavenMessageRow | null },
  b: { latest?: RavenMessageRow; latestText: RavenMessageRow | null }
): { latest: RavenMessageRow | undefined; latestText: RavenMessageRow | null } {
  const latestCands = [a.latest, b.latest].filter((m): m is RavenMessageRow => !!m);
  const latest =
    latestCands.length === 0
      ? undefined
      : [...latestCands].sort((x, y) => ravenMessageRowSortTimeMs(y) - ravenMessageRowSortTimeMs(x))[0];
  const textCands = [a.latestText, b.latestText].filter((m): m is RavenMessageRow => !!m);
  const latestText =
    textCands.length === 0
      ? null
      : [...textCands].sort((x, y) => ravenMessageRowSortTimeMs(y) - ravenMessageRowSortTimeMs(x))[0];
  return { latest, latestText };
}

async function scanInboxFromResource(
  cid: string,
  opts?: { maxPages?: number }
): Promise<{
  latest: RavenMessageRow | undefined;
  latestText: RavenMessageRow | null;
}> {
  const maxPages = Math.min(
    Math.max(1, Math.floor(opts?.maxPages ?? RAVEN_INBOX_TEXT_SCAN_MAX_PAGES)),
    RAVEN_INBOX_TEXT_SCAN_MAX_PAGES
  );
  const fields = [
    'name',
    'channel_id',
    'text',
    'content',
    'owner',
    'creation',
    'modified',
    'message_type',
    'file',
    'file_thumbnail',
    'is_reply',
    'linked_message',
    'replied_message_details',
    'link_doctype',
    'link_document',
    'message_reactions',
    'is_forwarded',
    'is_edited',
  ];
  const tryFilters: any[][][] = [
    [['channel_id', '=', cid]],
    [['channel', '=', cid]],
  ];

  for (const filters of tryFilters) {
    let latest: RavenMessageRow | undefined;
    for (let page = 0; page < maxPages; page++) {
      let rows: any[] = [];
      try {
        rows = await ravenListResourceRows('Raven Message', {
          filters,
          fields,
          order_by: 'creation desc',
          limit_page_length: RAVEN_INBOX_TEXT_SCAN_PAGE,
          limit_start: page * RAVEN_INBOX_TEXT_SCAN_PAGE,
        });
      } catch {
        rows = [];
      }
      const batch = Array.isArray(rows) ? rows : [];
      const mapped = sortMessagesNewestFirst(
        mapMessagePlainText(batch.map((r) => mapApiRecordToRavenMessageRow(r as Record<string, unknown>)))
      );

      if (page === 0 && mapped.length === 0) break;

      if (page === 0 && mapped[0]) latest = mapped[0];

      const textHit = mapped.find(messageRowHasPlainTextBody);
      if (textHit) {
        return { latest, latestText: textHit };
      }

      if (batch.length < RAVEN_INBOX_TEXT_SCAN_PAGE) {
        return { latest, latestText: null };
      }
    }
    if (latest !== undefined) {
      return { latest, latestText: null };
    }
  }
  return { latest: undefined, latestText: null };
}

/**
 * Build an inbox-preview message row from the channel's own `last_message_details` snapshot
 * (returned by Raven `get_channels`) — zero extra HTTP requests. Returns null when the
 * snapshot is missing/empty so callers can fall back to a real message fetch.
 */
export function ravenChannelLastMessagePreviewRow(ch: RavenChannelRow): RavenMessageRow | null {
  const raw = ch.last_message_details;
  if (raw == null) return null;

  let d: Record<string, unknown> | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        d = parsed as Record<string, unknown>;
      }
    } catch {
      d = null;
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    d = raw as Record<string, unknown>;
  }
  if (!d) return null;

  const content = d.content != null ? String(d.content) : '';
  const messageType = d.message_type != null ? String(d.message_type).trim() : '';
  const name = d.message_id != null ? String(d.message_id).trim() : '';
  const owner = d.owner != null ? String(d.owner).trim() : '';
  const isFileLike = /^(image|file)$/i.test(messageType);
  const text = !isFileLike && content.trim() ? plainTextFromMaybeHtml(content) : '';
  const file = isFileLike && content.trim() ? content.trim() : undefined;

  if (!name && !text && !file) return null;

  return {
    name,
    channel_id: ch.name,
    text: text || undefined,
    owner: owner || undefined,
    creation: ch.last_message_timestamp || ch.modified,
    message_type: messageType || undefined,
    file,
  };
}

/**
 * Latest overall message (for recency) + most recent message with visible plain text (for inbox inclusion / preview).
 *
 * **Hub list performance:** We avoid running the heavy resource scan in parallel with a 200-message fetch for
 * every channel (very slow on Android). We load a modest newest-first page via `get_messages` / list API, and
 * only fall back to a **capped** resource scan when that returns nothing useful.
 */
export async function fetchChannelLatestAndMostRecentTextMessage(channelId: string): Promise<{
  latest: RavenMessageRow | undefined;
  latestText: RavenMessageRow | null;
}> {
  const cid = channelId?.trim();
  if (!cid) return { latest: undefined, latestText: null };

  const INBOX_PREVIEW_LIST_LIMIT = 60;
  const INBOX_PREVIEW_RESOURCE_MAX_PAGES = 12;

  let apiRows: RavenMessageRow[] = [];
  try {
    apiRows = await listMessagesForChannel(cid, INBOX_PREVIEW_LIST_LIMIT, { skipChannelVisit: true });
  } catch (e) {
    console.warn(LOG, 'fetchChannelLatestAndMostRecentTextMessage listMessages', cid, e);
    apiRows = [];
  }
  const fromApi = unpackMessagesForInboxScan(apiRows);
  const hasAny = fromApi.latest != null || fromApi.latestText != null;
  if (hasAny) {
    return mergeInboxMessagePair({ latest: undefined, latestText: null }, fromApi);
  }

  const fromResource = await scanInboxFromResource(cid, { maxPages: INBOX_PREVIEW_RESOURCE_MAX_PAGES });
  return mergeInboxMessagePair(fromResource, fromApi);
}

/** Same check Raven web uses before showing the create-channel form. */
export async function canCreateChannelInWorkspace(workspaceId: string): Promise<boolean> {
  try {
    const data = await ravenCallFrappeMethod('raven.api.workspaces.can_create_channel', {
      workspace: workspaceId,
    });
    return data?.message === true || data?.message === 1;
  } catch (e) {
    console.warn(LOG, 'can_create_channel', e);
    return false;
  }
}

/**
 * Create a workspace channel like Raven web (`useFrappeCreateDoc('Raven Channel', { ... })`).
 */
export async function createRavenWorkspaceChannel(
  workspaceId: string,
  input: { channel_name: string; channel_description?: string; type: RavenChannelType }
): Promise<RavenChannelRow> {
  const raw = input.channel_name.trim().toLowerCase().replace(/\s+/g, '-');
  const doc = await ravenCreateResourceDoc('Raven Channel', {
    channel_name: raw,
    channel_description: (input.channel_description ?? '').trim(),
    type: input.type,
    workspace: workspaceId.trim(),
  });
  return {
    name: String(doc?.name ?? ''),
    channel_name: doc?.channel_name != null ? String(doc.channel_name) : raw,
    workspace: doc?.workspace != null ? String(doc.workspace) : workspaceId,
    type: doc?.type != null ? String(doc.type) : input.type,
    is_archived: doc?.is_archived,
  };
}

export async function sendRavenChannelMessage(
  channelId: string,
  text: string,
  opts?: { replyToMessageId?: string }
): Promise<any> {
  const rid = String(opts?.replyToMessageId ?? '').trim();
  const body: Record<string, unknown> = {
    channel_id: channelId,
    text: text.trim() || ' ',
    /**
     * Match Raven official mobile (`useSendMessage.ts`): `is_reply` must be 0/1 so Frappe takes the
     * `if is_reply:` branch; bare booleans or omitted flags can leave `linked_message` unset on the doc.
     */
    is_reply: rid ? 1 : 0,
    linked_message: rid || null,
  };
  return ravenCallFrappeMethod('raven.api.raven_message.send_message', body);
}

/**
 * Post a Raven message that **links** an ERPNext/Frappe document — same mechanism as Raven web
 * `DocumentLinkButton` (`useFrappeCreateDoc('Raven Message', { message_type, channel_id, text, link_* })`).
 * The whitelisted `raven.api.raven_message.send_message` API does **not** accept `link_doctype` / `link_document`
 * (see Raven’s `send_message` in `raven/api/raven_message.py`).
 *
 * We try `frappe.client.insert` first (same server path as Desk), then `POST /api/resource/Raven Message`
 * with a body that matches Raven web: **no** top-level `doctype` key on the resource POST, and **omit**
 * `is_reply` / `linked_message` when not replying (matches Raven `DocumentLinkButton.tsx`).
 *
 * **Auth:** Dynamic Link validation requires the caller to be able to **read** the linked document. If the
 * app falls back to API-key auth with no Frappe session cookies, grant that integration user **Read** on
 * the linked DocType (e.g. Supplier Quotation), or ensure password login captured `Set-Cookie` so Raven
 * calls run as the portal user (`establishFrappeRavenSessionFromLoginResponses`).
 *
 * Raven’s `parse_html_content` runs on `text`; use minimal HTML when there is no caption so `content`
 * can still be derived from the link in `Raven Message.before_validate`.
 */
export async function sendRavenChannelDocumentLinkMessage(
  channelId: string,
  opts: {
    linkDoctype: string;
    linkDocument: string;
    /** Shown as message text / caption (optional). */
    caption?: string;
    replyToMessageId?: string;
  }
): Promise<any> {
  const cid = channelId.trim();
  const dt = String(opts.linkDoctype || '').trim();
  const dn = String(opts.linkDocument || '').trim();
  if (!cid) throw new Error('Channel is required');
  if (!dt || !dn) throw new Error('Document type and name are required');

  const cap = String(opts.caption ?? '').trim();
  const inner = cap ? cap.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  /** Match Raven web optional body: empty string is allowed; minimal tag keeps parsers happy. */
  const text = inner ? `<p>${inner}</p>` : '<p></p>';

  const rid = String(opts.replyToMessageId ?? '').trim();

  const docForInsert: Record<string, unknown> = {
    doctype: 'Raven Message',
    channel_id: cid,
    message_type: 'Text',
    text,
    link_doctype: dt,
    link_document: dn,
  };
  if (rid) {
    docForInsert.is_reply = 1;
    docForInsert.linked_message = rid;
  }

  if (!hasFrappeRavenSession()) {
    console.warn(
      LOG,
      'sendRavenChannelDocumentLinkMessage: no Frappe cookie session; using API key. If link fields do not persist, grant the key Read on',
      dt,
      'or fix login cookie capture.'
    );
  }

  try {
    const data = await ravenCallFrappeMethod('frappe.client.insert', { doc: docForInsert });
    return data?.message ?? data;
  } catch (e) {
    console.warn(LOG, 'sendRavenChannelDocumentLinkMessage: frappe.client.insert failed, trying resource API', e);
  }

  const resourcePayload: Record<string, unknown> = {
    channel_id: cid,
    message_type: 'Text',
    text,
    link_doctype: dt,
    link_document: dn,
  };
  if (rid) {
    resourcePayload.is_reply = 1;
    resourcePayload.linked_message = rid;
  }

  return ravenCreateResourceDoc('Raven Message', resourcePayload);
}

/**
 * Raven/Frappe multipart parsers can choke on names with many dots (e.g. Python module paths).
 */
function sanitizeRavenMultipartFileName(raw: string): string {
  const t = (raw || '').trim() || 'upload.bin';
  const lastDot = t.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < t.length - 1;
  const extRaw = hasExt ? t.slice(lastDot) : '';
  const ext = extRaw.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16).toLowerCase();
  const baseRaw = hasExt ? t.slice(0, lastDot) : t;
  const base = baseRaw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'file';
  const baseTrim = base.slice(0, 80);
  return ext ? `${baseTrim}${ext.startsWith('.') ? ext : `.${ext}`}` : baseTrim;
}

/** Use the same URI React Native gave us (including file://); path-only can break on some devices. */
function formDataLocalUriForUpload(uri: string): string {
  return uri.trim();
}

/**
 * Upload image/file into a channel using Raven's multipart API (creates Raven Message + attaches file).
 * @see raven.api.upload_file.upload_file_with_message
 */
export async function uploadRavenFileWithMessage(
  channelId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  opts?: { caption?: string; replyToMessageId?: string; compressImages?: boolean }
): Promise<any> {
  console.log(LOG, 'uploadRavenFileWithMessage:start', {
    channelId,
    fileName,
    mimeType,
    originalUri: fileUri.slice(0, 120),
    hasSession: hasFrappeRavenSession(),
  });
  const uploadUri = await prepareLocalFileUriForUpload(fileUri, fileName);
  const safeFileName = sanitizeRavenMultipartFileName(fileName);
  const uriForPart = formDataLocalUriForUpload(uploadUri);
  console.log(LOG, 'uploadRavenFileWithMessage:uriReady', {
    uploadUri: uploadUri.slice(0, 120),
    uriForPart: uriForPart.slice(0, 120),
    safeFileName,
    changed: uploadUri !== fileUri,
  });
  const form = new FormData();
  form.append('channelID', channelId);
  form.append('file', { uri: uriForPart, name: safeFileName, type: mimeType } as any);
  form.append('caption', opts?.caption ?? '');
  const compress =
    opts?.compressImages !== undefined
      ? opts.compressImages
      : mimeType.toLowerCase().startsWith('image/');
  form.append('compressImages', compress ? '1' : '0');
  if (opts?.replyToMessageId) {
    form.append('is_reply', '1');
    form.append('linked_message', opts.replyToMessageId);
  } else {
    form.append('is_reply', '0');
  }
  try {
    const res = await ravenCallMultipartFrappeMethod('raven.api.upload_file.upload_file_with_message', form);
    console.log(LOG, 'uploadRavenFileWithMessage:ok', { channelId, fileName });
    return res;
  } catch (e) {
    console.warn(LOG, 'uploadRavenFileWithMessage:fail', {
      channelId,
      fileName,
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Workspace members (whitelist API), merged with resource rows for `custom_supplier` / Supplier link. */
const workspaceMembersInflight = new Map<string, Promise<RavenWorkspaceMemberRow[]>>();

async function fetchWorkspaceMembersResolved(workspaceDocId: string): Promise<RavenWorkspaceMemberRow[]> {
  const ws = workspaceDocId.trim();
  if (!ws) return [];
  let base: RavenWorkspaceMemberRow[] = [];
  try {
    const data = await ravenCallFrappeMethod('raven.api.workspaces.fetch_workspace_members', {
      workspace: ws,
    });
    const msg = data?.message;
    if (Array.isArray(msg)) base = msg as RavenWorkspaceMemberRow[];
    else if (typeof msg === 'string') {
      try {
        const p = JSON.parse(msg);
        base = Array.isArray(p) ? (p as RavenWorkspaceMemberRow[]) : [];
      } catch {
        base = [];
      }
    }
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    // Missing workspace / permission — resource list below is the fallback.
    if (status !== 404 && status !== 403) {
      console.warn(LOG, 'fetch_workspace_members', e);
    }
  }

  try {
    let rows: RavenWorkspaceMemberRow[] = [];
    try {
      const wide = await ravenListResourceRows('Raven Workspace Member', {
        filters: [['workspace', '=', ws]],
        fields: ['*'],
        limit_page_length: 500,
      });
      rows = Array.isArray(wide) ? (wide as RavenWorkspaceMemberRow[]) : [];
    } catch (eWide) {
      console.warn(LOG, 'fetchWorkspaceMembers: list with * fields failed, retrying explicit fields', eWide);
      const narrow = await ravenListResourceRows('Raven Workspace Member', {
        filters: [['workspace', '=', ws]],
        fields: ['name', 'user', 'is_admin', 'creation', 'custom_supplier', 'supplier'],
        limit_page_length: 500,
      });
      rows = Array.isArray(narrow) ? (narrow as RavenWorkspaceMemberRow[]) : [];
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return finalizeWorkspaceMembersWithImages(base);
    }
    const res = rows;
    if (base.length === 0) {
      return finalizeWorkspaceMembersWithImages(res);
    }
    /** Raven whitelist API omits custom fields; resource rows carry the Supplier link. */
    const supplierByUser = new Map<string, string | null>();
    const supplierByMemberDocName = new Map<string, string | null>();
    const resourceByUser = new Map<string, RavenWorkspaceMemberRow>();
    for (const r of res) {
      const rec = r as unknown as Record<string, unknown>;
      const sup = parseLinkedSupplierFromWorkspaceMemberResourceRow(rec);
      const u = (r.user || '').trim().toLowerCase();
      if (u) {
        supplierByUser.set(u, sup);
        resourceByUser.set(u, r);
      }
      const mn = String(r.name ?? '').trim();
      if (mn) supplierByMemberDocName.set(mn, sup);
    }
    const merged: RavenWorkspaceMemberRow[] = base.map((m) => {
      const uid = (m.user || '').trim().toLowerCase();
      const memberDoc = String(m.name ?? '').trim();
      const resourceRow = uid ? resourceByUser.get(uid) : undefined;
      const candidates: (string | null | undefined)[] = [];
      if (uid && supplierByUser.has(uid)) candidates.push(supplierByUser.get(uid) ?? undefined);
      if (memberDoc && supplierByMemberDocName.has(memberDoc)) {
        candidates.push(supplierByMemberDocName.get(memberDoc) ?? undefined);
      }
      candidates.push(parseLinkedSupplierFromWorkspaceMemberResourceRow(m as unknown as Record<string, unknown>));
      let linked: string | null = null;
      for (const c of candidates) {
        const t = c != null ? String(c).trim() : '';
        if (t) {
          linked = t;
          break;
        }
      }
      const withAdmin =
        resourceRow?.is_admin != null && m.is_admin == null
          ? { ...m, is_admin: resourceRow.is_admin }
          : m;
      if (!linked) return withAdmin;
      return { ...withAdmin, custom_supplier: linked };
    });
    const baseUsers = new Set(
      base.map((m) => (m.user || '').trim().toLowerCase()).filter((u) => u.length > 0)
    );
    for (const r of res) {
      const u = (r.user || '').trim().toLowerCase();
      if (u && !baseUsers.has(u)) merged.push(r);
    }
    return finalizeWorkspaceMembersWithImages(merged);
  } catch (e) {
    console.warn(LOG, 'fetchWorkspaceMembers resource merge', e);
    return finalizeWorkspaceMembersWithImages(base);
  }
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<RavenWorkspaceMemberRow[]> {
  const hint = workspaceId.trim();
  if (!hint) return [];

  const wsRows = await fetchRavenWorkspaces();
  const ws = resolveRavenWorkspaceDocId(hint, wsRows) || hint;
  const inflight = workspaceMembersInflight.get(ws);
  if (inflight) return inflight;

  const promise = fetchWorkspaceMembersResolved(ws);
  workspaceMembersInflight.set(ws, promise);
  try {
    return await promise;
  } finally {
    if (workspaceMembersInflight.get(ws) === promise) {
      workspaceMembersInflight.delete(ws);
    }
  }
}

/** ERPNext **Supplier** profile for native “business profile” UI (catalog + attachments). */
export type ErpSupplierFileAttachment = {
  name: string;
  file_name: string;
  file_url: string;
  is_private?: number | boolean | string;
};

export type ErpSupplierProfile = {
  name: string;
  supplier_name: string;
  supplier_details_plain: string;
  country?: string;
  supplier_group?: string;
  supplier_type?: string;
  /** Supplier `image` field (public or private file URL). */
  image?: string | null;
  /** **File** rows attached to this Supplier (`attached_to_doctype` = Supplier). */
  attachments: ErpSupplierFileAttachment[];
};

export async function fetchErpSupplierProfile(supplierName: string): Promise<ErpSupplierProfile | null> {
  const key = supplierName.trim();
  if (!key) return null;
  try {
    const client = getERPNextClient();
    const raw = await client.getSupplier(key);
    if (!raw) return null;
    const detailsPlain = plainTextFromMaybeHtml(
      raw.supplier_details != null ? String(raw.supplier_details) : ''
    ).trim();
    const img = raw.image != null ? String(raw.image).trim() : '';

    let attachments: ErpSupplierFileAttachment[] = [];
    try {
      const rows = await client.listResourceRows('File', {
        filters: [
          ['attached_to_doctype', '=', 'Supplier'],
          ['attached_to_name', '=', key],
        ],
        fields: ['name', 'file_name', 'file_url', 'is_private'],
        order_by: 'creation desc',
        limit_page_length: 100,
      });
      attachments = (Array.isArray(rows) ? rows : [])
        .map((r: Record<string, unknown>) => ({
          name: String(r.name ?? ''),
          file_name: String(r.file_name ?? r.file_url ?? 'file'),
          file_url: String(r.file_url ?? ''),
          is_private: r.is_private as ErpSupplierFileAttachment['is_private'],
        }))
        .filter((a) => a.file_url.length > 0);
    } catch (e) {
      console.warn(LOG, 'fetchErpSupplierProfile File list', e);
    }

    return {
      name: String(raw.name ?? key),
      supplier_name: String(raw.supplier_name ?? key),
      supplier_details_plain: detailsPlain || 'No description on file for this supplier.',
      country: raw.country != null ? String(raw.country) : undefined,
      supplier_group: raw.supplier_group != null ? String(raw.supplier_group) : undefined,
      supplier_type: raw.supplier_type != null ? String(raw.supplier_type) : undefined,
      image: img || null,
      attachments,
    };
  } catch (e) {
    console.warn(LOG, 'fetchErpSupplierProfile', e);
    return null;
  }
}

/**
 * Opens or creates a 1:1 DM channel with `userId` (Frappe User.name, usually email).
 * @see raven.api.raven_channel.create_direct_message_channel
 */
export async function createDirectMessageChannel(userId: string): Promise<string> {
  const data = await ravenCallFrappeMethod('raven.api.raven_channel.create_direct_message_channel', {
    user_id: userId.trim(),
  });
  const mid = data?.message;
  if (typeof mid === 'string' && mid.length > 0) return mid;
  if (mid && typeof mid === 'object' && (mid as { name?: string }).name) {
    return String((mid as { name: string }).name);
  }
  throw new Error('Unexpected response from create_direct_message_channel');
}

/** Row from `raven.api.raven_message.get_unread_count_for_channels` (`name` = Raven Channel id). */
export type RavenChannelUnreadRow = {
  name: string;
  unread_count: number;
  is_direct_message?: number | boolean;
};

/**
 * Unread counts per channel for the current session user (Raven Channel Member `last_visit` vs messages).
 * @see raven.api.raven_message.get_unread_count_for_channels
 */
export async function getUnreadCountForChannels(): Promise<RavenChannelUnreadRow[]> {
  try {
    const data = await ravenCallFrappeMethod('raven.api.raven_message.get_unread_count_for_channels', {});
    const msg = data?.message;
    if (Array.isArray(msg)) return msg as RavenChannelUnreadRow[];
    if (typeof msg === 'string') {
      try {
        const p = JSON.parse(msg);
        return Array.isArray(p) ? (p as RavenChannelUnreadRow[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  } catch (e) {
    console.warn(LOG, 'getUnreadCountForChannels', e);
    return [];
  }
}

/**
 * Mark channels as read (updates member `last_visit`).
 * @see raven.api.raven_channel.mark_all_messages_as_read
 */
export async function markAllRavenMessagesAsRead(channelIds: string[]): Promise<void> {
  const ids = channelIds.map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length) return;
  try {
    await ravenCallFrappeMethod('raven.api.raven_channel.mark_all_messages_as_read', {
      channel_ids: ids,
    });
  } catch (e) {
    console.warn(LOG, 'markAllRavenMessagesAsRead', e);
  }
}

function normRavenPresenceUserId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Frappe user ids whose clients recently reported as active — same as Raven web `useFetchActiveUsers`.
 * @see raven.api.user_availability.get_active_users
 */
export async function fetchRavenActiveUsers(): Promise<string[]> {
  try {
    const data = await ravenCallFrappeMethod('raven.api.user_availability.get_active_users', {});
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.map((x) => String(x).trim()).filter(Boolean);
    if (typeof msg === 'string') {
      try {
        const p = JSON.parse(msg);
        return Array.isArray(p) ? p.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
      } catch {
        return [];
      }
    }
  } catch (e) {
    console.warn(LOG, 'fetchRavenActiveUsers', e);
  }
  return [];
}

/**
 * Frappe `User.name` values whose **Raven User** has `availability_status` = Invisible (never show green “active”).
 * @see Raven web `useIsUserActive`
 */
export async function fetchRavenInvisibleUserIds(userIds: string[]): Promise<string[]> {
  const unique = [...new Set(userIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!unique.length) return [];
  const out: string[] = [];
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const rows = await ravenListResourceRows('Raven User', {
        filters: [
          ['user', 'in', chunk],
          ['availability_status', '=', 'Invisible'],
        ],
        fields: ['user'],
        limit_page_length: chunk.length,
      });
      for (const r of rows as { user?: string }[]) {
        const u = r?.user != null ? String(r.user).trim() : '';
        if (u) out.push(u);
      }
    } catch (e) {
      console.warn(LOG, 'fetchRavenInvisibleUserIds (compound filter)', e);
      try {
        const rows = await ravenListResourceRows('Raven User', {
          filters: [['user', 'in', chunk]],
          fields: ['user', 'availability_status'],
          limit_page_length: chunk.length,
        });
        for (const r of rows as { user?: string; availability_status?: string }[]) {
          if (String(r?.availability_status ?? '').trim() !== 'Invisible') continue;
          const u = r?.user != null ? String(r.user).trim() : '';
          if (u) out.push(u);
        }
      } catch (e2) {
        console.warn(LOG, 'fetchRavenInvisibleUserIds (fallback)', e2);
      }
    }
  }
  return out;
}

/**
 * Same rules as Raven web `useIsUserActive`: self is always “active”; Invisible overrides server active list;
 * otherwise membership in `get_active_users`.
 */
export function ravenUserIsActiveLikeWeb(
  userId: string | null | undefined,
  currentUserEmail: string | null | undefined,
  activeNormSet: ReadonlySet<string>,
  invisibleNormSet: ReadonlySet<string>
): boolean {
  const uid = (userId || '').trim();
  if (!uid) return false;
  const key = normRavenPresenceUserId(uid);
  const me = normRavenPresenceUserId(currentUserEmail || '');
  if (me && key === me) return true;
  if (invisibleNormSet.has(key)) return false;
  return activeNormSet.has(key);
}

/** Raven `get_search_result` `filter_type` — matches Raven web search categories. */
export type RavenSearchFilterType = 'Message' | 'Channel' | 'File';

/** One row from `raven.api.search.get_search_result` (shape varies by `filter_type`). */
export type RavenSearchResultRow = Record<string, unknown>;

/** Best-effort channel id on a search row (Message/File); some server versions omit or nest fields. */
export function ravenSearchResultRowChannelId(row: RavenSearchResultRow | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  const top = row.channel_id;
  if (top != null && String(top).trim()) return String(top).trim();
  const msg = row.message;
  if (msg && typeof msg === 'object' && 'channel_id' in msg) {
    const nested = (msg as { channel_id?: unknown }).channel_id;
    if (nested != null && String(nested).trim()) return String(nested).trim();
  }
  return '';
}

/**
 * Raven global search (messages, channels, files) for the current session user.
 * Server limits to 20 rows; message/file queries join channels the user is a member of.
 * Optional `in_channel` must be a **Raven Channel** document id (`name`); only applied for **Message** and **File**
 * filters (Raven’s `Channel` search uses a different query shape).
 *
 * @see raven.api.search.get_search_result
 */
export async function getRavenSearchResults(
  filterType: RavenSearchFilterType,
  searchText: string,
  opts?: { in_channel?: string | null }
): Promise<RavenSearchResultRow[]> {
  const q = searchText.trim();
  if (q.length < 2) return [];
  try {
    const body: Record<string, unknown> = {
      filter_type: filterType,
      search_text: q,
    };
    const inchRaw = opts?.in_channel != null ? String(opts.in_channel).trim() : '';
    /** Raven `search.py` applies `in_channel` on the message query only; `Channel` filter replaces the query. */
    if (inchRaw && (filterType === 'Message' || filterType === 'File')) {
      body.in_channel = inchRaw;
    }
    const data = await ravenCallFrappeMethod('raven.api.search.get_search_result', body);
    const msg = parseMethodMessage<RavenSearchResultRow[]>(data);
    let rows = Array.isArray(msg) ? msg : [];
    /** Defense in depth: some Frappe/Raven builds ignore `in_channel` on the wire; never show other threads. */
    if (inchRaw && (filterType === 'Message' || filterType === 'File')) {
      rows = rows.filter((r) => ravenSearchResultRowChannelId(r) === inchRaw);
    }
    return rows;
  } catch (e) {
    console.warn(LOG, 'getRavenSearchResults', filterType, e);
    throw e;
  }
}

export function buildFallbackWorkspaceChannelRow(
  workspaceWs: string,
  channelId: string,
  patch?: Partial<RavenChannelRow>
): RavenChannelRow {
  return {
    name: channelId,
    channel_name: patch?.channel_name || channelId,
    workspace: workspaceWs || patch?.workspace || undefined,
    type: patch?.type || 'Public',
    is_direct_message: 0,
    ...patch,
  };
}

/** Load a Raven Channel document by id (for deep links when it is not in `get_channels` yet). */
export async function fetchRavenChannelRowById(channelId: string): Promise<RavenChannelRow | null> {
  const id = String(channelId || '').trim();
  if (!id) return null;

  if (hasFrappeRavenSession()) {
    try {
      const doc = await ravenGetResourceDoc('Raven Channel', id);
      if (doc?.name) return { ...(doc as RavenChannelRow), name: String(doc.name).trim() };
    } catch (e) {
      console.warn(LOG, 'fetchRavenChannelRowById get doc', e);
    }
  }

  try {
    const data = await ravenCallFrappeMethod('frappe.client.get', {
      doctype: 'Raven Channel',
      name: id,
    });
    const doc = ((data as { message?: RavenChannelRow })?.message ?? data) as RavenChannelRow;
    if (doc?.name) return { ...doc, name: String(doc.name).trim() };
  } catch (e) {
    console.warn(LOG, 'fetchRavenChannelRowById client.get', e);
  }

  try {
    const rows = await getERPNextClient().listResourceRows('Raven Channel', {
      filters: [['name', '=', id]],
      fields: [
        'name',
        'channel_name',
        'workspace',
        'type',
        'is_archived',
        'is_direct_message',
        'is_self_message',
        'last_message_timestamp',
        'modified',
      ],
      limit_page_length: 1,
    });
    const row = rows[0] as RavenChannelRow | undefined;
    return row?.name ? { ...row, name: String(row.name).trim() } : null;
  } catch (e) {
    console.warn(LOG, 'fetchRavenChannelRowById api key', e);
    return null;
  }
}

/** Resolve `Raven Channel.workspace` for opening a channel from search (channel-only hits omit workspace). */
export async function fetchRavenChannelWorkspaceId(channelId: string): Promise<string | null> {
  const id = String(channelId || '').trim();
  if (!id) return null;

  const workspaceFromRows = (rows: unknown[]): string | null => {
    const w = (rows[0] as { workspace?: string } | undefined)?.workspace;
    return w != null && String(w).trim() ? String(w).trim() : null;
  };

  try {
    const rows = await ravenListResourceRows('Raven Channel', {
      filters: [['name', '=', id]],
      fields: ['name', 'workspace'],
      limit_page_length: 1,
    });
    const w = workspaceFromRows(rows);
    if (w) return w;
  } catch (e) {
    console.warn(LOG, 'fetchRavenChannelWorkspaceId list', e);
  }

  if (hasFrappeRavenSession()) {
    try {
      const doc = await ravenGetResourceDoc('Raven Channel', id);
      const w = String(doc?.workspace || '').trim();
      if (w) return w;
    } catch (e) {
      console.warn(LOG, 'fetchRavenChannelWorkspaceId get doc', e);
    }
  }

  try {
    const data = await ravenCallFrappeMethod('frappe.client.get', {
      doctype: 'Raven Channel',
      name: id,
    });
    const doc = (data as { message?: { workspace?: string } })?.message ?? data;
    const w = String((doc as { workspace?: string })?.workspace || '').trim();
    if (w) return w;
  } catch (e) {
    console.warn(LOG, 'fetchRavenChannelWorkspaceId client.get', e);
  }

  try {
    const rows = await getERPNextClient().listResourceRows('Raven Channel', {
      filters: [['name', '=', id]],
      fields: ['name', 'workspace'],
      limit_page_length: 1,
    });
    return workspaceFromRows(rows);
  } catch (e) {
    console.warn(LOG, 'fetchRavenChannelWorkspaceId api key', e);
    return null;
  }
}

/**
 * Best-effort workspace for deep-linking into a Raven channel (support chat, search, route params).
 * Tries the user's channel list first, then server lookups, then configured support workspace.
 */
export async function resolveRavenChannelWorkspaceForOpen(
  channelId: string,
  sessionEmail?: string | null
): Promise<string | null> {
  const ch = String(channelId || '').trim();
  if (!ch) return null;

  const channels = await listRavenChannelsForSessionUser(sessionEmail, { enrichProfiles: false });
  const hit = channels.find((c) => String(c.name || '').trim() === ch);
  const fromList = String(hit?.workspace || '').trim();
  if (fromList) return fromList;

  const fromFetch = await fetchRavenChannelWorkspaceId(ch);
  if (fromFetch) return fromFetch;

  const supportWsHint = String(process.env.EXPO_PUBLIC_SOURCEWAVE_SUPPORT_RAVEN_WORKSPACE || '').trim();
  if (supportWsHint) {
    const resolved = await resolveRavenWorkspaceId(supportWsHint);
    if (resolved) return resolved;
    return supportWsHint;
  }

  return null;
}

/** Receiver for `raven.api.raven_message.forward_message` — user DM or channel. */
export type RavenForwardReceiver = {
  name: string;
  type: string;
};

/** Build Frappe payload for forward API from a loaded message row. */
export function ravenMessageRowToForwardPayload(row: RavenMessageRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    doctype: 'Raven Message',
    text: row.text ?? '',
    message_type: row.message_type ?? 'Text',
    channel_id: row.channel_id,
  };
  if (row.file) payload.file = row.file;
  if (row.file_thumbnail) payload.file_thumbnail = row.file_thumbnail;
  if (row.thumbnail_width != null) payload.thumbnail_width = row.thumbnail_width;
  if (row.thumbnail_height != null) payload.thumbnail_height = row.thumbnail_height;
  if (row.image_width != null) payload.image_width = row.image_width;
  if (row.image_height != null) payload.image_height = row.image_height;
  if (row.link_doctype) payload.link_doctype = row.link_doctype;
  if (row.link_document) payload.link_document = row.link_document;
  return payload;
}

export async function forwardRavenMessage(
  receivers: RavenForwardReceiver[],
  message: RavenMessageRow
): Promise<void> {
  const list = Array.isArray(receivers) ? receivers.filter((r) => String(r?.name || '').trim()) : [];
  if (!list.length) throw new Error('Select at least one person or channel.');
  await ravenCallFrappeMethod('raven.api.raven_message.forward_message', {
    message_receivers: list,
    forwarded_message: ravenMessageRowToForwardPayload(message),
  });
}

export async function reactToRavenMessage(
  messageId: string,
  reaction: string,
  opts?: { isCustom?: boolean; emojiName?: string }
): Promise<void> {
  const id = String(messageId || '').trim();
  const emoji = String(reaction || '').trim();
  if (!id || !emoji) throw new Error('Message and reaction are required.');
  await ravenCallFrappeMethod('raven.api.reactions.react', {
    message_id: id,
    reaction: emoji,
    is_custom: opts?.isCustom ? 1 : 0,
    emoji_name: opts?.emojiName ?? null,
  });
}

/** Permanent delete for all users — same as Raven web `DeleteMessageModal` (`deleteDoc`). */
export async function deleteRavenMessage(messageId: string): Promise<void> {
  const id = String(messageId || '').trim();
  if (!id) throw new Error('Message id is required.');
  const doctype = 'Raven Message';

  if (!hasFrappeRavenSession()) {
    throw new Error('Sign in required to delete messages.');
  }

  try {
    await ravenDeleteResourceDoc(doctype, id);
    return;
  } catch (resourceErr) {
    console.warn('[ravenNativeApi] DELETE Raven Message resource failed; trying frappe.client.delete', resourceErr);
  }

  await ravenCallFrappeMethod('frappe.client.delete', {
    doctype,
    name: id,
  });
}

function ravenPlainTextToMessageHtml(plain: string): string {
  const inner = plain.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${inner}</p>`;
}

/** Update message text — mirrors Raven web `EditMessageModal` (`text` + `is_edited`). */
export async function editRavenMessageText(messageId: string, plainText: string): Promise<RavenMessageRow> {
  const id = String(messageId || '').trim();
  const next = plainText.trim();
  if (!id) throw new Error('Message id is required.');
  if (!next) throw new Error('Message cannot be empty.');

  const html = ravenPlainTextToMessageHtml(next);
  const doctype = 'Raven Message';

  await ravenCallFrappeMethod('frappe.client.set_value', {
    doctype,
    name: id,
    fieldname: 'text',
    value: html,
  });
  await ravenCallFrappeMethod('frappe.client.set_value', {
    doctype,
    name: id,
    fieldname: 'is_edited',
    value: 1,
  });

  const data = await ravenCallFrappeMethod('frappe.client.get', {
    doctype,
    name: id,
  });
  const out = ((data as { message?: Record<string, unknown> })?.message ?? data) as Record<string, unknown>;
  const row = mapApiRecordToRavenMessageRow(out);
  return { ...row, text: next, content: next };
}
