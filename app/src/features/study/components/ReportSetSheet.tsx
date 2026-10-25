import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { showToast } from '@/shared/utils/toast.utils';

import { REPORT_REASONS, type ReportReason } from '../api/study.types';
import { REPORT_OTHER_MIN, REPORT_REASON_LABELS } from '../constants/study.constants';
import { useReportSet } from '../queries/study-sets.queries';

export interface ReportSetSheetProps {
  setId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Báo cáo bộ học (app.md p4-01 §2 `ReportSetSheet`, be.md §14: 1 báo cáo/người/bộ; lặp lại trả `alreadyReported`).
 * "Lý do khác" bắt buộc mô tả ≥ 10 ký tự — cùng luật `reportSetSchema` của BE. Lỗi (429 `MOD_006`…) hiện NGAY TRONG
 * tấm, không toast (người dùng còn đang điền).
 */
export function ReportSetSheet({ onClose, setId, visible }: ReportSetSheetProps) {
  const report = useReportSet(setId);
  const [reason, setReason] = useState<ReportReason>('INAPPROPRIATE');
  const [description, setDescription] = useState('');

  const needsDescription = reason === 'OTHER';
  const tooShort = needsDescription && description.trim().length < REPORT_OTHER_MIN;

  function submit(): void {
    report.mutate(
      { description: description.trim() || undefined, reason },
      {
        onSuccess: (result) => {
          showToast(
            'success',
            result.alreadyReported ? 'Bạn đã báo cáo bộ này rồi.' : 'Đã gửi báo cáo.',
          );
          setDescription('');
          onClose();
        },
      },
    );
  }

  return (
    <BottomSheet
      // ✅ Lỗi máy chủ ở khe `alert` (đứng yên dưới tiêu đề), nút gửi ở `footer` (không cuộn). ❌ Bản trước để cả hai CUỐI thân cuộn:
      // ở máy thấp/cỡ chữ lớn, người dùng phải cuộn hết lý do + ô mô tả mới thấy nút "Gửi báo cáo" và lỗi 429.
      alert={
        report.error ? <Alert description={toErrorMessage(report.error)} tone="error" /> : undefined
      }
      footer={
        <Button
          disabled={tooShort}
          fullWidth
          label="Gửi báo cáo"
          loading={report.isPending}
          onPress={submit}
        />
      }
      scrollable
      title="Báo cáo bộ học"
      visible={visible}
      onClose={onClose}
    >
      {/* ⛔ Không `pb-md` ở đây: vùng `footer` ngay dưới đã có khe riêng — cộng thêm là dải trắng thừa trên nút. */}
      <View className="gap-md">
        <RadioGroup
          accessibilityLabel="Lý do báo cáo"
          value={reason}
          onChange={(next) => setReason(next as ReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <View key={value} className="min-h-[44px] justify-center">
              <Radio label={REPORT_REASON_LABELS[value]} value={value} />
            </View>
          ))}
        </RadioGroup>

        <Input
          label={needsDescription ? 'Mô tả (bắt buộc)' : 'Mô tả (không bắt buộc)'}
          maxLength={1000}
          message={tooShort ? `Nhập ít nhất ${REPORT_OTHER_MIN} ký tự` : undefined}
          messageTone="error"
          multiline
          placeholder="Ghi rõ lý do để chúng tôi xử lý nhanh hơn"
          value={description}
          onChangeText={setDescription}
        />
      </View>
    </BottomSheet>
  );
}
