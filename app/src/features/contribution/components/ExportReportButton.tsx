import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Toggle } from '@/shared/ui/toggle';

import type { PeriodKey } from '../api/contribution.types';
import { useRetryCountdown } from '../hooks/useRetryCountdown';
import { useCreateExport } from '../queries/export.queries';
import { contributionErrorMessage, retryAfterSeconds } from '../utils/contribution-errors';
import { periodLabel } from '../utils/period-labels';

export interface ExportReportButtonProps {
  boardId: string;
  /** Kỳ đang xem — báo cáo xuất đúng kỳ này. */
  period: PeriodKey;
  /** Khoá khi offline (không gửi được yêu cầu). */
  disabled: boolean;
  /** Đã có `exportId` (mới tạo hoặc bản READY cùng dữ liệu) — màn ghi vào URL và hiện banner theo dõi. */
  onCreated: (exportId: string) => void;
}

/**
 * Nút "Xuất báo cáo PDF" ở thanh tiêu đề + tấm chọn (app.md §3 "Xuất PDF"): kỳ đang xem, có/không kèm biểu đồ hoạt động → `POST …/contribution/export`. Thành công
 * (`202` đang tạo, hoặc `200` bản READY cùng dữ liệu) → đóng tấm, màn hiện `ExportStatusBanner`. Quá 5 lần/giờ (`429`) → đếm ngược và khoá nút tới hết chờ.
 * PDF là bản CHỤP dữ liệu lúc xuất (kèm mã xác thực + mã băm) — server giữ tệp 30 ngày.
 */
export function ExportReportButton({
  boardId,
  period,
  disabled,
  onCreated,
}: ExportReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [includeHeatmap, setIncludeHeatmap] = useState(true);
  const create = useCreateExport(boardId);
  const wait = useRetryCountdown(retryAfterSeconds(create.error));

  const submit = async () => {
    try {
      const ref = await create.mutateAsync({ includeHeatmap, period });
      setOpen(false);
      onCreated(ref.exportId);
    } catch {
      // Lỗi nằm ở `create.error` — tấm tự hiện, không toast (toast tắt sau vài giây còn tấm vẫn mở).
    }
  };

  const close = () => {
    create.reset();
    setOpen(false);
  };

  return (
    <>
      <Button
        accessibilityLabel="Xuất báo cáo PDF"
        disabled={disabled}
        iconLeft="document"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => setOpen(true)}
      />
      {/* ✅ Nút "Tạo báo cáo" ở `footer` + `fullWidth` (trước đây là viên thuốc nhỏ dạt trái cuối thân tấm), lỗi/đếm ngược ở khe
          `alert` (ghim dưới mô tả, không lẫn vào nội dung). */}
      <BottomSheet
        alert={
          create.isError ? (
            <Alert
              description={
                wait > 0
                  ? `Bạn đã xuất quá nhiều lần. Thử lại sau ${wait} giây.`
                  : contributionErrorMessage(create.error)
              }
              tone="warning"
            />
          ) : undefined
        }
        description={`Kỳ: ${periodLabel(period)}`}
        footer={
          <Button
            disabled={wait > 0}
            fullWidth
            label={wait > 0 ? `Thử lại sau ${wait} giây` : 'Tạo báo cáo'}
            loading={create.isPending}
            onPress={() => void submit()}
          />
        }
        title="Xuất báo cáo PDF"
        visible={open}
        onClose={close}
      >
        <View className="gap-md">
          <Text className="text-body-md text-fg-2">
            Tệp PDF chụp số liệu tại thời điểm xuất, kèm mã xác thực để đối chiếu, được giữ 30 ngày.
          </Text>
          <Toggle
            label="Kèm biểu đồ hoạt động"
            value={includeHeatmap}
            onChange={setIncludeHeatmap}
          />
        </View>
      </BottomSheet>
    </>
  );
}
