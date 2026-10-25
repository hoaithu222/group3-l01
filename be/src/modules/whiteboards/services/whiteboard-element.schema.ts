import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/**
 * Schema phần tử bảng trắng (Zod v3) — BẢN PHẢN CHIẾU của hợp đồng `contracts/whiteboard-elements.schema.json` (p6-02 be.md §2.1; app dựng phần tử theo file JSON đó).
 * Test `whiteboard-element.schema.test.ts` đối chiếu hai bên (loại phần tử, trần chữ/điểm, tập khoá bắt buộc) để không lệch. Dùng ở `WhiteboardStateInspector`:
 * BE CHỈ ĐẾM/cảnh báo phần tử sai dạng, KHÔNG từ chối lưu (xem ghi chú ở inspector).
 *
 * Y.Doc gốc: `elements` Y.Map<elementId, Y.Map>, `order` Y.Array<elementId> (z-order), `meta` Y.Map { background }. Màu lưu ID TOKEN (`ink`, `blue`, `yellow`…), không lưu mã màu,
 * để đổi giao diện sáng/tối không vỡ tương phản.
 */
export const WHITEBOARD_ROOT = { elements: "elements", order: "order", meta: "meta" } as const;

/** `image`/`frame` là P1 nhưng đã có trong hợp đồng để app P0 không phải đổi schema khi bật P1. */
export const ELEMENT_TYPES = ["rect", "ellipse", "line", "arrow", "text", "sticky", "freehand", "image", "frame"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const BACKGROUNDS = ["grid", "dots", "plain"] as const;

/** Id phần tử do client sinh (nanoid/uuid): chữ, số, `_`, `-`; cũng là khoá trong `elements`. */
export const ELEMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Id token màu: chữ thường + số + gạch nối, bắt đầu bằng chữ. */
export const COLOR_TOKEN_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;

const finite = z.number().finite();
const colorToken = z.string().regex(COLOR_TOKEN_PATTERN, "Id token màu không hợp lệ");
const binding = z.object({ elementId: z.string().regex(ELEMENT_ID_PATTERN) }).strict();

export const whiteboardElementSchema = z
  .object({
    id: z.string().regex(ELEMENT_ID_PATTERN),
    type: z.enum(ELEMENT_TYPES),
    x: finite,
    y: finite,
    w: finite,
    h: finite,
    /** Độ. */
    rotation: finite,
    strokeColor: colorToken,
    fillColor: colorToken.nullable(),
    strokeWidth: z.number().min(1).max(12),
    text: z.string().max(LIMITS.whiteboard.elementTextMax).optional(),
    fontSize: z.number().min(12).max(96).optional(),
    /** Nét tự do: dãy phẳng x0,y0,x1,y1,… nên số phần tử PHẢI chẵn; tối đa 1000 số (= 500 điểm/nét, README §10). */
    points: z
      .array(finite)
      .max(LIMITS.whiteboard.freehandPointsMax)
      .refine((p) => p.length % 2 === 0, "points phải gồm các cặp x,y")
      .optional(),
    startBinding: binding.optional(),
    endBinding: binding.optional(),
    /** P1 — ảnh chèn (id Asset). */
    assetId: objectIdSchema.optional(),
    /** P1 — khoá phần tử. */
    locked: z.boolean().optional(),
    createdBy: objectIdSchema,
    updatedBy: objectIdSchema,
    /** ms từ epoch. */
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type WhiteboardElement = z.infer<typeof whiteboardElementSchema>;

/** Phần tử hợp lệ khi đúng schema VÀ `id` trùng khoá trong `elements` (khoá lệch → một phần tử bị hiểu là hai). */
export function isValidElement(key: string, value: unknown): boolean {
  const parsed = whiteboardElementSchema.safeParse(value);
  return parsed.success && parsed.data.id === key;
}
