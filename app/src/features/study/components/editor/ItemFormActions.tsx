import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

import type { DraftItem } from '../../utils/editor-draft';
import { isItemBlank } from '../../utils/editor-row';

export interface ItemFormActionsProps {
  /** Bộ còn chỗ cho mục mới — hết chỗ thì "Thêm tiếp" bị khoá. */
  canAddNext: boolean;
  item: DraftItem;
  /** "Xong": về danh sách (điện thoại) / bỏ chọn (tablet). */
  onDone: () => void;
  /** "Thêm tiếp": thêm mục MỚI cùng dạng ngay sau mục này và mở nó — nhập liên tiếp không phải quay về danh sách. */
  onDoneAndNext: () => void;
  onRemove: () => void;
}

/**
 * Hàng nút cuối form mục: "Xong" · "Thêm tiếp" (nhập liên tiếp) và "Xoá mục" tách riêng một hàng — thao tác phá huỷ không nằm cạnh
 * nút hay bấm. Xoá mục ĐÃ CÓ chữ/đáp án/media thì hỏi lại (nháp chưa lưu, mất là mất thật); mục trống trơn (vừa thêm, chưa gõ gì)
 * xoá luôn — hỏi "xoá không?" cho một ô trống là làm phiền.
 */
export function ItemFormActions({
  canAddNext,
  item,
  onDone,
  onDoneAndNext,
  onRemove,
}: ItemFormActionsProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <View className="gap-xs">
      <View className="flex-row gap-xs">
        <View className="flex-1">
          <Button fullWidth label="Xong" variant="secondary" onPress={onDone} />
        </View>
        <View className="flex-1">
          <Button
            accessibilityLabel="Xong và thêm mục tiếp theo"
            disabled={!canAddNext}
            fullWidth
            label="Thêm tiếp"
            onPress={onDoneAndNext}
          />
        </View>
      </View>
      <Button
        fullWidth
        iconLeft="delete"
        label="Xoá mục"
        variant="danger-secondary"
        onPress={() => (isItemBlank(item) ? onRemove() : setConfirming(true))}
      />
      <Dialog
        description="Mục sẽ bị xoá khỏi bộ khi bạn bấm Lưu. Nội dung đã nhập cho mục này sẽ mất."
        primaryAction={{
          label: 'Xoá mục',
          onPress: () => {
            setConfirming(false);
            onRemove();
          },
        }}
        secondaryAction={{ label: 'Giữ lại', onPress: () => setConfirming(false) }}
        title="Xoá mục này?"
        variant="warning"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}
