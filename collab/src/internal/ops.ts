import type { Document, Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import type { AccessService } from "../access-service";
import { closeLiveConnection, countByKind, liveConnections, type CloseReason } from "../connections";
import type { PersistenceExtension } from "../extensions/persistence";
import type { KickBus } from "../extensions/redis";
import type { CollabMetrics } from "../metrics";
import { buildDocumentName, type ResourceKind } from "../resource-kinds";
import { encodeNotice } from "../types";

export interface OpsDeps {
  hocuspocus: () => Hocuspocus;
  persistence: PersistenceExtension;
  access: AccessService;
  metrics: CollabMetrics;
  bus: KickBus;
}

export interface KickInput {
  kind?: ResourceKind;
  docId?: string;
  userId?: string;
  workspaceId?: string;
  reason: Extract<CloseReason, "revoked" | "archived" | "forbidden">;
}

/**
 * Đóng kết nối theo bộ lọc (AND): tài nguyên (`docId`+`kind`), người dùng (`userId`), workspace (`workspaceId`, lấy từ kết quả `access` của BE).
 * Phát tiếp tới các instance khác qua bus Redis (nếu có) khi lệnh đến từ BE. Trả số kết nối đã đóng ở instance NÀY.
 */
export function kick(deps: OpsDeps, input: KickInput, opts: { fromBus?: boolean } = {}): number {
  const documentName = input.docId ? buildDocumentName(input.kind ?? "document", input.docId) : undefined;
  let closed = 0;
  for (const live of liveConnections(deps.hocuspocus(), documentName ? { documentName } : undefined)) {
    if (input.userId && live.ctx.user?.id !== input.userId) continue;
    if (input.workspaceId && live.ctx.workspaceId !== input.workspaceId) continue;
    closeLiveConnection(live, input.reason);
    closed += 1;
  }
  // Lần nối lại phải hỏi BE ngay, không dùng kết quả đệm cũ.
  if (input.userId) deps.access.invalidateUser(input.userId);
  if (input.docId) deps.access.invalidateResource(input.kind ?? "document", input.docId);
  if (closed > 0) deps.metrics.kicksTotal.inc({ reason: input.reason }, closed);
  if (!opts.fromBus) deps.bus.publish({ op: "kick", ...(input.kind ? { kind: input.kind } : {}), ...(input.docId ? { docId: input.docId } : {}), ...(input.userId ? { userId: input.userId } : {}), ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), reason: input.reason });
  return closed;
}

/** Document đang tải dở → chờ tải xong; không có trong RAM → `undefined`. */
async function findOpenDocument(hp: Hocuspocus, documentName: string): Promise<Document | undefined> {
  const loading = hp.loadingDocuments.get(documentName);
  if (loading) await loading.catch(() => undefined);
  return hp.documents.get(documentName);
}

/**
 * Ép lưu NGAY state của document đang mở về BE (BE gọi trước khi chụp snapshot/khôi phục để state đã lưu = state đang sống).
 * Không mở trong instance này → `open: false` (không có gì để lưu).
 */
export async function flush(deps: OpsDeps, kind: ResourceKind, id: string): Promise<{ open: boolean; flushed: boolean; yjsVersion: number | null }> {
  const hp = deps.hocuspocus();
  const name = buildDocumentName(kind, id);
  const document = await findOpenDocument(hp, name);
  if (!document || document.isLoading) return { open: false, flushed: true, yjsVersion: null };
  await hp.storeDocumentHooks(
    document,
    {
      instance: hp,
      clientsCount: document.getConnectionsCount(),
      context: {},
      document,
      documentName: name,
      requestHeaders: {},
      requestParameters: new URLSearchParams(),
      // Không dùng "server": extension Redis trì hoãn `afterStoreDocument` ~1 s cho socketId đó.
      socketId: "internal-flush",
    },
    true,
  );
  const st = deps.persistence.stateOf(name);
  return { open: true, flushed: !st?.pending, yjsVersion: st?.baseVersion ?? null };
}

/**
 * Áp một Yjs update (delta khôi phục snapshot do BE tính) lên document đang mở → Hocuspocus phát cho mọi client và (origin không phải
 * kết nối) đặt lịch lưu. Không mở ở instance này → `open: false`: BE đã ghi state mới, lần mở kế tiếp sẽ tải đúng.
 */
export async function applyUpdate(deps: OpsDeps, kind: ResourceKind, id: string, update: Uint8Array): Promise<{ open: boolean; applied: boolean; connections: number }> {
  const hp = deps.hocuspocus();
  const document = await findOpenDocument(hp, buildDocumentName(kind, id));
  if (!document || document.isLoading) return { open: false, applied: false, connections: 0 };
  Y.applyUpdate(document, update, "internal-apply");
  document.broadcastStateless(encodeNotice("RESTORED"));
  return { open: true, applied: true, connections: document.getConnectionsCount() };
}

export function stats(deps: OpsDeps): { connections: Record<string, number>; documents: Record<string, number>; pendingStates: number } {
  const counts = countByKind(deps.hocuspocus());
  return { connections: counts.connections, documents: counts.documents, pendingStates: deps.persistence.pendingCount() };
}
