/**
 * When the user opens a DM from `RavenWorkspaceSupplierProfile`, we dismiss that stack
 * screen with `goBack()` so the Suppliers chat stays visible underneath — no nested
 * `navigate('Main')` (avoids tab / stack transitions that feel unrelated to chat).
 */
export type RavenOpenChatFromProfilePayload = {
  workspaceId: string;
  channelId: string;
  peerUserId?: string;
};

type Subscriber = (p: RavenOpenChatFromProfilePayload) => void;

let subscriber: Subscriber | null = null;

/** Only `RavenUIMessagesScreen` on the Suppliers tab should register (not header inbox). */
export function setRavenOpenChatFromProfileSubscriber(fn: Subscriber | null): void {
  subscriber = fn;
}

export function emitRavenOpenChatFromProfile(p: RavenOpenChatFromProfilePayload): void {
  subscriber?.(p);
}
