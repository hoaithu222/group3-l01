import { normalizeSearch } from "../../../core/utils/normalize";

/** Thẻ lưu dạng chuẩn hoá (chữ thường, bỏ dấu, gộp khoảng trắng), khử trùng lặp, giữ thứ tự nhập, bỏ thẻ rỗng. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeSearch(raw);
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Từ khoá tìm tiêu đề: chuẩn hoá rồi tách theo khoảng trắng (AND từng từ trên `normalizedTitle`), tối đa `max` từ. */
export function searchTerms(q: string, max = 8): string[] {
  return normalizeSearch(q).split(" ").filter((t) => t.length > 0).slice(0, max);
}
