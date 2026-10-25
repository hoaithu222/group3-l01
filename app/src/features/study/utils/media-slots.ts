import type { DraftItem } from './editor-draft';

/**
 * "Ô media" của một mục học: ảnh mặt trước, ảnh mặt sau, âm thanh, ảnh của từng lựa chọn. Mỗi ô có một `scopeKey` riêng
 * trong hàng đợi upload chung (`core/uploads`) — nhờ đó tệp đang tải của ô này không lẫn sang ô khác, và màn soạn biết
 * tệp `READY` nào phải ghi vào MỤC nào (`useEditorMediaSync`).
 */
export type MediaSlot =
  | { kind: 'audio' }
  | { kind: 'back' }
  | { kind: 'front' }
  | { kind: 'option'; optionKey: string };

const ITEM_PREFIX = 'study-item';
const COVER_PREFIX = 'study-cover';
const OPTION_TAG = 'opt.';

function slotId(slot: MediaSlot): string {
  return slot.kind === 'option' ? `${OPTION_TAG}${slot.optionKey}` : slot.kind;
}

/** Tiền tố mọi ô của MỘT bộ — dùng để đếm/huỷ tệp đang tải khi rời trình soạn. */
export function itemScopePrefix(setId: string): string {
  return `${ITEM_PREFIX}:${setId}:`;
}

/**
 * ⚠️ Khoá dùng `:` làm dấu ngăn nên `setId`/`clientItemKey`/`optionKey` KHÔNG được chứa `:` — đúng với id server (ObjectId,
 * `o_xxxxxx`) và id cục bộ (`newLocalId` chỉ sinh chữ, số, `-`).
 */
export function itemSlotScopeKey(setId: string, itemKey: string, slot: MediaSlot): string {
  return `${itemScopePrefix(setId)}${itemKey}:${slotId(slot)}`;
}

export function coverScopeKey(id: string): string {
  return `${COVER_PREFIX}:${id}`;
}

export interface ParsedSlotKey {
  itemKey: string;
  setId: string;
  slot: MediaSlot;
}

export function parseItemSlotScopeKey(scopeKey: string | undefined): ParsedSlotKey | null {
  const parts = scopeKey?.split(':') ?? [];
  if (parts.length !== 4 || parts[0] !== ITEM_PREFIX) return null;
  const [, setId, itemKey, id] = parts as [string, string, string, string];
  if (id === 'front' || id === 'back' || id === 'audio') return { itemKey, setId, slot: { kind: id } };
  if (id.startsWith(OPTION_TAG) && id.length > OPTION_TAG.length) {
    return { itemKey, setId, slot: { kind: 'option', optionKey: id.slice(OPTION_TAG.length) } };
  }
  return null;
}

export function getSlotAsset(item: DraftItem, slot: MediaSlot): string | null {
  switch (slot.kind) {
    case 'front':
      return item.frontMediaAssetId;
    case 'back':
      return item.backMediaAssetId;
    case 'audio':
      return item.audioAssetId;
    default:
      return item.options.find((option) => option.key === slot.optionKey)?.mediaAssetId ?? null;
  }
}

/** Ghi (hoặc gỡ, `null`) asset của một ô. Ô lựa chọn mà lựa chọn đã bị xoá thì bỏ qua — không tạo lại lựa chọn. */
export function setSlotAsset(item: DraftItem, slot: MediaSlot, assetId: string | null): DraftItem {
  switch (slot.kind) {
    case 'front':
      return { ...item, frontMediaAssetId: assetId };
    case 'back':
      return { ...item, backMediaAssetId: assetId };
    case 'audio':
      return { ...item, audioAssetId: assetId };
    default:
      return {
        ...item,
        options: item.options.map((option) =>
          option.key === slot.optionKey ? { ...option, mediaAssetId: assetId } : option,
        ),
      };
  }
}
