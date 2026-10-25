import { useMediaSlot } from '../../hooks/useMediaSlot';
import { MediaSlot } from './MediaSlot';

export interface ItemMediaSlotProps {
  assetId: string | null;
  compact?: boolean;
  kind: 'audio' | 'image';
  label: string;
  /** Khoá ô trong hàng đợi upload — `itemSlotScopeKey(setId, clientItemKey, slot)`. */
  scopeKey: string;
  onClear: () => void;
}

/**
 * Ô media của MỘT mục: nối `useMediaSlot` (hàng đợi upload theo `scopeKey`) với `MediaSlot`. Tệp READY được ghi vào nháp ở
 * `useEditorMediaSync` (màn soạn) chứ không ở đây — xem lý do ở hook đó. Tách khỏi `MediaSlot` để ô ảnh bìa dùng lại phần
 * vẽ mà vẫn tự giữ được `readyAssetId`.
 */
export function ItemMediaSlot({
  assetId,
  compact,
  kind,
  label,
  onClear,
  scopeKey,
}: ItemMediaSlotProps) {
  const slot = useMediaSlot(scopeKey, kind);
  return (
    <MediaSlot assetId={assetId} compact={compact} label={label} slot={slot} onClear={onClear} />
  );
}
