import type { RavenOpenChatFromProfilePayload } from './ravenOpenChatFromProfileBridge';

let pending: RavenOpenChatFromProfilePayload | null = null;

/** Queue a Suppliers-tab DM open (survives tab unmount while compose/profile stack is on top). */
export function setPendingSuppliersChatOpen(p: RavenOpenChatFromProfilePayload | null): void {
  pending = p;
}

export function peekPendingSuppliersChatOpen(): RavenOpenChatFromProfilePayload | null {
  return pending;
}

export function consumePendingSuppliersChatOpen(): RavenOpenChatFromProfilePayload | null {
  const hit = pending;
  pending = null;
  return hit;
}
