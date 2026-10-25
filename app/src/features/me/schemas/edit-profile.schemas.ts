import { z } from 'zod';

import { isEmptyOrValidPhone } from '@/shared/utils/phone.utils';

import {
  DISPLAY_NAME_MAX_LENGTH,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  PHONE_INVALID_MESSAGE,
} from '../constants/edit-profile.messages';

/**
 * Schema của màn "Sửa hồ sơ" — `name` khớp `updateUserSchema.name` của BE (1–80 ký tự sau `trim`); `phone` để trống = XOÁ số
 * (BE nhận `null`), có giá trị thì phải chuẩn hoá được thành E.164 theo đúng luật của BE (`shared/utils/phone.utils.ts`, đồng
 * bộ với `be/src/core/utils/phone.ts`) — client báo "hợp lệ" mà BE từ chối 400 là lệch luật, phải sửa cả hai phía.
 *
 * ⚠️ Giữ `phone` là CHUỖI (kể cả rỗng), không `transform` sang `string | null`: ô nhập là chuỗi, và việc đổi "rỗng ⇒ null" +
 * chuẩn hoá E.164 nằm ở `useEditProfile` cùng chỗ so với giá trị đang lưu.
 */
export const editProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, NAME_REQUIRED_MESSAGE)
    .max(DISPLAY_NAME_MAX_LENGTH, NAME_TOO_LONG_MESSAGE),
  phone: z.string().trim().refine(isEmptyOrValidPhone, { message: PHONE_INVALID_MESSAGE }),
});

export type EditProfileFormValues = z.infer<typeof editProfileSchema>;
