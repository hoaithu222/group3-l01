import type { CollaboratorEntity, CollaboratorRoleValue } from "../entities/document.interface";
import type { TxHandle } from "./tx";

export interface ICollaboratorRepository {
  list(documentId: string): Promise<CollaboratorEntity[]>;
  find(documentId: string, userId: string): Promise<CollaboratorEntity | null>;
  count(documentId: string): Promise<number>;
  /** Thêm mới hoặc đổi vai trò. `addedUserIds` = người MỚI vào (không tính người chỉ đổi vai) — để gửi thông báo đúng người. */
  upsertMany(
    documentId: string,
    rows: Array<{ userId: string; role: CollaboratorRoleValue }>,
    addedBy: string,
    tx: TxHandle
  ): Promise<{ addedUserIds: string[]; changedUserIds: string[] }>;
  remove(documentId: string, userId: string, tx: TxHandle): Promise<boolean>;
  /** Tài liệu mà người này được mời (mọi workspace) — dùng dựng danh sách tài liệu PRIVATE/khách. */
  documentIdsOfUser(userId: string): Promise<string[]>;
  userIdsOfDocument(documentId: string): Promise<string[]>;
  /** Vai trò của một người trên một tập tài liệu (danh sách tài liệu tính `myRole` không N+1). */
  rolesOfUser(userId: string, documentIds: string[]): Promise<Map<string, CollaboratorRoleValue>>;
}
