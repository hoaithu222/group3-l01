import type { ZodIssue } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { studyItemSchema, type StudyItemInput } from "../dtos";
import { mediaAssetIdsOf, type StudyItem, type StudyItemContent } from "../entities/study-item.interface";
import type { StudyItemErrorDetail } from "../study.errors";
import { normalizeAnswer } from "./answer-grader";
import { buildContent } from "./study-item.builder";

/** Thông tin asset đã tra trước (`null` = không tồn tại) — validator THUẦN, không I/O. */
export interface AssetCheck {
  ownerId: string;
  scope: string;
  variant: string;
  kind: string;
  status: string;
  /** Đã gắn `AssetLink` vào đối tượng nào đó. */
  linked: boolean;
}

export interface ItemValidationContext {
  actorId: string;
  /** Mục hiện có của bộ theo id. */
  existingById: ReadonlyMap<string, StudyItem>;
  /** Mục yêu cầu xoá trong cùng lượt. */
  deleteIds: ReadonlySet<string>;
  /** Asset đang gắn vào BẤT KỲ mục nào của bộ (tái dùng giữa các mục bị cấm). */
  existingMedia: ReadonlySet<string>;
  /** Asset ngoài `existingMedia` mà các mục mới/sửa tham chiếu. */
  assets: ReadonlyMap<string, AssetCheck | null>;
}

export interface ValidatedItem {
  index: number;
  clientItemKey: string;
  existing: StudyItem | null;
  content: StudyItemContent;
  /** Giá trị `afterClientItemKey` gốc của client (chưa đổi sang ref). */
  after: string | null | undefined;
}

const MEDIA_FIELDS = [
  ["frontMediaAssetId", "IMAGE"],
  ["backMediaAssetId", "IMAGE"],
  ["audioAssetId", "AUDIO"],
] as const;

/**
 * Asset dùng được cho bộ học: READY, scope STUDY, bản gốc, đúng loại (ảnh/âm thanh), CỦA NGƯỜI ĐANG LƯU và chưa gắn vào đâu
 * (README §5: "chưa gắn hoặc đã gắn cho chính mục đó" — trường hợp sau do caller loại trước bằng tập media hiện có).
 */
export function isUsableAsset(info: AssetCheck | null | undefined, actorId: string, kind: "IMAGE" | "AUDIO"): boolean {
  return (
    !!info &&
    info.status === "READY" &&
    info.scope === "STUDY" &&
    info.variant === "ORIGINAL" &&
    info.kind === kind &&
    info.ownerId === actorId &&
    !info.linked
  );
}

function issueCode(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" ? "REQUIRED" : "INVALID_TYPE";
    case "too_small":
      if (issue.type === "array") return "TOO_FEW";
      return issue.type === "string" && issue.minimum === 1 ? "REQUIRED" : "TOO_SHORT";
    case "too_big":
      return issue.type === "array" ? "TOO_MANY" : "TOO_LONG";
    case "invalid_string":
      return "INVALID_FORMAT";
    case "invalid_union_discriminator":
      return "INVALID_TYPE";
    default:
      return "INVALID";
  }
}

/** Mọi asset mà các mục THÔ tham chiếu (đọc phòng thủ — trước khi qua Zod) để service tra trước một lượt. */
export function collectMediaAssetIds(raw: readonly unknown[]): string[] {
  const ids = new Set<string>();
  const take = (v: unknown): void => {
    if (typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v)) ids.add(v);
  };
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    take(r.frontMediaAssetId);
    take(r.backMediaAssetId);
    take(r.audioAssetId);
    if (Array.isArray(r.options)) for (const o of r.options) if (typeof o === "object" && o !== null) take((o as Record<string, unknown>).mediaAssetId);
  }
  return [...ids];
}

/** Ghi lỗi của MỘT mục vào danh sách chung (kèm `index`/`clientItemKey`) và đếm số lỗi của riêng mục đó. */
class Collector {
  count = 0;
  constructor(
    private readonly index: number,
    private readonly key: string | null,
    private readonly sink: StudyItemErrorDetail[]
  ) {}
  add(field: string, code: string): void {
    this.count += 1;
    this.sink.push({ index: this.index, clientItemKey: this.key, field, code });
  }
}

function checkAnswers(input: StudyItemInput, c: Collector): void {
  if (input.type === "MULTIPLE_CHOICE" && input.correctOptionIndex >= input.options.length) c.add("correctOptionIndex", "STUDY_005");
  if (input.type === "MULTI_SELECT") {
    const idx = input.correctOptionIndexes;
    if (idx.some((i) => i >= input.options.length)) c.add("correctOptionIndexes", "STUDY_005");
    else if (new Set(idx).size !== idx.length) c.add("correctOptionIndexes", "DUPLICATE");
  }
  if (input.type === "MULTIPLE_CHOICE" || input.type === "MULTI_SELECT") {
    const ids = input.options.flatMap((o) => (o.id ? [o.id] : []));
    if (new Set(ids).size !== ids.length) c.add("options", "DUPLICATE_OPTION_ID");
  }
  if (input.type === "FILL_BLANK" && input.acceptedAnswers.some((a) => normalizeAnswer(a, input.matchMode).length === 0)) {
    c.add("acceptedAnswers", "EMPTY_AFTER_NORMALIZE");
  }
}

function checkMedia(
  input: StudyItemInput,
  existing: StudyItem | null,
  ctx: ItemValidationContext,
  batchUse: Map<string, string>,
  c: Collector
): void {
  const prev = new Set(existing ? mediaAssetIdsOf(existing) : []);
  const check = (field: string, assetId: string | null | undefined, kind: "IMAGE" | "AUDIO"): void => {
    if (!assetId || prev.has(assetId)) return; // không đổi: đã gắn đúng mục này
    const info = ctx.assets.get(assetId);
    const usedBy = batchUse.get(assetId);
    const bound = ctx.existingMedia.has(assetId) || (usedBy !== undefined && usedBy !== input.clientItemKey);
    const ok = !bound && isUsableAsset(info, ctx.actorId, kind);
    if (!ok) c.add(field, "STUDY_006");
    else batchUse.set(assetId, input.clientItemKey);
  };
  for (const [field, kind] of MEDIA_FIELDS) check(field, input[field], kind);
  if (input.type === "MULTIPLE_CHOICE" || input.type === "MULTI_SELECT") {
    input.options.forEach((o, i) => check(`options.${i}.mediaAssetId`, o.mediaAssetId, "IMAGE"));
  }
}

/**
 * Kiểm TỪNG mục và GOM mọi lỗi (không dừng ở lỗi đầu, tối đa `LIMITS.study.errorDetailsMax`) — hàm THUẦN. Lỗi có `index`
 * (vị trí trong `upsert[]`) + `clientItemKey` + `field` + `code` để trình soạn cuộn tới đúng mục (ST-03).
 */
export function validateItems(raw: readonly unknown[], ctx: ItemValidationContext): { items: ValidatedItem[]; errors: StudyItemErrorDetail[] } {
  const errors: StudyItemErrorDetail[] = [];
  const items: ValidatedItem[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const batchUse = new Map<string, string>();
  const max = LIMITS.study.errorDetailsMax;

  raw.forEach((entry, index) => {
    if (errors.length >= max) return;
    const rawKey = (entry as { clientItemKey?: unknown } | null)?.clientItemKey;
    const c = new Collector(index, typeof rawKey === "string" ? rawKey : null, errors);

    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      c.add("", "INVALID_TYPE");
      return;
    }
    const parsed = studyItemSchema.safeParse(entry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) c.add(issue.path.join("."), issueCode(issue));
      return;
    }
    const input = parsed.data;

    if (seenKeys.has(input.clientItemKey)) c.add("clientItemKey", "DUPLICATE_KEY");
    seenKeys.add(input.clientItemKey);

    let existing: StudyItem | null = null;
    if (input.id) {
      existing = ctx.existingById.get(input.id) ?? null;
      if (!existing) c.add("id", "NOT_FOUND");
      else if (ctx.deleteIds.has(input.id)) c.add("id", "CONFLICT_DELETE");
      else if (seenIds.has(input.id)) c.add("id", "DUPLICATE_ID");
      seenIds.add(input.id);
    }
    if (input.afterClientItemKey === input.clientItemKey || (input.id && input.afterClientItemKey === input.id)) {
      c.add("afterClientItemKey", "INVALID_REF");
    }

    checkAnswers(input, c);
    checkMedia(input, existing, ctx, batchUse, c);
    if (c.count === 0) items.push({ index, clientItemKey: input.clientItemKey, existing, content: buildContent(input), after: input.afterClientItemKey });
  });

  // Tham chiếu vị trí: `afterClientItemKey` phải là khoá của mục KHÁC trong lượt hoặc id của mục đã có (chưa bị xoá).
  const failedIndexes = new Set(errors.map((e) => e.index));
  for (const item of items) {
    if (errors.length >= max || item.after === undefined || item.after === null) continue;
    const known = seenKeys.has(item.after) || (ctx.existingById.has(item.after) && !ctx.deleteIds.has(item.after));
    if (!known && !failedIndexes.has(item.index)) errors.push({ index: item.index, clientItemKey: item.clientItemKey, field: "afterClientItemKey", code: "INVALID_REF" });
  }

  errors.sort((a, b) => a.index - b.index);
  return { items, errors: errors.slice(0, max) };
}
