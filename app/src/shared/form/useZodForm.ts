import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

/**
 * `useForm` của react-hook-form đã nối sẵn với một schema Zod.
 *
 * Kiểu của form được SUY RA từ schema, nên không có chỗ nào để hai bên lệch
 * nhau: thêm một trường vào schema là TypeScript đòi xử lý nó ở form ngay.
 *
 * ── Hai tham số kiểu, không phải một ─────────────────────────────────────────
 * `TInput` là dữ liệu người dùng GÕ VÀO, `TOutput` là dữ liệu SAU khi Zod biến
 * đổi. Hai thứ này khác nhau thật, và schema ở đây có ví dụ: `email` khai
 * `.trim().toLowerCase()`, nên ô nhập giữ `" A@B.COM "` còn `handleSubmit` nhận
 * `"a@b.com"`. Gộp làm một kiểu thì hoặc ô nhập bị ép kiểu sai, hoặc phần biến
 * đổi bị bỏ qua khi kiểm kiểu.
 *
 * ── `mode: 'onTouched'` — chọn có lý do ──────────────────────────────────────
 * Trên di động, thời điểm hiện lỗi quan trọng hơn hẳn trên web:
 *
 *   · `onChange`  — báo "Email không đúng định dạng" ngay từ ký tự đầu tiên, khi
 *                   người dùng còn đang gõ dở. Đọc ra như bị mắng.
 *   · `onSubmit`  — người dùng gõ hết form, bấm gửi, rồi mới biết ô đầu tiên
 *                   sai. Trên màn hình nhỏ, ô đó có thể đã cuộn khuất.
 *   · `onTouched` — báo khi người dùng RỜI ô. Đúng nhịp: họ đã gõ xong ô đó và
 *                   đang chuyển sang ô kế.
 *
 * `reValidateMode: 'onChange'` để sau khi một lỗi đã hiện, nó biến mất NGAY lúc
 * người dùng sửa đúng — không phải rời ô lần nữa mới biết mình đã sửa được.
 */
export function useZodForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  options?: Omit<UseFormProps<TInput, unknown, TOutput>, 'resolver'>,
): UseFormReturn<TInput, unknown, TOutput> {
  return useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    ...options,
  });
}
