import { Text, View } from 'react-native';

import type { DraftItem } from '../../utils/editor-draft';
import { itemSlotScopeKey, setSlotAsset, type MediaSlot } from '../../utils/media-slots';
import { ItemMediaSlot } from './ItemMediaSlot';

export interface ItemMediaFieldsProps {
  item: DraftItem;
  setId: string;
  onChange: (update: (item: DraftItem) => DraftItem) => void;
}

/**
 * Ảnh + âm thanh của một mục (BE `frontMediaAssetId` · `backMediaAssetId` · `audioAssetId`): ảnh mặt trước (thẻ ghi nhớ) hoặc
 * ảnh cho câu hỏi (loại khác), ảnh mặt sau CHỈ cho thẻ ghi nhớ, và một âm thanh cho mọi loại. Ảnh của từng lựa chọn nằm ở
 * `ChoiceFields` (cạnh lựa chọn nó thuộc về).
 *
 * ⚠️ Mục đã có ảnh mặt sau mà đổi sang loại khác vẫn hiện ô đó: BE ghi ĐÈ toàn bộ nội dung mục khi lưu, nên giấu ô đi là
 * để lại một ảnh vô hình mà người dùng không gỡ được.
 */
export function ItemMediaFields({ item, onChange, setId }: ItemMediaFieldsProps) {
  const flashcard = item.type === 'FLASHCARD';
  const keyOf = (slot: MediaSlot) => itemSlotScopeKey(setId, item.clientItemKey, slot);
  const clear = (slot: MediaSlot) => () => onChange((current) => setSlotAsset(current, slot, null));

  return (
    <View className="gap-md">
      <Text className="text-label-md font-semibold text-fg-1">
        Hình ảnh và âm thanh (không bắt buộc)
      </Text>
      <ItemMediaSlot
        assetId={item.frontMediaAssetId}
        kind="image"
        label={flashcard ? 'Ảnh mặt trước' : 'Ảnh cho câu hỏi'}
        scopeKey={keyOf({ kind: 'front' })}
        onClear={clear({ kind: 'front' })}
      />
      {flashcard || item.backMediaAssetId ? (
        <ItemMediaSlot
          assetId={item.backMediaAssetId}
          kind="image"
          label="Ảnh mặt sau"
          scopeKey={keyOf({ kind: 'back' })}
          onClear={clear({ kind: 'back' })}
        />
      ) : null}
      <ItemMediaSlot
        assetId={item.audioAssetId}
        kind="audio"
        label="Âm thanh"
        scopeKey={keyOf({ kind: 'audio' })}
        onClear={clear({ kind: 'audio' })}
      />
    </View>
  );
}
