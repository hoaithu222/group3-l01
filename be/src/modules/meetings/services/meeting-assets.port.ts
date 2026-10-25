import type { TxHandle } from "../repositories/tx";

/** Đích gắn tệp của p2-06 (`AssetLinkTarget`): đính kèm biên bản và tệp ghi hình. */
export type MeetingAssetTarget = "MEETING_RECAP" | "MEETING_RECORDING";

export interface MeetingAssetInfo {
  id: string;
  ownerId: string;
  /** `AssetScope` — đính kèm biên bản chỉ nhận `MEETING`; tệp ghi hình là `RECORDING`. */
  scope: string;
  status: string;
  workspaceId: string | null;
  originalName: string;
  mime: string;
  size: number | null;
}

export interface RegisterRecordingAssetInput {
  ownerId: string;
  workspaceId: string;
  fileName: string;
  storageKey: string;
  size: number;
  durationMs?: number;
}

/**
 * Cổng của `meetings` sang module `assets` (`@modules/assets/public`) — đính kèm biên bản đi qua luồng asset chuẩn p0-05 (`POST /assets` → `READY` → gắn
 * `AssetLink MEETING_RECAP`), tệp ghi hình đăng ký từ object egress đã có trên S3. Mọi ghi nhận `tx` của caller (cùng transaction với thay đổi nghiệp vụ).
 * Test thay bản giả; bản thật ở `adapters/meeting-assets.adapter.ts`.
 */
export interface MeetingAssetsPort {
  getMany(assetIds: string[]): Promise<MeetingAssetInfo[]>;
  /** Asset đang gắn vào đích (thứ tự tạo). */
  linkedAssetIds(target: MeetingAssetTarget, targetId: string): Promise<string[]>;
  /** Gắn asset READY của CHÍNH `actorId` vào đích (idempotent theo `(asset, target, targetId)`); scope link = `MEETING`. */
  attach(tx: TxHandle, i: { assetId: string; target: MeetingAssetTarget; targetId: string; meetingId: string; actorId: string }): Promise<void>;
  detach(tx: TxHandle, i: { assetId: string; target: MeetingAssetTarget; targetId: string }): Promise<void>;
  /** Đăng ký object ĐÃ CÓ trên storage (scope `RECORDING`, kind VIDEO, `video/mp4`) thành asset READY. */
  registerRecording(tx: TxHandle, i: RegisterRecordingAssetInput): Promise<{ assetId: string }>;
  /** Đánh dấu asset (và bản con) `DELETED` — không ai đọc được nữa. */
  markDeleted(tx: TxHandle, assetId: string): Promise<void>;
}
