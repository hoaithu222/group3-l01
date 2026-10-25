import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { CreateBoardFromTemplateDto, DuplicateBoardDto } from "../dtos";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { BoardService } from "./board.service";
import { toBoardDto, toLabelDto, type BoardDto, type LabelDto } from "./board.presenter";
import type { ProjectAccess } from "./project-access";
import { parseBoardReview } from "./review/review-config.schema";
import { BOARD_TEMPLATES, findBoardTemplate, type BoardTemplate } from "./board-templates";
import { BoardTaskCopier } from "./board-task-copier";
import type { TaskService } from "./task.service";
import type { ITaskRepository } from "../repositories/task.repository.interface";

export interface BoardWithLabelsDto extends BoardDto {
  labels: LabelDto[];
}

/** Kết quả `POST /boards/:id/duplicate` — thêm số thẻ đã sao chép khi `includeTasks` (vắng = không yêu cầu sao chép thẻ). */
export interface DuplicatedBoardDto extends BoardWithLabelsDto {
  copiedTasks?: number;
  /** `true` khi bảng gốc còn thẻ chưa sao chép vì chạm trần `LIMITS.board.duplicateTasksMax`. */
  tasksTruncated?: boolean;
}

export interface BoardTemplateDto {
  code: BoardTemplate["code"];
  name: string;
  description: string;
  columns: { title: string; kind: string; wipLimit: number | null }[];
  labels: { name: string; color: string }[];
}

export interface BoardBlueprintDeps {
  boards: IBoardRepository;
  labels: ILabelRepository;
  access: ProjectAccess;
  /** Tạo bảng đi ĐÚNG đường `BoardService.create` (quyền `workspace.board.create`, trần `TASK_009`, kiểm cột, mặc định chấm chéo). */
  creator: Pick<BoardService, "create">;
  /** `includeTasks`: đọc thẻ bảng gốc + tạo thẻ mới đi ĐÚNG `TaskService.create` — vắng thì `includeTasks` bị bỏ qua (không sao chép thẻ). */
  tasks?: Pick<ITaskRepository, "listColumn">;
  taskCreator?: Pick<TaskService, "create">;
}

const COPY_SUFFIX = " (bản sao)";

/** "<tên> (bản sao)" — cắt tên gốc để tổng không vượt trần tên bảng. */
export function copyBoardName(name: string): string {
  return `${[...name].slice(0, LIMITS.board.nameMax - COPY_SUFFIX.length).join("")}${COPY_SUFFIX}`;
}

/**
 * Mẫu bảng + sao chép bảng (p3-02 P1). Cả hai dựng CẤU TRÚC (cột, nhãn, cấu hình chấm chéo) rồi giao cho `BoardService.create` tạo bảng — không có đường tạo
 * bảng thứ hai. Nhãn được thêm SAU khi bảng đã tạo (best-effort từng nhãn: trùng tên/quá trần chỉ bỏ nhãn đó, bảng vẫn hợp lệ). Thẻ chỉ sao chép khi `includeTasks` (`BoardTaskCopier`).
 */
export class BoardBlueprintService {
  constructor(private readonly d: BoardBlueprintDeps) {}

  templates(): BoardTemplateDto[] {
    return BOARD_TEMPLATES.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
      columns: t.columns.map((c) => ({ title: c.title, kind: c.kind, wipLimit: c.wipLimit ?? null })),
      labels: t.labels.map((l) => ({ ...l })),
    }));
  }

  async createFromTemplate(user: AuthUser, workspaceId: string, dto: CreateBoardFromTemplateDto): Promise<BoardWithLabelsDto> {
    const template = findBoardTemplate(dto.template);
    const created = await this.d.creator.create(user, workspaceId, {
      name: dto.name ?? template.name,
      description: dto.description ?? template.description,
      columns: template.columns,
    });
    const labels = await this.addLabels(created.id, created.workspaceId, template.labels);
    return { ...created, labels: labels.map(toLabelDto) };
  }

  async duplicate(user: AuthUser, boardId: string, dto: DuplicateBoardDto): Promise<DuplicatedBoardDto> {
    // Đọc được bảng gốc (kể cả đã lưu trữ) — người ngoài/GUEST → 404; tạo bảng mới cần `workspace.board.create` (kiểm ở `creator.create`, MEMBER → 403).
    const { board: src } = await this.d.access.board(user, boardId, "workspace.board.read");
    const created = await this.d.creator.create(user, src.workspaceId, {
      name: dto.name ?? copyBoardName(src.name),
      description: src.description ?? undefined,
      columns: src.columns.map((c) => ({ title: c.title, kind: c.kind, wipLimit: c.wipLimit })),
    });

    let board = created;
    if (dto.includeReviewConfig && src.review) {
      const fresh = await this.d.boards.findById(created.id);
      const saved = fresh ? await this.d.boards.updateReviewCas(fresh.id, fresh.version, parseBoardReview(src.review)) : null;
      if (saved) board = toBoardDto(saved);
    }
    const srcLabels = dto.includeLabels ? await this.d.labels.listByBoard(src.id) : [];
    const labels = await this.addLabels(board.id, board.workspaceId, srcLabels);
    const result: DuplicatedBoardDto = { ...board, labels: labels.map(toLabelDto) };
    if (dto.includeTasks && this.d.tasks && this.d.taskCreator) {
      // Nhãn gốc → nhãn bản sao theo TÊN (duy nhất trong bảng); nhãn không có bản sao (includeLabels=false, quá trần) thì thẻ mất nhãn đó.
      const byName = new Map(labels.map((l) => [l.name, l.id]));
      const labelIdMap = new Map(srcLabels.flatMap((l) => (byName.has(l.name) ? [[l.id, byName.get(l.name) as string] as const] : [])));
      const copied = await new BoardTaskCopier({ tasks: this.d.tasks, creator: this.d.taskCreator }).copy(user, src, board, labelIdMap);
      result.copiedTasks = copied.copied;
      result.tasksTruncated = copied.truncated;
    }
    return result;
  }

  private async addLabels(boardId: string, workspaceId: string, items: { name: string; color: string }[]) {
    const out = [];
    for (const item of items.slice(0, LIMITS.board.labelsMax)) {
      const label = await this.d.labels.create({ boardId, workspaceId, name: item.name, normalizedName: normalizeSearch(item.name), color: item.color });
      if (label) out.push(label);
    }
    return out;
  }
}
