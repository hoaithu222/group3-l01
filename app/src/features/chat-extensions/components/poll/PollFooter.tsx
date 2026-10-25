import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

export interface PollFooterProps {
  voterCount: number;
  /** Có nút "Xem người bầu" (khảo sát KHÔNG ẩn danh và đã có người bầu). Ẩn danh: không có nút — chữ "Ẩn danh" ở dòng thông tin nói lý do. */
  canViewVoters: boolean;
  /** Có nút "Kết thúc khảo sát" (người tạo/moderator, khảo sát còn mở). */
  canClose: boolean;
  closing: boolean;
  onViewVoters: () => void;
  onClose: () => void;
}

/** Dòng "N người đã bầu" + hai hành động phụ của thẻ khảo sát. Kết thúc là việc KHÔNG hoàn tác, ảnh hưởng mọi người ⇒ có hộp thoại xác nhận. */
export function PollFooter({ voterCount, canViewVoters, canClose, closing, onViewVoters, onClose }: PollFooterProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <View className="gap-2xs">
      <Text className="text-caption-sm text-fg-2">
        {voterCount === 0 ? 'Chưa có ai bầu' : `${voterCount} người đã bầu`}
      </Text>
      {canViewVoters || canClose ? (
        <View className="flex-row flex-wrap gap-xs">
          {canViewVoters ? (
            <Button label="Xem người bầu" size="sm" variant="tertiary" onPress={onViewVoters} />
          ) : null}
          {canClose ? (
            <Button
              label="Kết thúc khảo sát"
              loading={closing}
              size="sm"
              variant="secondary"
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </View>
      ) : null}

      <Dialog
        description="Mọi người sẽ không bầu thêm được nữa. Không thể hoàn tác."
        primaryAction={{
          label: 'Kết thúc',
          onPress: () => {
            setConfirming(false);
            onClose();
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title="Kết thúc khảo sát này?"
        variant="warning"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}
