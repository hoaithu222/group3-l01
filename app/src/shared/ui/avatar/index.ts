/**
 * Barrel của nhóm `avatar`.
 *
 * ⛔ Không tự gom vào `src/shared/ui/index.ts` — barrel tổng do người điều phối
 * viết sau khi gom hết các nhóm.
 */
export { Avatar } from './Avatar';
export type { AvatarProps } from './Avatar';

/** Avatar + khung màu vật phẩm hồ sơ đang trang bị (p7-02 chợ xu) — dùng ở mọi nơi hiện avatar hồ sơ (hồ sơ công khai, người bán trên chợ…). */
export { AvatarWithFrame, parseAvatarFrameToken } from './AvatarWithFrame';
export type { AvatarFrameToken, AvatarWithFrameProps } from './AvatarWithFrame';

/**
 * Kiểu biến thể nằm cùng chỗ với công thức style (cùng khuôn với `button`):
 * bảng biến thể là NGUỒN của kiểu, để hai nơi thì thêm một cỡ mới là quên một chỗ.
 */
export type { AvatarBadgeTone, AvatarShape, AvatarSize } from './avatar.styles';

/**
 * Xuất kèm vì nơi gọi cũng cần chữ viết tắt ở chỗ KHÔNG có avatar — nhãn tài
 * khoản trong danh sách chọn nhanh, chữ lồng trên thẻ. Có sẵn thì không ai
 * viết lại một bản `name.split(' ')` làm rơi dấu tiếng Việt.
 */
export { getInitials } from './initials';
