import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { IProjectsUnitOfWork, TxContext } from "../repositories/unit-of-work";
import type { KeyedMutex } from "./keyed-mutex";

/** Mỗi vòng `withTransaction` đã tự retry 5 lần; thêm vài vòng ở đây cho tranh chấp nặng giữa nhiều instance. */
const CONFLICT_ROUNDS = 4;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Lỗi write-conflict/transient của Mongo qua Prisma (`P2034`) — nhận diện bằng duck-typing để service không import Prisma. */
function isWriteConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (err as { code?: string }).code === "P2034" || /write conflict|WriteConflict|TransientTransactionError/i.test(err.message);
}

/**
 * Mọi thao tác GHI làm thay đổi thứ tự/số lượng thẻ của một bảng (tạo thẻ, kéo thẻ, rebalance, đổi cột) chạy qua đây:
 *  1. hàng đợi trong tiến trình theo `boardId` (giảm tranh chấp — PM2-12: 20 request đồng thời);
 *  2. transaction bắt đầu bằng `touch(board)` ⇒ hai transaction (kể cả khác instance) ghi CÙNG tài liệu `Board`
 *     nên bên sau bị write-conflict và `withTransaction` chạy lại trên dữ liệu đã commit ⇒ khoá vị trí tính từ
 *     hàng xóm thật, không bao giờ trùng nhau;
 *  3. tranh chấp kéo dài giữa nhiều instance vượt số lần thử → `503 SYS_503` (client thử lại), KHÔNG để lộ 500.
 * Bảng không còn → `PERM_404`.
 */
export class BoardWriteRunner {
  constructor(
    private readonly uow: IProjectsUnitOfWork,
    private readonly boards: IBoardRepository,
    private readonly mutex: KeyedMutex
  ) {}

  run<T>(boardId: string, fn: (tx: TxContext) => Promise<T>): Promise<T> {
    return this.mutex.run(boardId, async () => {
      for (let round = 1; ; round++) {
        try {
          return await this.uow.run(async (tx) => {
            if (!(await this.boards.touch(boardId, tx))) throw new ScopeNotFoundError();
            return fn(tx);
          });
        } catch (err) {
          if (!isWriteConflict(err)) throw err;
          if (round >= CONFLICT_ROUNDS) {
            throw new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503, { retryable: true });
          }
          await sleep(25 * round + Math.floor(Math.random() * 40));
        }
      }
    });
  }
}
