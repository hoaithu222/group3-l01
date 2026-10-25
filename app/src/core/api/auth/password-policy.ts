import { z } from 'zod';

/**
 * Luật mật khẩu MỚI — MỘT nguồn cho mọi form ĐẶT mật khẩu (đăng ký, đặt lại, đổi mật khẩu).
 *
 * ⚠️ Nằm ở `core/api/auth` chứ không ở một feature: `features/auth` và `features/me` đều cần đúng
 * luật này mà KHÔNG được nhập chéo nhau (`docs/rules/feature-structure.md`) — bản chép ở mỗi nơi
 * sẽ lệch nhau ở lần đổi luật kế tiếp, và người dùng thấy cùng một mật khẩu qua form này mà rớt ở
 * form kia.
 *
 * Trần 128 khớp BE (`newPasswordSchema`): BE chặn payload dài hơn bằng 400 — chặn ở client để
 * người dùng thấy câu tiếng Việt cạnh ô nhập thay vì lỗi kiểm định chung của máy chủ. Luật chữ
 * hoa/thường/số CHẶT HƠN BE (BE chỉ đòi ≥ 8 ký tự, có chữ cái và chữ số) — chủ ý của base, nên
 * PHẢI được nói ra TRƯỚC khi gõ (`PASSWORD_RULE_HINT`), không để người dùng đoán qua từng lần
 * báo lỗi.
 *
 * ⛔ KHÔNG dùng cho ô mật khẩu ĐĂNG NHẬP: người dùng cũ có thể có mật khẩu đặt từ trước khi luật
 * này ra đời, và chặn ở client là họ không vào được chính tài khoản của mình.
 */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULE_HINT = 'Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.';

export const newPasswordSchema = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`)
  .regex(/[a-z]/, 'Mật khẩu phải có ít nhất 1 chữ thường')
  .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
  .regex(/\d/, 'Mật khẩu phải có ít nhất 1 chữ số');
