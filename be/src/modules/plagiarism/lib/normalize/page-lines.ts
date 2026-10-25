import { normalizeSearch } from "../../../../core/utils/normalize";
import { PLAGIARISM_DEFAULTS } from "../constants";

export interface PageLineOptions {
  /** Tỉ lệ trang tối thiểu chứa dòng đó thì coi là header/footer (mặc định 0.5 — README §2). */
  minPageRatio?: number;
  /** Số dòng đầu/cuối mỗi trang được xét (mặc định 3). */
  edgeLines?: number;
}

/**
 * Khoá so sánh một dòng header/footer: chuẩn hoá bỏ dấu/hoa thường và đổi mọi số thành `#` — "Trang 3/10" và "Trang 4/10"
 * cùng một khoá, nên số trang chạy không làm dòng thoát khỏi việc bị nhận diện.
 */
function lineKey(line: string): string {
  return normalizeSearch(line).replace(/\d+/g, "#");
}

/** Chỉ số các dòng thuộc mép trang: `edge` dòng có chữ đầu tiên và `edge` dòng có chữ cuối cùng. */
function edgeIndexes(lines: readonly string[], edge: number): Set<number> {
  const filled: number[] = [];
  lines.forEach((line, i) => {
    if (line.trim() !== "") filled.push(i);
  });
  return new Set([...filled.slice(0, edge), ...filled.slice(Math.max(0, filled.length - edge))]);
}

/**
 * Bỏ dòng header/footer lặp của tài liệu nhiều trang (PDF — README §2): dòng nằm ở mép trang (đầu/cuối) và lặp lại (sau
 * khi bỏ khác biệt về số) ở ≥ `minPageRatio` số trang VÀ ≥ 2 trang thì bị xoá khỏi mọi trang mà nó nằm ở mép. Chỉ xét mép
 * vì header/footer luôn ở mép; dòng thân bài trùng nhau (mục lặp, "Có"/"Không") không bị xoá nhầm. Tài liệu < 2 trang
 * giữ nguyên. Trả về danh sách trang mới, cùng độ dài (trang trống vẫn còn), dòng nối lại bằng "\n".
 */
export function stripRepeatedPageLines(pages: readonly string[], options: PageLineOptions = {}): string[] {
  const ratio = options.minPageRatio ?? PLAGIARISM_DEFAULTS.headerFooterMinPageRatio;
  const edge = options.edgeLines ?? PLAGIARISM_DEFAULTS.headerFooterEdgeLines;
  if (pages.length < 2) return [...pages];

  const split = pages.map((page) => page.split("\n"));
  const edges = split.map((lines) => edgeIndexes(lines, edge));
  const pagesWithKey = new Map<string, number>();
  split.forEach((lines, p) => {
    const keys = new Set<string>();
    edges[p].forEach((i) => keys.add(lineKey(lines[i])));
    keys.forEach((k) => pagesWithKey.set(k, (pagesWithKey.get(k) ?? 0) + 1));
  });

  const need = Math.max(2, Math.ceil(ratio * pages.length));
  return split.map((lines, p) =>
    lines.filter((line, i) => !edges[p].has(i) || (pagesWithKey.get(lineKey(line)) ?? 0) < need).join("\n"),
  );
}
