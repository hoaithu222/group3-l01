import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket";
import type { ICollaboratorRepository } from "../repositories/collaborator.repository.interface";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { WhiteboardEventPayload } from "./whiteboard-events";

/**
 * Consumer outbox `whiteboard.events` (queue `notifications`): phát `whiteboard:updated` `{ id, workspaceId, name, visibility, status, thumbnailAssetId, version }`
 * TỚI TỪNG NGƯỜI (`user:{id}`), không vào room `ws:{id}` — vì khán giả tính theo trạng thái HIỆN TẠI của bảng:
 *   WORKSPACE → mọi thành viên MEMBER+ (khách không được biết, trừ khi là cộng tác viên) + người tạo + cộng tác viên;
 *   PRIVATE   → CHỈ người tạo + cộng tác viên (quản trị nhóm không tự thấy).
 * Nội dung vẽ không đi qua socket (chỉ metadata). Emit lặp vô hại (client so `version`).
 */
export class WhiteboardEventsPublisher {
  constructor(
    private readonly whiteboards: Pick<IWhiteboardRepository, "findById">,
    private readonly collaborators: Pick<ICollaboratorRepository, "userIdsOfWhiteboard">,
    private readonly directory: Pick<IWhiteboardDirectory, "activeMemberIds">,
    private readonly emit: (userIds: string[], event: string, payload: object) => void = (ids, event, payload) => emitToUsers(ids, event, payload)
  ) {}

  async publish(payload: WhiteboardEventPayload): Promise<string[]> {
    const board = await this.whiteboards.findById(payload.whiteboardId);
    if (!board) return [];
    const audience = new Set<string>([board.createdBy, ...(await this.collaborators.userIdsOfWhiteboard(board.id))]);
    if (board.visibility === "WORKSPACE") for (const id of await this.directory.activeMemberIds(board.workspaceId)) audience.add(id);
    const userIds = [...audience];
    this.emit(userIds, SocketEvent.WHITEBOARD_UPDATED, {
      id: board.id,
      workspaceId: board.workspaceId,
      name: board.name,
      visibility: board.visibility,
      status: board.status,
      thumbnailAssetId: board.thumbnailAssetId,
      version: board.version,
    });
    return userIds;
  }
}
