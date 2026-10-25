import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { showToast } from '@/shared/utils/toast.utils';

import type { ReportReason } from '../../api/recruiter.types';
import {
  JOB_LIMITS,
  REPORT_REASON_LABEL,
  REPORT_REASONS,
} from '../../constants/recruiter.constants';
import { useReportOffer } from '../../queries/offers.mutations';
import { recruiterErrorMessage } from '../../utils/recruiter-errors';

export interface ReportOfferSheetProps {
  offerId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Báo cáo lời mời lạm dụng (app.md §3 "Báo cáo (p1-08)"): đi qua hộp báo cáo chung `POST /reports` với đích `JOB_OFFER` — chỉ quản trị nền tảng xử lý,
 * doanh nghiệp không biết ai báo. Báo cáo lặp trả `alreadyReported`. "Lý do khác" bắt buộc mô tả ≥ 10 ký tự (cùng luật BE). Lỗi hiện TRONG tấm, không toast.
 */
export function ReportOfferSheet({ offerId, onClose, visible }: ReportOfferSheetProps) {
  const report = useReportOffer(offerId);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [description, setDescription] = useState('');
  const tooShort = reason === 'OTHER' && description.trim().length < JOB_LIMITS.reportOtherMin;

  const submit = () =>
    report.mutate(
      { description: description.trim() || undefined, reason },
      {
        onSuccess: (result) => {
          showToast(
            'success',
            result.alreadyReported ? 'Bạn đã báo cáo lời mời này rồi.' : 'Đã gửi báo cáo.',
          );
          setDescription('');
          onClose();
        },
      },
    );

  return (
    <BottomSheet
      // Lỗi máy chủ ghim dưới tiêu đề (khe `alert`) — nằm cuối vùng cuộn thì bàn phím của ô mô tả che mất đúng lúc cần đọc.
      alert={
        report.error ? (
          <Alert description={recruiterErrorMessage(report.error)} tone="error" />
        ) : undefined
      }
      footer={
        <Button
          disabled={tooShort}
          fullWidth
          label="Gửi báo cáo"
          loading={report.isPending}
          variant="danger"
          onPress={submit}
        />
      }
      scrollable
      title="Báo cáo lời mời"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md">
        <RadioGroup
          accessibilityLabel="Lý do báo cáo"
          value={reason}
          onChange={(next) => setReason(next as ReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <View key={value} className="min-h-[44px] justify-center">
              <Radio label={REPORT_REASON_LABEL[value]} value={value} />
            </View>
          ))}
        </RadioGroup>
        <Input
          label={reason === 'OTHER' ? 'Mô tả (bắt buộc)' : 'Mô tả (không bắt buộc)'}
          maxLength={1000}
          message={tooShort ? `Nhập ít nhất ${String(JOB_LIMITS.reportOtherMin)} ký tự` : undefined}
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
