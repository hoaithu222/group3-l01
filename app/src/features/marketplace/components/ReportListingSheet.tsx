import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';

import type { ListingReportReason } from '../api/marketplace.types';
import { useReportListing } from '../hooks/useReportListing';

const REASONS: { key: ListingReportReason; label: string }[] = [
  { key: 'COPYRIGHT', label: 'Vi phạm bản quyền' },
  { key: 'WRONG_CONTENT', label: 'Nội dung sai/kém chất lượng' },
  { key: 'SPAM', label: 'Spam' },
  { key: 'INAPPROPRIATE', label: 'Không phù hợp' },
  { key: 'OTHER', label: 'Khác' },
];

export interface ReportListingSheetProps {
  listingId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Báo cáo tin niêm yết (app.md §7 "nút Báo cáo luôn hiện"). Tự đóng sau khi gửi thành công.
 * Lý do là chọn MỘT ⇒ chip `role="radio"` trong `radiogroup` (trình đọc màn hình xướng "nút chọn, đã chọn" và biết đây là một nhóm), không
 * phải chip "nút" rời rạc.
 *
 * ✅ "Gửi báo cáo" ở `footer` (đứng yên — trước đây nằm cuối vùng cuộn, bàn phím của ô mô tả che mất). Lỗi gửi hiện ở khe `alert`:
 * ❌ trước đây lỗi bị nuốt (hook không toast lỗi) — nút thôi quay mà không lời nào, người dùng tưởng đã gửi xong.
 */
export function ReportListingSheet({ listingId, onClose, visible }: ReportListingSheetProps) {
  const [reason, setReason] = useState<ListingReportReason | null>(null);
  const [description, setDescription] = useState('');
  const report = useReportListing(listingId);

  const close = () => {
    setReason(null);
    setDescription('');
    report.reset();
    onClose();
  };

  const submit = () => {
    if (!reason) return;
    report.mutate(
      { reason, description: description.trim() || undefined },
      {
        onSuccess: () => {
          hapticSuccess();
          close();
        },
      },
    );
  };

  return (
    <BottomSheet
      alert={
        report.error ? <Alert description={toErrorMessage(report.error)} tone="error" /> : undefined
      }
      description="Cho chúng tôi biết vì sao bạn báo cáo tin này."
      dismissOnBackdrop={!report.isPending}
      footer={
        <Button
          disabled={!reason}
          fullWidth
          label="Gửi báo cáo"
          loading={report.isPending}
          onPress={submit}
        />
      }
      scrollable
      title="Báo cáo tin niêm yết"
      visible={visible}
      onClose={close}
    >
      <View className="gap-md">
        <View
          accessibilityLabel="Lý do báo cáo"
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-xs"
        >
          {REASONS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              role="radio"
              selected={reason === item.key}
              onPress={() => {
                if (reason !== item.key) hapticSelection();
                setReason(item.key);
              }}
            />
          ))}
        </View>
        <Input
          label="Mô tả thêm (không bắt buộc)"
          multiline
          value={description}
          onChangeText={setDescription}
        />
      </View>
    </BottomSheet>
  );
}
