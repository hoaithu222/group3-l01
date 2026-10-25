export { AccountCard } from './AccountCard';
export type { AccountCardProps } from './AccountCard';

export { Card } from './Card';
export type { CardProps } from './Card';

export { MediaCard } from './MediaCard';
export type { MediaCardProps } from './MediaCard';

/**
 * ⚠️ `Thumbnail` là ô ảnh TRẦN, `MediaCard` là cái thẻ có ảnh. Chọn theo việc
 * có CHỮ hay không: `MediaCard` bắt buộc `title` và dựng cả một `Card` bao
 * ngoài, nên banner đầu màn (`Image view / Placeholder`, 9 lần trong bản vẽ)
 * phải dùng `Thumbnail` — nếu không sẽ có một khối chữ rỗng dưới mỗi banner.
 */
export { Thumbnail } from './Thumbnail';
export type { ThumbnailProps } from './Thumbnail';

/**
 * Bảng tỉ lệ ảnh cũng xuất ra ngoài: màn hình nào tự dựng lưới ảnh (banner
 * `SliderDot`, ô giữ chỗ lúc tải) thì lấy ĐÚNG con số của nhóm này thay vì gõ
 * lại `343 / 192` — đó là cách hai chỗ lệch nhau sau một lần đổi bản vẽ.
 */
export { MEDIA_ASPECT_RATIO } from './media-card.styles';
export type { MediaCardAspect } from './media-card.styles';
