import type { ContributionConfigValue } from "../../../core/constants/contribution";
import type { BoardRef, BoardState } from "../entities/contribution.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import { parseBoardContribution } from "./contribution-config.schema";
import type { IContribConfigPort } from "./contribution.ports";

/** Mọi thứ cần để tính/hiển thị báo cáo của MỘT bảng: state, công thức hiệu lực, múi giờ. */
export interface BoardContext {
  board: BoardRef;
  state: BoardState;
  config: ContributionConfigValue;
  timezone: string;
}

/**
 * Công thức hiệu lực của bảng: `Board.contribution` (do OWNER/ADMIN đặt) → nếu trống/hỏng thì mặc định nền tảng ĐÃ ĐÓNG BĂNG trong state
 * (`defaultsSnapshot`, chụp lúc bảng có state đầu tiên) → cuối cùng mặc định hiện hành. Nhờ đóng băng, admin đổi `pm.contribution`
 * không làm điểm của các bảng đang chạy đổi âm thầm (D-09: mọi thay đổi trọng số phải nhìn thấy được).
 */
export function resolveEffectiveConfig(boardContribution: unknown, state: BoardState | null, defaults: ContributionConfigValue): ContributionConfigValue {
  const frozen = state?.defaultsSnapshot ? parseBoardContribution(state.defaultsSnapshot, defaults) : defaults;
  return parseBoardContribution(boardContribution, frozen);
}

export class ContributionContextLoader {
  constructor(
    private readonly states: IContributionStateRepository,
    private readonly config: IContribConfigPort
  ) {}

  /** Tạo state nếu chưa có (đóng băng mặc định lúc này) rồi dựng ngữ cảnh. */
  async load(board: BoardRef): Promise<BoardContext> {
    const defaults = await this.config.defaults();
    const [state, timezone] = await Promise.all([this.states.ensure(board.id, board.workspaceId, defaults), this.config.timezone(board.workspaceId)]);
    return { board, state, config: resolveEffectiveConfig(board.contribution, state, defaults), timezone };
  }
}
