import { ValidationError } from "../../../core/exceptions";
import type { ResourceSortField } from "../entities/resource.interface";

/**
 * Cursor danh sách tài liệu: `(giá trị trường sắp, id)` — base64url JSON. `sort` nằm TRONG cursor để cursor của
 * `sort=size` không dùng nhầm cho `sort=name` (client đổi sắp xếp phải bỏ cursor cũ).
 */
interface CursorBody {
  s: ResourceSortField;
  v: string | number;
  i: string;
}

export function encodeListCursor(sort: ResourceSortField, value: string | number | Date, id: string): string {
  const v = value instanceof Date ? value.toISOString() : value;
  return Buffer.from(JSON.stringify({ s: sort, v, i: id } satisfies CursorBody)).toString("base64url");
}

export function decodeListCursor(
  cursor: string,
  sort: ResourceSortField
): { value: string | number | Date; id: string } {
  const invalid = () => new ValidationError("Cursor không hợp lệ hoặc không khớp cách sắp xếp hiện tại");
  let body: CursorBody;
  try {
    body = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorBody;
  } catch {
    throw invalid();
  }
  if (body.s !== sort || typeof body.i !== "string" || !/^[0-9a-fA-F]{24}$/.test(body.i)) throw invalid();
  if (sort === "size") {
    if (typeof body.v !== "number") throw invalid();
    return { value: body.v, id: body.i };
  }
  if (typeof body.v !== "string") throw invalid();
  if (sort === "createdAt") {
    const at = new Date(body.v);
    if (Number.isNaN(at.getTime())) throw invalid();
    return { value: at, id: body.i };
  }
  return { value: body.v, id: body.i };
}
