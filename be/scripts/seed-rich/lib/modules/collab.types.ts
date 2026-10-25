import type { PersonKey } from "../../types";
import type { BoardBuilder } from "./collab-board-dsl";
import type { Block } from "./collab-yjs";

export type CollabRole = "EDITOR" | "VIEWER";

/** Mốc lịch sử: chụp trạng thái khi tài liệu mới có `at` khối đầu (≥ 1, ≤ số khối). */
export interface DocHistory {
  at: number;
  kind: "AUTO" | "MANUAL";
  label?: string;
  by?: PersonKey;
  /** Chụp cách đây bao nhiêu ngày (phải nằm giữa lúc tạo và lần sửa cuối). */
  daysAgo: number;
}

export interface DocSpec {
  title: string;
  by: PersonKey;
  /** Mặc định WORKSPACE. PRIVATE ⇒ chỉ người tạo + `collab` đọc được (OWNER/ADMIN nhóm cũng không tự thấy). */
  visibility?: "WORKSPACE" | "PRIVATE";
  /** Người được mời: [người, vai]. Người tạo KHÔNG có dòng cộng tác. */
  collab?: ReadonlyArray<readonly [PersonKey, CollabRole]>;
  /** Người sửa cuối (mặc định = người tạo). */
  lastBy?: PersonKey;
  daysAgo: number;
  editedDaysAgo: number;
  archived?: boolean;
  blocks: readonly Block[];
  history?: readonly DocHistory[];
}

export type DocsByWorkspace = Record<string, readonly DocSpec[]>;

/** Bảng trắng: `draw` vẽ lên `BoardBuilder` (người vẽ luân phiên trong `drawers`). */
export interface BoardSpec {
  name: string;
  by: PersonKey;
  visibility?: "WORKSPACE" | "PRIVATE";
  collab?: ReadonlyArray<readonly [PersonKey, CollabRole]>;
  lastBy?: PersonKey;
  daysAgo: number;
  editedDaysAgo: number;
  background: "grid" | "dots" | "plain";
  /** Những người đã vẽ (thành viên nhóm); mặc định chỉ người tạo. */
  drawers?: readonly PersonKey[];
  /** Bản lưu cũ: chụp khi bảng mới có `ratio` (0–1) số phần tử cuối cùng. */
  history?: ReadonlyArray<{ ratio: number; kind: "AUTO" | "MANUAL"; label?: string; by?: PersonKey; daysAgo: number }>;
  draw: (b: BoardBuilder) => void;
}

export type BoardsByWorkspace = Record<string, readonly BoardSpec[]>;
