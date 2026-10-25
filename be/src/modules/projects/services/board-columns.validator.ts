import { randomBytes } from "crypto";
import { AppError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { BoardColumn } from "../entities/board.interface";
import type { ColumnInputDto } from "../dtos/board.dto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** "c_" + 8 ký tự [A-Za-z0-9] (`BOARD_COLUMN_ID_REGEX`); nguồn ngẫu nhiên mật mã, không đoán trước được. */
export function newColumnId(): string {
  const bytes = randomBytes(8);
  return `c_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

export const columnsError = (): AppError => new AppError(ErrorMessages[ErrorCode.TASK_008], 400, ErrorCode.TASK_008);

export interface AssembleOptions {
  columnsMax: number;
  /** Id cột đang có trên bảng (PUT). `undefined` = tạo bảng mới (chấp nhận id do client đặt nếu không trùng). */
  existingIds?: ReadonlySet<string>;
}

/**
 * Dựng mảng cột chuẩn từ input: sinh id cho cột mới, kiểm số lượng (≤ `columnsMax`), id duy nhất, ĐÚNG MỘT cột DONE
 * (`TASK_008`), `order` = vị trí trong mảng. Không đụng DB — xoá cột còn thẻ/đổi kind kiểm ở `diffColumns`+service.
 */
export function assembleColumns(input: ColumnInputDto[], opts: AssembleOptions): BoardColumn[] {
  if (input.length < 2 || input.length > opts.columnsMax) {
    throw new ValidationError(`Bảng cần từ 2 đến ${opts.columnsMax} cột`, { columns: ["Số cột không hợp lệ"] });
  }
  const seen = new Set<string>();
  const unknown: string[] = [];
  const columns = input.map((c, index): BoardColumn => {
    const id = c.id ?? newColumnId();
    if (seen.has(id)) throw new ValidationError("Mã cột bị trùng", { columns: [`Trùng mã ${id}`] });
    seen.add(id);
    if (c.id && opts.existingIds && !opts.existingIds.has(c.id)) unknown.push(c.id);
    return { id, title: c.title, kind: c.kind, order: index, wipLimit: c.wipLimit ?? null };
  });
  if (unknown.length > 0) throw new ValidationError("Có cột không tồn tại trên bảng này", { unknownColumnIds: unknown });
  if (columns.filter((c) => c.kind === "DONE").length !== 1) throw columnsError();
  return columns;
}

export interface ColumnsDiff {
  /** Cột có trong bảng cũ nhưng không còn ở danh sách mới. */
  removed: BoardColumn[];
  /** Cột giữ lại nhưng đổi loại (`from` → `to`). */
  kindChanged: { id: string; from: BoardColumn["kind"]; to: BoardColumn["kind"] }[];
}

export function diffColumns(previous: BoardColumn[], next: BoardColumn[]): ColumnsDiff {
  const nextById = new Map(next.map((c) => [c.id, c]));
  const removed = previous.filter((c) => !nextById.has(c.id));
  const kindChanged = previous.flatMap((c) => {
    const after = nextById.get(c.id);
    return after && after.kind !== c.kind ? [{ id: c.id, from: c.kind, to: after.kind }] : [];
  });
  return { removed, kindChanged };
}

/** Đổi loại DONE ↔ khác trên cột đang có thẻ sẽ sinh/huỷ hoàn thành hàng loạt → chặn (`TASK_008`). */
export function isCompletionKindChange(change: ColumnsDiff["kindChanged"][number]): boolean {
  return change.from === "DONE" || change.to === "DONE";
}
