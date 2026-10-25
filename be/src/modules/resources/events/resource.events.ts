import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { Folder } from "../entities/folder.interface";
import type { Resource } from "../entities/resource.interface";

/** Job consumer duy nhất của sự kiện kho tài liệu (queue `notifications`) — cặp queue/jobName chỉ có 1 processor. */
export const RESOURCE_EVENTS_QUEUE = "notifications" as const;
export const RESOURCE_EVENTS_JOB = "resource.events";

export type ResourceChangeKind = "FOLDER" | "RESOURCE";
export type ResourceChangeAction = "CREATED" | "UPDATED" | "DELETED" | "PURGED";
export type ResourceChange = "META" | "MOVED" | "RESTORED";

/**
 * Payload outbox `resource.*`/`folder.*` — KHÔNG có tên tệp/thư mục (chỉ id + số liệu), dùng cho socket
 * `resource:changed` (consumer `resource.events`) và các consumer về sau (`p5-04` tìm kiếm, `p7-05` quét trùng).
 */
export interface ResourceEventPayload {
  kind: ResourceChangeKind;
  action: ResourceChangeAction;
  workspaceId: string;
  /** Thư mục CHỨA mục bị đổi (danh sách cần làm mới) — tệp: `folderId`; thư mục: `parentId`; `null` = gốc. */
  folderId: string | null;
  resourceId?: string;
  /** Chỉ kind FOLDER: id thư mục bị đổi. */
  subjectId?: string;
  version: number;
  change?: ResourceChange;
  /** Sự kiện phát sinh từ xoá/khôi phục CẢ thư mục — consumer không phát socket riêng (sự kiện thư mục đã bao). */
  via?: "FOLDER";
  type?: string;
  size?: number;
}

const ACTION_TYPE: Record<ResourceChangeAction, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  PURGED: "purged",
};

function base(
  kind: "resource" | "folder",
  action: ResourceChangeAction,
  aggregateType: string,
  id: string,
  version: number,
  payload: ResourceEventPayload
): OutboxEventInput {
  const name = `${kind}.${ACTION_TYPE[action]}`;
  return {
    type: name,
    aggregateType,
    aggregateId: id,
    queue: RESOURCE_EVENTS_QUEUE,
    jobName: RESOURCE_EVENTS_JOB,
    // `jobId` = dedupeKey (relay tự `:` → `_`); kèm version nên xoá → khôi phục → xoá lại vẫn là sự kiện riêng.
    dedupeKey: `${name}:${kind}:${id}:v${version}`,
    payload: payload as unknown as Record<string, unknown>,
  };
}

export function resourceEvent(
  action: ResourceChangeAction,
  r: Pick<Resource, "id" | "workspaceId" | "folderId" | "version" | "type" | "size">,
  extra: { change?: ResourceChange; via?: "FOLDER" } = {}
): OutboxEventInput {
  return base("resource", action, "Resource", r.id, r.version, {
    kind: "RESOURCE",
    action,
    workspaceId: r.workspaceId,
    folderId: r.folderId,
    resourceId: r.id,
    version: r.version,
    type: r.type,
    size: r.size,
    ...extra,
  });
}

/** Tệp bị đổi hàng loạt (xoá/khôi phục cả thư mục) — chỉ có id/version, không đọc lại từng tệp. */
export function bulkResourceEvent(
  action: ResourceChangeAction,
  workspaceId: string,
  r: { id: string; folderId: string | null; version: number },
  extra: { change?: ResourceChange } = {}
): OutboxEventInput {
  return base("resource", action, "Resource", r.id, r.version, {
    kind: "RESOURCE",
    action,
    workspaceId,
    folderId: r.folderId,
    resourceId: r.id,
    version: r.version,
    via: "FOLDER",
    ...extra,
  });
}

export function folderEvent(
  action: ResourceChangeAction,
  f: Pick<Folder, "id" | "workspaceId" | "parentId" | "version">,
  extra: { change?: ResourceChange } = {}
): OutboxEventInput {
  return base("folder", action, "Folder", f.id, f.version, {
    kind: "FOLDER",
    action,
    workspaceId: f.workspaceId,
    folderId: f.parentId,
    subjectId: f.id,
    version: f.version,
    ...extra,
  });
}
