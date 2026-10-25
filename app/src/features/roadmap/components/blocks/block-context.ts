import { createContext, useContext } from 'react';

import type { Block, RoadmapMediaDto } from '../../api/roadmap.types';

export interface BlockMediaContextValue {
  mediaById: Readonly<Record<string, RoadmapMediaDto>>;
  /** Media của buổi đang tải — ô ảnh hiện khung xương thay vì "không tìm thấy ảnh" rồi nhảy bố cục. */
  mediaLoading: boolean;
  /** Khối ảnh vẽ LỚN (lần nhắc đầu) — xem `primaryImageBlocks`. Khối ảnh không có trong tập này vẽ dạng dòng gọn. */
  primaryImages: ReadonlySet<Block>;
  /** Chạm hình → màn xem toàn màn (phóng to). Bỏ trống ⇒ hình chỉ để xem (vd tấm ghi chú của tab Tài liệu). */
  onOpenMedia?: (mediaId: string) => void;
}

const EMPTY: BlockMediaContextValue = { mediaById: {}, mediaLoading: false, primaryImages: new Set() };

/**
 * Media của buổi cho cây `BlockList` đệ quy.
 *
 * ⚠️ Context thay vì prop: `BlockList` tự gọi lại chính nó cho danh sách/trích dẫn/khối thu gọn (xem `BlockList.tsx`), mỗi
 * tầng phải chuyền tay bốn thứ chỉ `ImageBlock` dùng — quên chuyền ở một tầng là ảnh trong danh sách lặng lẽ thành "không
 * tìm thấy". Không có Provider (tấm ghi chú NOTE) ⇒ giá trị rỗng, ảnh hiện ô "không tìm thấy" như cũ.
 */
export const BlockMediaContext = createContext<BlockMediaContextValue>(EMPTY);

export function useBlockMedia(): BlockMediaContextValue {
  return useContext(BlockMediaContext);
}
