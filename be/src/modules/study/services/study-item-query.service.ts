import { ValidationError } from "../../../core/exceptions";
import type { CursorMeta } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type { ListItemsQueryDto } from "../dtos";
import { toItemDto, type StudyItemDto } from "./study-set.presenter";
import { loadSet, type StudyDeps } from "./study.deps";

export interface StudyItemPage {
  data: StudyItemDto[];
  /** `setVersion` = phiên bản bộ lúc đọc — trình soạn dùng làm `expectedVersion` cho lần lưu đầu tiên. */
  meta: CursorMeta & { setVersion: number };
}

function encodeItemCursor(order: number, id: string): string {
  return Buffer.from(JSON.stringify({ o: order, i: id })).toString("base64url");
}

function decodeItemCursor(cursor: string): { order: number; id: string } {
  try {
    const body = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown; i?: unknown };
    if (typeof body.o === "number" && Number.isFinite(body.o) && typeof body.i === "string" && /^[0-9a-fA-F]{24}$/.test(body.i)) {
      return { order: body.o, id: body.i };
    }
  } catch {
    // rơi xuống lỗi chung
  }
  throw new ValidationError("Cursor không hợp lệ");
}

/** `GET /study-sets/:id/items` — nội dung KÈM đáp án cho chế độ học (người đọc được nội dung bộ). Mặc định toàn bộ ≤ 500. */
export class StudyItemQueryService {
  constructor(private readonly d: Pick<StudyDeps, "sets" | "items" | "access">) {}

  async list(user: AuthUser, setId: string, query: ListItemsQueryDto): Promise<StudyItemPage> {
    const set = await loadSet(this.d, setId);
    await this.d.access.assertContent(user, set); // 404 với mọi người không đọc được nội dung (ST-04)
    const after = query.cursor ? decodeItemCursor(query.cursor) : undefined;
    const rows = await this.d.items.list({ setId, after, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page.map(toItemDto),
      meta: { nextCursor: hasMore && last ? encodeItemCursor(last.order, last.id) : null, hasMore, limit: query.limit, setVersion: set.version },
    };
  }
}
