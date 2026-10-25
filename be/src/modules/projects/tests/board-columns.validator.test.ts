import { BOARD_COLUMN_ID_REGEX } from "../../../core/constants/project";
import type { BoardColumn } from "../entities/board.interface";
import {
  assembleColumns,
  diffColumns,
  isCompletionKindChange,
  newColumnId,
} from "../services/board-columns.validator";

const col = (title: string, kind: BoardColumn["kind"], id?: string) => ({ title, kind, ...(id && { id }) });
const four = [col("To do", "TODO"), col("Doing", "IN_PROGRESS"), col("Review", "REVIEW"), col("Done", "DONE")];

describe("board-columns.validator — assembleColumns", () => {
  it("sinh id `c_` + 8 ký tự cho cột mới, order theo vị trí, wipLimit mặc định null", () => {
    const cols = assembleColumns(four, { columnsMax: 12 });
    expect(cols).toHaveLength(4);
    expect(cols.map((c) => c.order)).toEqual([0, 1, 2, 3]);
    for (const c of cols) {
      expect(c.id).toMatch(BOARD_COLUMN_ID_REGEX);
      expect(c.wipLimit).toBeNull();
    }
    expect(new Set(cols.map((c) => c.id)).size).toBe(4);
  });

  it("newColumnId luôn khớp regex và không trùng trong 1.000 lần sinh", () => {
    const ids = new Set(Array.from({ length: 1000 }, newColumnId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(BOARD_COLUMN_ID_REGEX);
  });

  it("0 cột DONE → TASK_008 (400)", () => {
    expect(() => assembleColumns([col("A", "TODO"), col("B", "IN_PROGRESS")], { columnsMax: 12 })).toThrow(
      expect.objectContaining({ errorCode: "TASK_008", statusCode: 400 })
    );
  });

  it("2 cột DONE → TASK_008 (400)", () => {
    expect(() => assembleColumns([col("A", "DONE"), col("B", "DONE"), col("C", "TODO")], { columnsMax: 12 })).toThrow(
      expect.objectContaining({ errorCode: "TASK_008" })
    );
  });

  it("dưới 2 hoặc quá columnsMax cột → VAL_001", () => {
    expect(() => assembleColumns([col("A", "DONE")], { columnsMax: 12 })).toThrow(expect.objectContaining({ errorCode: "VAL_001" }));
    const many = Array.from({ length: 5 }, (_, i) => col(`C${i}`, i === 0 ? "DONE" : "TODO"));
    expect(() => assembleColumns(many, { columnsMax: 4 })).toThrow(expect.objectContaining({ errorCode: "VAL_001" }));
  });

  it("id bị trùng → VAL_001", () => {
    expect(() =>
      assembleColumns([col("A", "TODO", "c_aaaaaaaa"), col("B", "DONE", "c_aaaaaaaa")], { columnsMax: 12 })
    ).toThrow(expect.objectContaining({ errorCode: "VAL_001" }));
  });

  it("PUT: id không thuộc bảng → VAL_001 kèm unknownColumnIds; id có sẵn được giữ", () => {
    const existing = new Set(["c_aaaaaaaa", "c_bbbbbbbb"]);
    const ok = assembleColumns([col("A", "TODO", "c_aaaaaaaa"), col("B", "DONE", "c_bbbbbbbb")], { columnsMax: 12, existingIds: existing });
    expect(ok.map((c) => c.id)).toEqual(["c_aaaaaaaa", "c_bbbbbbbb"]);

    let details: unknown;
    try {
      assembleColumns([col("A", "TODO", "c_zzzzzzzz"), col("B", "DONE", "c_bbbbbbbb")], { columnsMax: 12, existingIds: existing });
    } catch (err) {
      details = (err as { details?: unknown }).details;
    }
    expect(details).toEqual({ unknownColumnIds: ["c_zzzzzzzz"] });
  });
});

describe("board-columns.validator — diffColumns", () => {
  const prev = assembleColumns(four, { columnsMax: 12 });

  it("cột bị bỏ và cột đổi loại", () => {
    const next = assembleColumns(
      [
        { ...col("A", "TODO", prev[0].id) },
        { ...col("B", "REVIEW", prev[1].id) }, // IN_PROGRESS → REVIEW
        { ...col("D", "DONE", prev[3].id) },
      ],
      { columnsMax: 12, existingIds: new Set(prev.map((c) => c.id)) }
    );
    const diff = diffColumns(prev, next);
    expect(diff.removed.map((c) => c.id)).toEqual([prev[2].id]);
    expect(diff.kindChanged).toEqual([{ id: prev[1].id, from: "IN_PROGRESS", to: "REVIEW" }]);
  });

  it("isCompletionKindChange: chỉ khi một đầu là DONE", () => {
    expect(isCompletionKindChange({ id: "x", from: "TODO", to: "DONE" })).toBe(true);
    expect(isCompletionKindChange({ id: "x", from: "DONE", to: "REVIEW" })).toBe(true);
    expect(isCompletionKindChange({ id: "x", from: "TODO", to: "REVIEW" })).toBe(false);
  });
});
