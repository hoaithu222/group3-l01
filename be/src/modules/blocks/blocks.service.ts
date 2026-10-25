import { withTransaction } from "../../infrastructure/database";
import { outbox } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { AppError, NotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { LIMITS } from "../../core/constants/limits";
import { encodeCursor, decodeCursor } from "../../core/utils/cursor";
import { getConversationHooks, type ConversationHooks } from "../../core/permission";
import type { BlockPort } from "../../shared/ports/block.port";
import { avatarUrlOf } from "../../shared/media";
import { isBlockDuplicateError, type IBlocksRepo, type UserBlockEntity } from "./blocks.repo";
import type { ListBlocksQueryDto } from "./blocks.validators";

export interface BlockResult {
  userId: string;
  blockedAt: Date;
  /** `true` nếu đã chặn từ trước (idempotent) — controller chọn 200 thay vì 201. */
  alreadyBlocked: boolean;
}

export interface BlockedUserItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  blockedAt: Date;
}

export interface BlockedListResult {
  data: BlockedUserItem[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number; allIds: string[] };
}

/**
 * `POST/DELETE/GET /me/blocks` (be.md p1-08 §4/§5.7). Chặn là một chiều về DỮ LIỆU
 * (`UserBlock(blocker → blocked)`) nhưng hiệu ứng nhắn 1-1/presence/gọi áp CẢ HAI
 * hướng (README §2) — nằm ở nơi tiêu thụ `BlockPort`, KHÔNG ở đây. Người bị chặn
 * KHÔNG được thông báo gì (không socket, không hộp thư).
 */
export class BlocksService {
  constructor(
    private readonly repo: IBlocksRepo,
    private readonly blockPort: BlockPort,
    private readonly getHooks: () => ConversationHooks | null = getConversationHooks
  ) {}

  async block(actorId: string, targetId: string): Promise<BlockResult> {
    if (actorId === targetId) {
      throw new AppError(ErrorMessages[ErrorCode.BLOCK_001], 400, ErrorCode.BLOCK_001);
    }

    const existing = await this.repo.find(actorId, targetId);
    if (existing) return toResult(existing, true);

    if (!(await this.repo.userExists(targetId))) throw new NotFoundError("Không tìm thấy người dùng");
    if ((await this.repo.count(actorId)) >= LIMITS.block.max) {
      throw new AppError(ErrorMessages[ErrorCode.BLOCK_004], 409, ErrorCode.BLOCK_004);
    }

    let created: UserBlockEntity;
    try {
      created = await withTransaction(async (tx) => {
        const row = await this.repo.create(tx, actorId, targetId);
        await outbox.add(tx, {
          type: "user.blocked",
          aggregateType: "User",
          aggregateId: actorId,
          queue: "notifications",
          jobName: "block.events",
          dedupeKey: `user.blocked:${row.id}`,
          payload: { event: "blocked", blockerId: actorId, blockedId: targetId },
        });
        return row;
      });
    } catch (err) {
      // 2 request chặn cùng lúc: transaction thua đã abort — đọc lại NGOÀI transaction, không tiếp tục trên `tx` cũ.
      if (isBlockDuplicateError(err)) {
        const raced = await this.repo.find(actorId, targetId);
        if (raced) return toResult(raced, true);
      }
      throw err;
    }

    await this.afterChange(actorId, targetId);
    return toResult(created, false);
  }

  /** Idempotent — chưa chặn thì không làm gì. */
  async unblock(actorId: string, targetId: string): Promise<void> {
    const existing = await this.repo.find(actorId, targetId);
    if (!existing) return;

    const removed = await withTransaction(async (tx) => {
      const count = await this.repo.deletePair(tx, actorId, targetId);
      if (count > 0) {
        await outbox.add(tx, {
          type: "user.unblocked",
          aggregateType: "User",
          aggregateId: actorId,
          queue: "notifications",
          jobName: "block.events",
          dedupeKey: `user.unblocked:${existing.id}`,
          payload: { event: "unblocked", blockerId: actorId, blockedId: targetId },
        });
      }
      return count;
    });
    if (removed > 0) await this.afterChange(actorId, targetId);
  }

  async list(actorId: string, query: ListBlocksQueryDto): Promise<BlockedListResult> {
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const [rows, allIds] = await Promise.all([
      this.repo.listByBlocker({ blockerId: actorId, cursor: decoded, limit: query.limit + 1 }),
      this.repo.listBlockedIds(actorId, LIMITS.block.max),
    ]);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    const users = await this.repo.findUsers(page.map((r) => r.blockedId));
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      data: page.map((r) => ({
        userId: r.blockedId,
        name: userById.get(r.blockedId)?.name ?? "",
        avatarUrl: avatarUrlOf(userById.get(r.blockedId)?.avatarAssetId),
        blockedAt: r.createdAt,
      })),
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
        hasMore,
        limit: query.limit,
        allIds,
      },
    };
  }

  /**
   * SAU commit: xoá cache `BlockPort` cả hai phía + báo `ConversationHooks.onUserBlocked`
   * (xoá cache eligibility DIRECT, bump version quyền hội thoại, phát `conversation:updated
   * {readOnly}`) ĐỒNG BỘ để 1-1 khoá/mở ngay khi response về (BLOCK-01). Lỗi ở đây chỉ log —
   * giao dịch chặn đã commit, `eligibility` đọc DB nên vẫn đúng khi cache tự hết hạn.
   */
  private async afterChange(blockerId: string, blockedId: string): Promise<void> {
    await this.blockPort.invalidate([blockerId, blockedId]);
    const hooks = this.getHooks();
    if (!hooks) return;
    try {
      await hooks.onUserBlocked(blockerId, blockedId);
    } catch (err) {
      logger.warn("[blocks] ConversationHooks.onUserBlocked lỗi — bỏ qua", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function toResult(row: UserBlockEntity, alreadyBlocked: boolean): BlockResult {
  return { userId: row.blockedId, blockedAt: row.createdAt, alreadyBlocked };
}
