import type { ChatScopeType } from "../entities/chat-extensions.types";
import { scopeLabelKey, type ChatAssetRef, type ChatUserRef, type IChatDirectory } from "./chat-directory.interface";

/** In-memory cho unit test: test dựng người dùng/nhãn bằng `addUser`/`setScopeLabel`. */
export class InMemoryChatDirectory implements IChatDirectory {
  private readonly people = new Map<string, ChatUserRef>();
  private readonly labels = new Map<string, string>();

  addUser(id: string, over: Partial<Omit<ChatUserRef, "id">> = {}): ChatUserRef {
    const user: ChatUserRef = { id, name: over.name ?? `Người ${id.slice(-4)}`, status: over.status ?? "ACTIVE", avatar: over.avatar ?? null };
    this.people.set(id, user);
    return user;
  }

  setStatus(id: string, status: ChatUserRef["status"]): void {
    const u = this.people.get(id);
    if (u) this.people.set(id, { ...u, status });
  }

  setScopeLabel(scopeType: ChatScopeType, scopeId: string, label: string): void {
    this.labels.set(scopeLabelKey(scopeType, scopeId), label);
  }

  private readonly files = new Map<string, ChatAssetRef>();

  addAsset(assetId: string, over: Partial<Omit<ChatAssetRef, "assetId">> = {}): void {
    this.files.set(assetId, { assetId, name: over.name ?? "tep.pdf", mime: over.mime ?? "application/pdf", size: over.size ?? 1024 });
  }

  async assets(ids: string[]): Promise<Map<string, ChatAssetRef>> {
    const out = new Map<string, ChatAssetRef>();
    for (const id of ids) {
      const f = this.files.get(id);
      if (f) out.set(id, f);
    }
    return out;
  }

  private readonly visibilities = new Map<string, "PUBLIC" | "PRIVATE">();

  setChannelVisibility(channelId: string, visibility: "PUBLIC" | "PRIVATE"): void {
    this.visibilities.set(channelId, visibility);
  }

  async channelVisibility(channelId: string): Promise<"PUBLIC" | "PRIVATE" | null> {
    return this.visibilities.get(channelId) ?? null;
  }

  async users(ids: string[]): Promise<Map<string, ChatUserRef>> {
    const out = new Map<string, ChatUserRef>();
    for (const id of ids) {
      const u = this.people.get(id);
      if (u) out.set(id, u);
    }
    return out;
  }

  async scopeLabels(_viewerId: string, scopes: Array<{ scopeType: ChatScopeType; scopeId: string }>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const s of scopes) {
      const label = this.labels.get(scopeLabelKey(s.scopeType, s.scopeId));
      if (label) out.set(scopeLabelKey(s.scopeType, s.scopeId), label);
    }
    return out;
  }
}
