import type { RavenMessageRow } from '../services/ravenNativeApi';
import {
  classifyRavenAttachment,
  getRavenAttachmentLabel,
  resolveRavenMessageFilePaths,
} from './ravenAttachment';
import { sanitizeRavenWebMessageFileUrl } from './ravenFileUrl';

export type ChatImageGalleryItem = {
  id: string;
  uri: string;
  title: string;
};

/** Oldest-first image attachments from loaded chat messages (for swipe gallery). */
export function collectChatImageGalleryItems(messages: RavenMessageRow[]): ChatImageGalleryItem[] {
  const items: ChatImageGalleryItem[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const { display } = resolveRavenMessageFilePaths(msg);
    if (!display) continue;
    const { kind } = classifyRavenAttachment(display, msg.message_type);
    if (kind !== 'image') continue;
    const id = String(msg.name || '').trim();
    const uri = sanitizeRavenWebMessageFileUrl(msg.file) || display;
    if (!id || !uri) continue;
    const title = getRavenAttachmentLabel(msg.file || display) || 'Image';
    items.push({ id, uri, title });
  }
  return items;
}
