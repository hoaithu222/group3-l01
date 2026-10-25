import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { BlockPort } from "../../../shared/ports/block.port";
import { getBlockPort } from "../../blocks/public";

/**
 * p1-08 README §2 "Thêm vào nhóm chat" — người THÊM bị target chặn → `BLOCK_003` (403, thông
 * điệp trung tính, KHÔNG nêu ai chặn/không kèm `details`); ngược lại (người thêm đã chặn target)
 * vẫn được thêm ("A chủ động"). Áp dụng cho tạo nhóm mới lẫn thêm thành viên vào nhóm đang có.
 */
export async function assertNotBlockedByAny(
  actorId: string,
  candidateIds: string[],
  blockPort: BlockPort = getBlockPort()
): Promise<void> {
  if (candidateIds.length === 0) return;
  const blockers = new Set(await blockPort.blockerIdsOf(actorId));
  if (candidateIds.some((id) => blockers.has(id))) {
    throw new AppError(ErrorMessages[ErrorCode.BLOCK_003], 403, ErrorCode.BLOCK_003);
  }
}
