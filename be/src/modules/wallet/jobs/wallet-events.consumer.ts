import { registerJob } from "../../../infrastructure/queue";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket";
import { getWalletContainer } from "../wallet.container";

interface WalletEventPayload {
  workspaceId: string;
  walletVersion: number;
  changedUserIds: string[];
  reason: "EXPENSE" | "SETTLEMENT" | "SETTINGS";
}

/**
 * `wallet.events` (queue `notifications`) — relay outbox → socket `wallet:updated`, KHÔNG kèm số tiền.
 * Gửi tới từng thành viên MEMBER+ (room `user:{id}`) thay vì room `ws:{id}` để GUEST không nhận được dù chỉ là tín hiệu.
 * Emit lặp vô hại (client so `walletVersion` với cache).
 */
registerJob("notifications", "wallet.events", async (job) => {
  const payload = job.data as WalletEventPayload;
  const memberIds = await getWalletContainer().directory.listWalletMemberIds(payload.workspaceId);
  emitToUsers(memberIds, SocketEvent.WALLET_UPDATED, {
    workspaceId: payload.workspaceId,
    walletVersion: payload.walletVersion,
    changedUserIds: payload.changedUserIds,
    reason: payload.reason,
  });
});
