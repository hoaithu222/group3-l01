import { z } from "zod";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";

/** Múi giờ IANA (`Asia/Ho_Chi_Minh`) — kiểm bằng `Intl` (`isValidIanaTimeZone`), không danh sách tay; sai → 400 `VAL_001`. */
export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .refine((tz) => isValidIanaTimeZone(tz), "Múi giờ IANA không hợp lệ (vd Asia/Ho_Chi_Minh)");
