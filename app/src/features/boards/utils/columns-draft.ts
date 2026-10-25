import type { ColumnInput, ColumnKind } from '../api/boards.types';

/**
 * Bản NHÁP cột đang chỉnh (form tạo bảng / cài đặt bảng). Tách khỏi `ColumnInput`
 * vì ô nhập cần chuỗi (`wipLimit: ''` = không giới hạn) và mỗi dòng cần `key` ổn
 * định cho React — `id` của cột mới chưa có, còn `title` thì đổi liên tục.
 */
export interface ColumnDraft {
  key: string;
  /** Có ⇒ cột đã tồn tại trên server (giữ `id` để không bị hiểu là xoá + tạo mới). */
  id?: string;
  kind: ColumnKind;
  title: string;
  wipLimit: string;
}

export interface ColumnLimits {
  columnTitleMax: number;
  columnsMax: number;
}

const WIP_MAX = 500;
let counter = 0;

function nextKey(): string {
  counter += 1;
  return `col-draft-${counter}`;
}

/** Nguồn dựng nháp: cột đã có (`BoardColumn`) hoặc mẫu (`ColumnInput`, chưa có `id`). */
export interface ColumnSource {
  id?: string;
  kind: ColumnKind;
  title: string;
  wipLimit?: number | null;
}

export function toDrafts(columns: readonly ColumnSource[]): ColumnDraft[] {
  return columns.map((column) => ({
    id: column.id,
    key: nextKey(),
    kind: column.kind,
    title: column.title,
    wipLimit: column.wipLimit ? String(column.wipLimit) : '',
  }));
}

/** Nháp → payload; `id` chỉ gửi cho cột đã có (be.md §3: thiếu `id` = cột mới). */
export function toInputs(drafts: readonly ColumnDraft[]): ColumnInput[] {
  return drafts.map((draft) => {
    const wip = Number.parseInt(draft.wipLimit, 10);
    return {
      ...(draft.id ? { id: draft.id } : {}),
      kind: draft.kind,
      title: draft.title.trim(),
      wipLimit: Number.isFinite(wip) ? wip : null,
    };
  });
}

/**
 * Nháp có KHÁC danh sách cột đang lưu trên server không (tên, loại, WIP, thứ tự, thêm/xoá) — để màn Cài đặt khoá nút "Lưu cột" khi
 * chưa đổi gì, thay vì để một nút chính sáng sẵn cạnh "Lưu thông tin".
 */
export function draftsDiffer(drafts: readonly ColumnDraft[], columns: readonly ColumnSource[]): boolean {
  return JSON.stringify(toInputs(drafts)) !== JSON.stringify(toInputs(toDrafts(columns)));
}

/** Lỗi đầu tiên, hoặc `null` nếu hợp lệ — cùng luật với `board-columns.validator` phía BE (be.md §5). */
export function validateDrafts(drafts: readonly ColumnDraft[], limits: ColumnLimits): string | null {
  if (drafts.length < 2) return 'Bảng cần ít nhất 2 cột';
  if (drafts.length > limits.columnsMax) return `Bảng chỉ có tối đa ${limits.columnsMax} cột`;
  for (const draft of drafts) {
    const title = draft.title.trim();
    if (!title) return 'Tên cột không được để trống';
    if (title.length > limits.columnTitleMax) return `Tên cột tối đa ${limits.columnTitleMax} ký tự`;
    if (draft.wipLimit !== '') {
      const wip = Number(draft.wipLimit);
      if (!Number.isInteger(wip) || wip < 1 || wip > WIP_MAX) {
        return `Giới hạn số thẻ phải từ 1 đến ${WIP_MAX}`;
      }
    }
  }
  const doneCount = drafts.filter((draft) => draft.kind === 'DONE').length;
  if (doneCount !== 1) return 'Bảng phải có đúng một cột "Hoàn thành"';
  return null;
}

export function updateDraft(
  drafts: readonly ColumnDraft[],
  key: string,
  patch: Partial<Pick<ColumnDraft, 'kind' | 'title' | 'wipLimit'>>,
): ColumnDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft));
}

export function addDraft(drafts: readonly ColumnDraft[]): ColumnDraft[] {
  return [...drafts, { key: nextKey(), kind: 'IN_PROGRESS', title: '', wipLimit: '' }];
}

export function removeDraft(drafts: readonly ColumnDraft[], key: string): ColumnDraft[] {
  return drafts.filter((draft) => draft.key !== key);
}

/** Đổi chỗ với hàng xóm; đã ở đầu/cuối thì trả lại đúng mảng cũ. */
export function moveDraft(
  drafts: readonly ColumnDraft[],
  key: string,
  direction: -1 | 1,
): ColumnDraft[] {
  const from = drafts.findIndex((draft) => draft.key === key);
  const to = from + direction;
  const a = drafts[from];
  const b = drafts[to];
  if (!a || !b) return [...drafts];
  const next = [...drafts];
  next[from] = b;
  next[to] = a;
  return next;
}
