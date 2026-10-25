import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { showToast } from '@/shared/utils/toast.utils';

import type { MentorReportReason } from '../api/mentor.types';
import {
  REPORT_OTHER_MIN,
  REPORT_REASON_LABEL,
  REPORT_REASONS,
} from '../constants/mentor.constants';
import { useReportMentorPost } from '../queries/mentor.mutations';
import { mentorErrorMessage } from '../utils/mentor-errors';

export interface ReportPostSheetProps {
  postId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Báo cáo bài (p1-08 — 1 báo cáo/người/bài, lặp lại trả `alreadyReported`). "Lý do khác" bắt buộc mô tả ≥ 10 ký tự (cùng luật
 * BE). Nhiều người báo cáo cùng bài gộp MỘT mục ở hàng đợi quản trị (IR-25). Lỗi hiện trong tấm, không toast.
 */
export function ReportPostSheet({ onClose, postId, visible }: ReportPostSheetProps) {
  const report = useReportMentorPost(postId);
  const [reason, setReason] = useState<MentorReportReason>('SPAM');
  const [description, setDescription] = useState('');
  const tooShort = reason === 'OTHER' && description.trim().length < REPORT_OTHER_MIN;

  const submit = () =>
    report.mutate(
      { description: description.trim() || undefined, reason },
      {
        onSuccess: (result) => {
          showToast(
            'success',
            result.alreadyReported ? 'Bạn đã báo cáo bài này rồi.' : 'Đã gửi báo cáo.',
          );
          setDescription('');
          onClose();
        },
      },
    );

  return (
    <BottomSheet
      // Lỗi server đứng yên dưới tiêu đề — cuối thân cuộn (sau danh sách lý do + ô mô tả) là chỗ khuất nhất của tấm.
      alert={
        report.error ? (
          <Alert description={mentorErrorMessage(report.error)} tone="error" />
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
      title="Báo cáo bài đăng"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md py-xs">
        <RadioGroup
          accessibilityLabel="Lý do báo cáo"
          value={reason}
          onChange={(next) => setReason(next as MentorReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <View key={value} className="min-h-11 justify-center">
              <Radio label={REPORT_REASON_LABEL[value]} value={value} />
            </View>
          ))}
        </RadioGroup>
        <Input
          label={reason === 'OTHER' ? 'Mô tả (bắt buộc)' : 'Mô tả (không bắt buộc)'}
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
