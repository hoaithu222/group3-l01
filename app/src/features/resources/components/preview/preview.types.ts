import type { ResourceDto, ResourceUrlVariant } from '../../api';

/** Props chung của mọi khung xem trước — màn cha lo tải/chia sẻ/mở ngoài, khung con chỉ gọi. */
export interface PreviewProps {
  onDownload: () => void;
  onOpenExternal: () => void;
  resource: ResourceDto;
  /** Biến thể URL cần xin (`original` / `preview` cho bản PDF đã chuyển). */
  variant: ResourceUrlVariant;
}
