import { Prisma } from "@prisma/client";

/**
 * Vi phạm unique index do ĐUA GHI (P2002 ở Prisma) — repository đổi thành lỗi miền này để service không phụ thuộc Prisma.
 * ⚠️ Trong transaction Mongo, P2002 làm tx đã HỎNG: service KHÔNG được bắt rồi chạy tiếp trong cùng `tx.run` — phải để lỗi thoát
 * khỏi callback (rollback), bắt Ở NGOÀI rồi xử lý (đọc lại hàng thắng cuộc, trả kết quả cũ…).
 */
export class UniqueViolationError extends Error {
  constructor(readonly key: string) {
    super(`Vi phạm unique: ${key}`);
    this.name = "UniqueViolationError";
  }
}

export function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
