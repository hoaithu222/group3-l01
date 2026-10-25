import {
  useForm,
  type UseFormProps,
  type UseFormReturn,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

type ZodSchemaInput = Parameters<typeof zodResolver>[0];

/**
 * Typed wrapper around useForm with zodResolver baked in.
 *
 * RHF v7.71+ exposes three generics on UseFormReturn — `<TFieldValues, TContext,
 * TTransformedValues>`. We force all three so consumer components typed as
 * `UseFormReturn<T>` (which defaults to `<T, any, T>`) accept the return value
 * cleanly. zodResolver in @hookform/resolvers v5 returns
 * `Resolver<FieldValues, any, unknown>` regardless of the schema shape, so the
 * cast pins it to `Resolver<T, unknown, T>` to match useForm's expectations.
 *
 * TContext is `unknown`, not `any`: nothing here ever reads the context object, and
 * `any` in a shared kit2 signature leaks into every form in the app. Consumers that
 * still annotate `UseFormReturn<T>` keep working — their `any` slot swallows ours.
 *
 * Usage:
 *   const schema = z.object({ name: z.string().min(1) });
 *   type Values = z.infer<typeof schema>;
 *   const form = useZodForm<Values>(schema, { defaultValues: { name: '' } });
 */
export function useZodForm<T extends FieldValues>(
  schema: ZodSchemaInput,
  options?: Omit<UseFormProps<T>, 'resolver'>,
): UseFormReturn<T, unknown, T> {
  return useForm<T, unknown, T>({
    ...options,
    resolver: zodResolver(schema) as Resolver<T, unknown, T>,
    /**
     * `onTouched` = báo lỗi ở lần rời ô ĐẦU TIÊN, sau đó kiểm lại theo TỪNG KÝ TỰ.
     *
     * ⛔ KHÔNG dùng `onBlur`: `reValidateMode` (mặc định `onChange`) chỉ có hiệu
     * lực SAU khi form đã submit một lần. Trước đó, `onBlur` nghĩa là chỉ blur
     * mới kiểm lại — người dùng rời ô trống (thấy "Tiêu đề là bắt buộc"), quay
     * vào gõ đầy đủ thì dòng đỏ VẪN NẰM ĐÓ tới khi họ rời ô lần nữa. Nhìn ra như
     * form bị treo lỗi, và đó chính là lỗi đã gặp ở "Lên lịch cuộc họp".
     *
     * `onTouched` KHÔNG làm lỗi hiện sớm hơn `onBlur` — vẫn phải chạm rồi rời ô
     * mới báo, nên không có chuyện vừa mở form đã đỏ lòm.
     */
    mode: options?.mode ?? 'onTouched',
    shouldFocusError: options?.shouldFocusError ?? true,
  });
}
