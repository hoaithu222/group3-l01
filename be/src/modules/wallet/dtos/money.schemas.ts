import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";

/** Số tiền nguyên đồng dương, trần cứng `LIMITS.wallet.expenseMax` (service có thể siết thêm theo runtime config). */
export const moneySchema = z.number().int().min(1).max(LIMITS.wallet.expenseMax);

export const categorySchema = z.enum(LIMITS.wallet.categories);

/** Cron dạng "m h * * d" (phút giờ thứ) — chỉ lịch hằng tuần, đủ cho nhắc nợ định kỳ. */
export const weeklyCronSchema = z
  .string()
  .trim()
  .regex(/^([0-5]?\d) ([01]?\d|2[0-3]) \* \* ([0-6])$/, "Lịch nhắc phải có dạng phút giờ * * thứ");

/** IANA timezone hợp lệ (kiểm bằng `Intl`). */
export const ianaTzSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Múi giờ không hợp lệ");
