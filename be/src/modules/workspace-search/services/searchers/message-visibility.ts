import type { ReadableScopes } from "../../entities/search.interface";
import type { IMessageSearchRepository, SearchMessageRow } from "../../repositories/search.repository.interface";
import { unique } from "./searcher.types";

export interface VisibilityOptions {
  /** Tin phải còn `content` (tìm tin) — tìm tệp cho phép tin chỉ có tệp. */
  requireContent: boolean;
  /** Reply thread phải còn tin gốc. */
  checkParents: boolean;
}

/**
 * Loại: scope không còn đọc được theo `fresh` (DU-02), tin thu hồi, tin "xoá phía tôi" (`MessageHide`), tin gốc hội thoại trước mốc
 * `hiddenBeforeSeq` (D-23; reply thread có dãy `seq` riêng nên không so mốc này), reply mất tin gốc.
 */
export async function filterVisibleMessages(
  repo: IMessageSearchRepository,
  userId: string,
  rows: readonly SearchMessageRow[],
  fresh: ReadableScopes,
  opts: VisibilityOptions
): Promise<SearchMessageRow[]> {
  if (rows.length === 0) return [];
  const parentIds = opts.checkParents ? unique(rows.flatMap((r) => (r.threadId ? [r.threadId] : []))) : [];
  const [hidden, parents] = await Promise.all([
    repo.findHiddenMessageIds(userId, rows.map((r) => r.id)),
    repo.findExistingMessageIds(parentIds),
  ]);
  return rows.filter((r) => {
    if (r.deletedAt !== null || hidden.has(r.id)) return false;
    if (opts.requireContent && !r.content) return false;
    if (opts.checkParents && r.threadId !== null && !parents.has(r.threadId)) return false;
    if (r.scopeType === "CHANNEL") return fresh.channels.has(r.scopeId);
    const conv = fresh.conversations.get(r.scopeId);
    if (!conv) return false;
    return !(r.threadId === null && conv.hiddenBeforeSeq > 0 && r.seq <= conv.hiddenBeforeSeq);
  });
}

/** Tập scope (loại + id, bỏ trùng) của các dòng — đầu vào `ReadableScopesService.compute({ only })` khi kiểm lại quyền. */
export function scopeRefsOf(rows: readonly SearchMessageRow[]): { type: "CHANNEL" | "CONVERSATION"; id: string }[] {
  const seen = new Set<string>();
  const out: { type: "CHANNEL" | "CONVERSATION"; id: string }[] = [];
  for (const r of rows) {
    const key = `${r.scopeType}:${r.scopeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: r.scopeType, id: r.scopeId });
  }
  return out;
}
