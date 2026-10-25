import { z } from 'zod';

import { JOIN_REQUEST_MESSAGE_MAX } from '../api/invitations.constants';

/**
 * Form "Tham gia nhóm" từ link mời (p3-04): chỉ MỘT ô, TUỲ CHỌN — lời nhắn cho quản trị viên, dùng khi nhóm cần duyệt thành viên mới.
 * Khớp `acceptInviteSchema` của BE (`requestMessage` ≤ 500; rỗng = không gửi). `.trim()` vì bàn phím di động tự chèn dấu cách sau gợi ý,
 * và BE đếm 500 trên chuỗi THÔ — cắt ở client chỉ làm chuỗi ngắn đi, không bao giờ vượt. Ô trống HỢP LỆ (không có `.min`): người dùng
 * không bị ép viết gì mới vào được nhóm.
 */
export const joinRequestSchema = z.object({
  requestMessage: z
    .string()
    .trim()
    .max(JOIN_REQUEST_MESSAGE_MAX, `Lời nhắn tối đa ${JOIN_REQUEST_MESSAGE_MAX} ký tự`),
});
export type JoinRequestFormValues = z.infer<typeof joinRequestSchema>;
