import { permissionService } from "../../../core/permission";
import { AppError, ConflictError, NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { CreateLabelDto, UpdateLabelDto } from "../dtos";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { IProjectDirectory } from "../repositories/project-directory.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import { toLabelDto, type LabelDto } from "./board.presenter";
import type { ProjectAccess } from "./project-access";
import { presentTaskCards } from "./task.presenter";

/** Số thẻ tối đa phát `task:updated` khi xoá nhãn đang dùng; vượt ngưỡng chỉ dựa vào `board:updated.labelsChanged`. */
const TASK_UPDATE_FANOUT_MAX = 100;

const duplicateNameError = (): ConflictError => new ConflictError("Nhãn cùng tên đã tồn tại trên bảng này");

export class LabelService {
  constructor(
    private readonly labels: ILabelRepository,
    private readonly tasks: ITaskRepository,
    private readonly directory: IProjectDirectory,
    private readonly access: ProjectAccess,
    private readonly emitter: IBoardEmitter
  ) {}

  async list(user: AuthUser, boardId: string): Promise<LabelDto[]> {
    await this.access.board(user, boardId, "workspace.board.read");
    return (await this.labels.listByBoard(boardId)).map(toLabelDto);
  }

  async create(user: AuthUser, boardId: string, dto: CreateLabelDto): Promise<LabelDto> {
    const { board } = await this.access.board(user, boardId, "workspace.task.update");
    if ((await this.labels.countByBoard(boardId)) >= LIMITS.board.labelsMax) {
      throw new AppError(ErrorMessages[ErrorCode.TASK_011], 409, ErrorCode.TASK_011);
    }
    const normalizedName = normalizeSearch(dto.name);
    // Kiểm trước cho rõ ràng; đua đồng thời do unique `(boardId, normalizedName)` chặn (create trả null).
    if (await this.labels.findByName(boardId, normalizedName)) throw duplicateNameError();
    const created = await this.labels.create({
      boardId,
      workspaceId: board.workspaceId,
      name: dto.name,
      normalizedName,
      color: dto.color,
    });
    if (!created) throw duplicateNameError();
    this.emitter.boardUpdated(boardId, { boardId, version: board.version, labelsChanged: true });
    return toLabelDto(created);
  }

  async update(user: AuthUser, labelId: string, dto: UpdateLabelDto): Promise<LabelDto> {
    const { label, board } = await this.access.label(user, labelId, "workspace.task.update");
    if (dto.name !== undefined) {
      const clash = await this.labels.findByName(label.boardId, normalizeSearch(dto.name));
      if (clash && clash.id !== label.id) throw duplicateNameError();
    }
    const updated = await this.labels.update(labelId, {
      ...(dto.name !== undefined && { name: dto.name, normalizedName: normalizeSearch(dto.name) }),
      ...(dto.color !== undefined && { color: dto.color }),
    });
    if (!updated) {
      // `update` trả null khi đổi tên trùng nhãn khác (unique) hoặc nhãn vừa bị xoá.
      if (await this.labels.findById(label.id)) throw duplicateNameError();
      throw new NotFoundError("Không tìm thấy nhãn");
    }
    this.emitter.boardUpdated(board.id, { boardId: board.id, version: board.version, labelsChanged: true });
    return toLabelDto(updated);
  }

  /**
   * Xoá nhãn: MEMBER được xoá khi nhãn CHƯA dùng trên thẻ ĐANG SỐNG; có thẻ sống dùng thì cần `workspace.board.edit` (OWNER/ADMIN).
   * Gỡ `labelIds` khỏi mọi thẻ của bảng (kể cả thẻ đã xoá mềm) rồi phát `task:updated` cho các thẻ sống bị ảnh hưởng.
   */
  async remove(user: AuthUser, labelId: string): Promise<void> {
    const { label, board } = await this.access.label(user, labelId, "workspace.task.update");
    // Quyền chỉ xét thẻ SỐNG (quy tắc cũ giữ nguyên): nhãn chỉ còn trên thẻ trong thùng rác coi như CHƯA dùng.
    const inUse = await this.tasks.countWithLabel(label.boardId, label.id);
    if (inUse > 0) await permissionService.assert(user, "workspace.board.edit", { type: "BOARD", id: board.id });

    // ⚠️ Gỡ LUÔN, kể cả khi `inUse === 0`: thẻ đã xoá mềm vẫn giữ id nhãn — khôi phục thẻ sẽ mang về id "mồ côi" (không hiển thị
    // được mà vẫn tính vào giới hạn nhãn/thẻ). `pullLabel` chỉ trả id thẻ SỐNG nên không phát realtime cho thẻ trong thùng rác.
    const affectedIds = await this.tasks.pullLabel(label.boardId, label.id);
    await this.labels.delete(label.id);

    const now = new Date();
    const affected = await this.tasks.findLiveByIds(affectedIds.slice(0, TASK_UPDATE_FANOUT_MAX));
    for (const card of await presentTaskCards(affected, this.directory, now)) {
      this.emitter.taskUpdated(board.id, { task: card, actorId: user.id });
    }
    this.emitter.boardUpdated(board.id, { boardId: board.id, version: board.version, labelsChanged: true });
  }
}
