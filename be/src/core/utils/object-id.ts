import { randomBytes } from "crypto";

/**
 * Sinh 1 ObjectId hex (24 ký tự) hợp lệ để dùng làm `id` client-side TRƯỚC
 * khi ghi vào Mongo (Prisma chấp nhận `id` tường minh khi field là
 * `@id @default(auto()) @map("_id") @db.ObjectId`). Cần cho asset: `storageKey`
 * nhúng `assetId` nên phải biết id TRƯỚC khi tạo bản ghi (be.md p0-05 §5.1).
 *
 * Không theo đúng cấu trúc ObjectId thật (4 byte timestamp + 5 byte máy/tiến
 * trình + 3 byte đếm) — chỉ cần đúng khuôn dạng 24 hex để Mongo/Prisma chấp
 * nhận, giống `InMemoryAssetRepository.nextId()` đã dùng trước đây.
 */
export function newObjectId(): string {
  return randomBytes(12).toString("hex");
}
