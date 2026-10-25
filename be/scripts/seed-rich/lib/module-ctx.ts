import type { Directory } from "./core";
import type { WorkspaceCtx } from "./workspace";

/**
 * Ngữ cảnh truyền cho mỗi bộ seed phân hệ (`lib/modules/*.ts`): bảng khoá người → id, thời điểm chạy, và các nhóm làm việc
 * đã được tạo/tìm thấy ở bước trước (khoá = `WorkspaceSpec.key`, vd `"frontend"`, `"appdev"`).
 */
export interface ModuleCtx {
  dir: Directory;
  now: Date;
  workspaces: ReadonlyMap<string, WorkspaceCtx>;
}

/** Mỗi bộ seed phân hệ trả về MỘT dòng tóm tắt (đếm bản ghi mới) để in ra console. Phải idempotent. */
export type ModuleSeed = (c: ModuleCtx) => Promise<string>;
