import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import type { ReportRequest } from '@/shared/stores/moderation-intent.store';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';

import { REPORT_LIMITS } from '../constants/moderation.constants';
import { useReportForm } from '../hooks/useReportForm';
import { useRetainedRequest } from '../hooks/useRetainedRequest';
import { ReportReasonList } from './ReportReasonList';
import { ReportReceipt } from './ReportReceipt';

/** Tiêu đề theo đích (app.md p1-08 §3): "Báo cáo tin nhắn" · "Báo cáo {tên}" · "Báo cáo kênh" · "Báo cáo nhóm chat". */
export function reportTitle(request: ReportRequest): string {
  switch (request.targetType) {
    case 'MESSAGE':
      return 'Báo cáo tin nhắn';
    case 'USER':
      return request.name ? `Báo cáo ${request.name}` : 'Báo cáo người dùng';
    case 'CHANNEL':
      return 'Báo cáo kênh';
    case 'CONVERSATION':
      return 'Báo cáo nhóm chat';
  }
}

export interface ReportSheetProps {
  onClose: () => void;
  /** `null` = đóng. Tấm giữ nội dung của yêu cầu cuối cùng trong lúc trượt xuống. */
  request: ReportRequest | null;
}

/**
 * Tấm Báo cáo DÙNG CHUNG (p1-08 #7) — mở từ menu tin (`chat`), thẻ thành viên (`members`), thông tin kênh
 * (`channels`), thông tin hội thoại (`conversations`) qua `useModerationActions` + `ModerationHost`, nên
 * các feature đó không import `moderation`.
 */
export function ReportSheet({ onClose, request }: ReportSheetProps) {
  const { retained, session } = useRetainedRequest(request);
  if (!retained) return null;
  return (
    <ReportSheetBody
      key={session}
      request={retained}
      visible={request !== null}
      onClose={onClose}
    />
  );
}

interface ReportSheetBodyProps {
  onClose: () => void;
  request: ReportRequest;
  visible: boolean;
}

function ReportSheetBody({ onClose, request, visible }: ReportSheetBodyProps) {
  const form = useReportForm(request);
  const isOffline = useConnectionState() === 'offline';
  const isOther = form.reason === 'OTHER';
  const descriptionTooShort =
    isOther && form.description.trim().length > 0 && form.descriptionError !== undefined;

  return (
    <BottomSheet
      // Lỗi của CẢ tấm đứng yên dưới tiêu đề (không cuộn mất theo danh sách lý do); câu dẫn là mô tả tấm, không phải đoạn đầu thân.
      alert={
        !form.outcome && form.errorMessage ? (
          <Alert description={form.errorMessage} tone="error" />
        ) : undefined
      }
      description={
        form.outcome
          ? undefined
          : 'Chọn lý do phù hợp nhất. Người bị báo cáo không biết ai đã báo cáo.'
      }
      dismissOnBackdrop={!form.isSubmitting}
      footer={
        form.outcome ? (
          <Button fullWidth label="Xong" onPress={onClose} />
        ) : (
          // Mất mạng: nút khoá + dòng nhắc NGAY TRÊN nút (không còn là chữ xám lạc ở cuối thân tấm).
          <SheetActions
            hint={isOffline ? 'Kết nối lại để gửi.' : undefined}
            primary={{
              disabled: !form.canSubmit || isOffline,
              label: 'Gửi báo cáo',
              loading: form.isSubmitting,
              onPress: () => void form.submit(),
            }}
          />
        )
      }
      scrollable
      title={reportTitle(request)}
      visible={visible}
      onClose={onClose}
    >
      {form.outcome ? (
        <ReportReceipt outcome={form.outcome} />
      ) : (
        <View className="gap-md">
          <ReportReasonList
            disabled={form.isSubmitting}
            value={form.reason}
            onChange={form.setReason}
          />

          {form.reason ? (
            <Input
              disabled={form.isSubmitting}
              hint={`${String(form.description.length)}/${String(REPORT_LIMITS.descriptionMax)}`}
              label="Mô tả"
              maxLength={REPORT_LIMITS.descriptionMax}
              message={
                descriptionTooShort
                  ? form.descriptionError
                  : isOther
                    ? `Bắt buộc khi chọn "Khác" (ít nhất ${String(REPORT_LIMITS.otherDescriptionMin)} ký tự)`
                    : undefined
              }
              messageTone={descriptionTooShort ? 'error' : 'hint'}
              multiline
              placeholder={isOther ? 'Mô tả điều bạn thấy' : 'Thêm chi tiết (không bắt buộc)'}
              required={isOther}
              value={form.description}
              onChangeText={form.setDescription}
            />
          ) : null}

          {form.canBlock ? (
            <View className="gap-3xs">
              <Checkbox
                checked={form.alsoBlock}
                disabled={form.isSubmitting}
                label={
                  request.targetType === 'MESSAGE'
                    ? 'Chặn người gửi tin nhắn này'
                    : 'Chặn người này'
                }
                onChange={form.setAlsoBlock}
              />
              <Text className="pl-8 text-caption-sm text-fg-2">
                Hai bên không nhắn tin 1-1 cho nhau; tin của họ trong nhóm được thu gọn. Họ không
                được báo.
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
