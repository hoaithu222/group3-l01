import { AppError, VersionConflictError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { CONTRIBUTION_WEIGHT_TOTAL, type ContributionConfigValue, type ContributionWeights } from "../../../core/constants/contribution";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { BoardState } from "../entities/contribution.interface";
import type { IBoardContributionWriter, IContributionDirectory } from "../repositories/contribution-directory.repository.interface";
import type { IContributionStateRepository } from "../repositories/contribution-state.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import type { ContributionAccess } from "./contribution-access";
import type { ContributionContextLoader } from "./contribution-context";
import { weightsTotal, type PutContributionConfigDto } from "./contribution-config.schema";
import { formulaDto, type ContributionFormulaDto } from "./contribution.presenter";
import type { IContribAudit, IContribEmitter, IContribQueue } from "./contribution.ports";

export interface ContributionConfigDto {
  weights: ContributionWeights;
  onTimeGraceHours: number;
  unestimatedPoints: number;
  /** `expectedVersion` của lần `PUT` kế tiếp (CAS theo phiên bản cấu hình riêng, không phải `Board.version`). */
  version: number;
  changedAt: string | null;
  changedBy: { id: string; name: string } | null;
  previousWeights: ContributionWeights | null;
  /** `true` khi bảng CHƯA được tuỳ chỉnh (đang theo mặc định nền tảng đã đóng băng). */
  isDefault: boolean;
  definitions: ContributionFormulaDto["definitions"];
}

export interface ContributionConfigDeps {
  access: ContributionAccess;
  context: ContributionContextLoader;
  states: IContributionStateRepository;
  directory: IContributionDirectory;
  writer: IBoardContributionWriter;
  tx: ITxRunner;
  audit: IContribAudit;
  queue: IContribQueue;
  emitter: IContribEmitter;
  now?: () => Date;
}

/**
 * Cấu hình trọng số của MỘT bảng (p4-06 be.md §5.5) — OWNER/ADMIN đặt, mọi vai trò khác chỉ đọc, KHÔNG có trường theo người. Đổi công thức:
 * CAS `configVersion` + `Board.contribution` trong MỘT transaction → audit `board.contribution-config` (trước/sau, KHÔNG có số liệu thành viên)
 * → tính lại NGAY (không debounce) → `board:updated`. Báo cáo luôn hiện "trọng số đổi lúc… bởi… (trước: 60/20/20)".
 */
export class ContributionConfigService {
  private readonly now: () => Date;

  constructor(private readonly d: ContributionConfigDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async get(user: AuthUser, boardId: string): Promise<ContributionConfigDto> {
    const board = await this.d.access.readBoard(user, boardId);
    const ctx = await this.d.context.load(board);
    return this.toDto(ctx.board.workspaceId, ctx.state, ctx.config, ctx.board.contribution === null || ctx.board.contribution === undefined);
  }

  async put(user: AuthUser, boardId: string, dto: PutContributionConfigDto): Promise<ContributionConfigDto> {
    const board = await this.d.access.editBoard(user, boardId);
    if (weightsTotal(dto.weights) !== CONTRIBUTION_WEIGHT_TOTAL) {
      throw new AppError(ErrorMessages[ErrorCode.CONTRIB_002], HttpStatusCode.BAD_REQUEST, ErrorCode.CONTRIB_002, { total: weightsTotal(dto.weights), expected: CONTRIBUTION_WEIGHT_TOTAL });
    }
    const ctx = await this.d.context.load(board);
    const before = ctx.config;
    const after: ContributionConfigValue = {
      weights: { ...dto.weights },
      onTimeGraceHours: dto.onTimeGraceHours ?? before.onTimeGraceHours,
      unestimatedPoints: dto.unestimatedPoints ?? before.unestimatedPoints,
    };
    const at = this.now();

    const applied = await this.d.tx.run(async (tx) => {
      const ok = await this.d.states.changeConfig(boardId, dto.expectedVersion, { at, by: user.id, previousWeights: before.weights }, tx);
      if (!ok) return false;
      await this.d.writer.setContribution(boardId, after, tx);
      return true;
    });
    if (!applied) throw new VersionConflictError((await this.d.states.get(boardId))?.configVersion ?? ctx.state.configVersion);

    const state = (await this.d.states.get(boardId)) as BoardState;
    await this.d.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: "board.contribution-config",
      targetType: "Board",
      targetId: boardId,
      workspaceId: board.workspaceId,
      metadata: { before, after, version: state.configVersion },
    });
    // Tính lại NGAY (jobId theo phiên bản cấu hình, không trùng với job debounce của fact). Lỗi xếp job chỉ log: báo cáo tự tính tại chỗ khi công thức mới hơn snapshot.
    await this.d.queue.enqueueRecompute(boardId, `contribution.recompute:board:${boardId}:c${state.configVersion}`, 0).catch((err: unknown) => {
      logger.warn("[contribution] không xếp được job tính lại sau khi đổi công thức", { boardId, error: err instanceof Error ? err.message : String(err) });
    });
    this.d.emitter.contributionChanged(boardId, board.version);
    return this.toDto(board.workspaceId, state, after, false);
  }

  private async toDto(workspaceId: string, state: BoardState, config: ContributionConfigValue, isDefault: boolean): Promise<ContributionConfigDto> {
    const users = state.configChangedBy ? await this.d.directory.getUsers(workspaceId, [state.configChangedBy]) : new Map();
    const formula = formulaDto(state, config, users);
    return {
      weights: config.weights,
      onTimeGraceHours: config.onTimeGraceHours,
      unestimatedPoints: config.unestimatedPoints,
      version: state.configVersion,
      changedAt: formula.changedAt,
      changedBy: formula.changedBy,
      previousWeights: formula.previousWeights,
      isDefault,
      definitions: formula.definitions,
    };
  }
}
