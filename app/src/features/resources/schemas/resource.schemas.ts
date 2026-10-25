import { z } from 'zod';

/**
 * Tên thư mục/tệp — khớp `be.md` p3-01 §3 (`z.string().trim().min(1).max(N)`).
 * `.trim()` bắt buộc: bàn phím di động tự chèn dấu cách sau gợi ý, và BE
 * chuẩn hoá tên (`normalizedName`) nên "Slide " với "Slide" sẽ đụng `RSC_002`.
 */
export function nameSchema(max: number, subject: 'tệp' | 'thư mục') {
  return z
    .string()
    .trim()
    .min(1, `Nhập tên ${subject}`)
    .max(max, `Tên ${subject} tối đa ${max} ký tự`);
}

/** Lỗi ĐẦU TIÊN của một lượt kiểm, hoặc `undefined` khi hợp lệ. */
export function firstNameError(
  schema: ReturnType<typeof nameSchema>,
  value: string,
): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
