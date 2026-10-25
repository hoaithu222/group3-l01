import { LIMITS } from "../../../core/constants";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Resource, ResourceSortField } from "../entities/resource.interface";
import { extensionOf } from "./resource-type.resolver";

/** Tối đa 8 từ khoá AND — chặn truy vấn `contains` quá nặng. */
const MAX_TERMS = 8;

export function splitTerms(q: string): string[] {
  return normalizeSearch(q).split(" ").filter(Boolean).slice(0, MAX_TERMS);
}

export function sortValueOf(r: Pick<Resource, "createdAt" | "normalizedName" | "size">, sort: ResourceSortField): string | number | Date {
  return sort === "name" ? r.normalizedName : sort === "size" ? r.size : r.createdAt;
}

/** NFC + trim; nếu vượt `resourceNameMax` thì cắt phần tên nhưng GIỮ đuôi (đuôi quyết định biểu tượng/ngôn ngữ). */
export function fitResourceName(raw: string): string {
  const name = raw.normalize("NFC").trim();
  const max = LIMITS.resource.resourceNameMax;
  if (name.length <= max) return name;
  const ext = extensionOf(name);
  if (!ext) return name.slice(0, max);
  return `${name.slice(0, max - ext.length - 1)}.${ext}`;
}
