import { LIMITS } from "../../../core/constants/limits";
import { DEFAULT_BOARD_COLUMNS, type BoardColumnTemplate } from "../../../core/constants/project";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { columnSchema } from "../dtos/board.dto";
import { z } from "zod";

/** Giới hạn/mẫu hiệu lực tại thời điểm gọi (mặc định `LIMITS` ⊕ override `SystemConfig` đã clamp). */
export interface ProjectConfig {
  columnsMax: number;
  perWorkspaceMax: number;
  perBoardMax: number;
  defaultColumns: BoardColumnTemplate[];
}

export interface IProjectConfig {
  load(): Promise<ProjectConfig>;
}

const templatesSchema = z.array(columnSchema.pick({ title: true, kind: true, wipLimit: true })).min(2);

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Đọc qua `runtimeConfig` (bộ nhớ → Redis → Mongo, fail-open về mặc định). Mẫu cột lỗi định dạng → mẫu mặc định. */
export class RuntimeProjectConfig implements IProjectConfig {
  async load(): Promise<ProjectConfig> {
    const [board, task, pm] = await Promise.all([
      runtimeConfig.getEffective("limits.board"),
      runtimeConfig.getEffective("limits.task"),
      runtimeConfig.getEffective("pm"),
    ]);
    const parsed = templatesSchema.safeParse(pm.defaultColumns);
    const template = parsed.success && parsed.data.filter((c) => c.kind === "DONE").length === 1;
    return {
      columnsMax: num(board.columnsMax, LIMITS.board.columnsMax),
      perWorkspaceMax: num(board.perWorkspaceMax, LIMITS.board.perWorkspaceMax),
      perBoardMax: num(task.perBoardMax, LIMITS.task.perBoardMax),
      defaultColumns: template && parsed.success ? parsed.data.map((c) => ({ ...c })) : [...DEFAULT_BOARD_COLUMNS],
    };
  }
}
