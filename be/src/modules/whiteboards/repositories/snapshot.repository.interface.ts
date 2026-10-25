import type { SnapshotKindValue, SnapshotMeta, SnapshotWithState } from "../entities/whiteboard.interface";
import type { TxHandle } from "./tx";

export interface NewSnapshot {
  whiteboardId: string;
  kind: SnapshotKindValue;
  label: string | null;
  yjsState: Uint8Array;
  elementCount: number;
  createdBy: string | null;
}

export interface SnapshotListParams {
  whiteboardId: string;
  kind?: SnapshotKindValue;
  cursor?: { at: Date; id: string } | null;
  limit: number;
}

export interface ISnapshotRepository {
  create(data: NewSnapshot, tx?: TxHandle): Promise<SnapshotMeta>;
  /** Tối đa `limit + 1` dòng, mới nhất trước. KHÔNG kèm `yjsState`. */
  list(params: SnapshotListParams): Promise<SnapshotMeta[]>;
  findWithState(whiteboardId: string, snapshotId: string): Promise<SnapshotWithState | null>;
  countByKind(whiteboardId: string, kind: SnapshotKindValue): Promise<number>;
  latestOfKind(whiteboardId: string, kind: SnapshotKindValue): Promise<SnapshotMeta | null>;
  /** Xoá các bản cũ hơn `keep` bản MỚI NHẤT của `kind`; trả số bản đã xoá. */
  pruneKeepNewest(whiteboardId: string, kind: SnapshotKindValue, keep: number, tx?: TxHandle): Promise<number>;
}
