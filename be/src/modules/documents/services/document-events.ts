import type { DocumentEntity } from "../entities/document.interface";
import type { IOutboxPort, TxHandle } from "../repositories/tx";

/**
 * Tên job của module (queue kèm theo). `document.plaintext` ở queue `reports` (nặng, không chặn thông báo), còn lại ở `notifications`.
 * Cron chụp AUTO KHÔNG còn ở đây: dùng chung `collab.snapshot-hourly` (`shared/collab/collab-snapshot-runners.ts`, p6-02).
 */
export const DOCUMENT_JOBS = {
  events: { queue: "notifications", name: "document.events" },
  plaintext: { queue: "reports", name: "document.plaintext" },
  accessRevoked: { queue: "notifications", name: "document.access-revoked" },
} as const;

/** Chờ 5 s (kể từ lúc relay đẩy) rồi mới trích văn bản: trong lúc người dùng gõ liên tục, các version cũ bị bỏ (processor kiểm version) nên chỉ bản cuối tốn CPU. */
export const PLAINTEXT_DELAY_MS = 5000;

export interface DocumentEventPayload {
  documentId: string;
  version: number;
}

export interface PlaintextPayload {
  documentId: string;
  yjsVersion: number;
}

export type KickReason = "revoked" | "archived" | "forbidden";

/** Yêu cầu đóng kết nối collab: theo tài liệu (mọi người / một số người) hoặc theo workspace (mọi tài liệu của nhóm) cho `userIds`. */
export interface AccessRevokedPayload {
  documentId?: string;
  workspaceId?: string;
  userIds?: string[];
  reason: KickReason;
}

/** Ghi sự kiện `document:updated` (socket) — consumer tính khán giả theo trạng thái HIỆN TẠI nên không lộ tài liệu PRIVATE cho ai khác. */
/** `discriminator` (tuỳ chọn) làm khoá dedupe duy nhất khi sự kiện KHÔNG đổi `version` metadata (đổi người cộng tác) — trùng khoá làm vỡ transaction (unique index). */
export function writeDocumentUpdated(outbox: IOutboxPort, tx: TxHandle, doc: Pick<DocumentEntity, "id" | "version">, discriminator?: string): Promise<void> {
  return outbox.add(tx, {
    type: "document.updated",
    aggregateType: "Document",
    aggregateId: doc.id,
    queue: DOCUMENT_JOBS.events.queue,
    jobName: DOCUMENT_JOBS.events.name,
    dedupeKey: `document.updated:${doc.id}:v${doc.version}${discriminator ? `:${discriminator}` : ""}`,
    payload: { documentId: doc.id, version: doc.version } satisfies DocumentEventPayload,
  });
}

export function writePlaintextJob(outbox: IOutboxPort, tx: TxHandle, documentId: string, yjsVersion: number): Promise<void> {
  return outbox.add(tx, {
    type: "document.saved",
    aggregateType: "Document",
    aggregateId: documentId,
    queue: DOCUMENT_JOBS.plaintext.queue,
    jobName: DOCUMENT_JOBS.plaintext.name,
    dedupeKey: `document.plaintext:document:${documentId}:${yjsVersion}`,
    delayMs: PLAINTEXT_DELAY_MS,
    payload: { documentId, yjsVersion } satisfies PlaintextPayload,
  });
}

/** `discriminator` làm dedupeKey duy nhất theo sự kiện (vd `archived:v5`). */
export function writeAccessRevoked(outbox: IOutboxPort, tx: TxHandle, payload: AccessRevokedPayload, discriminator: string): Promise<void> {
  const target = payload.documentId ?? payload.workspaceId ?? "-";
  return outbox.add(tx, {
    type: "document.access-revoked",
    aggregateType: "Document",
    aggregateId: target,
    queue: DOCUMENT_JOBS.accessRevoked.queue,
    jobName: DOCUMENT_JOBS.accessRevoked.name,
    dedupeKey: `document.access-revoked:${target}:${discriminator}`,
    payload: { ...payload },
  });
}
