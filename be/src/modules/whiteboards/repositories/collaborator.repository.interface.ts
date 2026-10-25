import type { CollaboratorEntity, CollaboratorRoleValue } from "../entities/whiteboard.interface";
import type { TxHandle } from "./tx";

export interface ICollaboratorRepository {
  list(whiteboardId: string): Promise<CollaboratorEntity[]>;
  find(whiteboardId: string, userId: string): Promise<CollaboratorEntity | null>;
  count(whiteboardId: string): Promise<number>;
  /** Thêm mới hoặc đổi vai trò. `addedUserIds` = người MỚI vào (không tính người chỉ đổi vai). */
  upsertMany(
    whiteboardId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }>;
  remove(whiteboardId: string, userId: string, tx: TxHandle): Promise<boolean>;
  /** Bảng mà người này được mời (mọi workspace) — dùng dựng danh sách bảng PRIVATE/khách. */
  whiteboardIdsOfUser(userId: string): Promise<string[]>;
  userIdsOfWhiteboard(whiteboardId: string): Promise<string[]>;
  /** Vai trò của một người trên một tập bảng (danh sách tính `myRole` không N+1). */
  rolesOfUser(userId: string, whiteboardIds: string[]): Promise<Map<string, CollaboratorRoleValue>>;
}
