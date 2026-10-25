import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { showToast } from '@/shared/utils/toast.utils';

import type { ContributionExport, PeriodKey } from '../api/contribution.types';
import { useOpenExportPdf } from '../hooks/useOpenExportPdf';
import { useCreateExport, useExportStatus } from '../queries/export.queries';
import { contributionErrorMessage, isAccessLost, isExportExpired } from '../utils/contribution-errors';
import { periodLabel } from '../utils/period-labels';
import { formatDateIn } from '../utils/zoned-format';

export interface ExportStatusBannerProps {
  boardId: string;
  exportId: string;
  /** Kỳ đang xem — dùng khi phải "Xuất lại" mà chưa biết kỳ của lượt cũ (lượt đã hết hạn ngay từ lần tải đầu). */
  period: PeriodKey;
  timezone: string;
  onDismiss: () => void;
  /** "Thử lại"/"Xuất lại" tạo lượt MỚI — màn đổi `exportId` sang lượt đó. */
  onReplace: (exportId: string) => void;
}

function readyDescription(data: ContributionExport, timezone: string): string {
  return `Kỳ ${periodLabel(data.periodKey)} · Mã xác thực ${data.verifyCode} · Hết hạn ${formatDateIn(data.expiresAt, timezone)}`;
}

/**
 * Trạng thái lượt xuất PDF đang theo dõi (`?exportId=`, app.md §3): Đang tạo… (hỏi lại mỗi 5 giây, dừng khi xong) · Sẵn sàng + "Mở PDF" (xin URL ký NGAY LÚC BẤM)
 * · Lỗi + "Thử lại" · Hết hạn (410 `CONTRIB_005`) + "Xuất lại". Thông báo `contribution.export-ready|failed` đưa người dùng về đúng màn này. Chữ + nút, không chỉ màu.
 */
export function ExportStatusBanner({ boardId, exportId, period, timezone, onDismiss, onReplace }: ExportStatusBannerProps) {
  const status = useExportStatus(exportId);
  const open = useOpenExportPdf();
  const create = useCreateExport(boardId);
  const data = status.data;

  const again = async () => {
    try {
      const ref = await create.mutateAsync({ includeHeatmap: data?.includeHeatmap ?? true, period: data?.periodKey ?? period });
      onReplace(ref.exportId);
    } catch (error) {
      showToast('error', contributionErrorMessage(error));
    }
  };
  const againButton = (label: string) => <Button label={label} loading={create.isPending} size="xs" variant="secondary" onPress={() => void again()} />;

  if (isExportExpired(status.error) || data?.status === 'EXPIRED') {
    return <Alert actions={againButton('Xuất lại')} description="Tệp báo cáo được giữ 30 ngày nên đã hết hạn." title="Tệp đã hết hạn" tone="warning" onClose={onDismiss} />;
  }
  if (status.isError && !data) {
    return isAccessLost(status.error) ? (
      <Alert description="Báo cáo này không còn khả dụng hoặc bạn không có quyền xem." title="Không mở được báo cáo" tone="error" onClose={onDismiss} />
    ) : (
      <Alert
        actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={() => void status.refetch()} />}
        description={contributionErrorMessage(status.error)}
        title="Không kiểm tra được báo cáo"
        tone="error"
        onClose={onDismiss}
      />
    );
  }
  if (!data) return <Alert description="Đang kiểm tra trạng thái báo cáo…" tone="info" />;
  if (data.status === 'FAILED') {
    return <Alert actions={againButton('Thử lại')} description="Có lỗi khi tạo tệp PDF. Bạn có thể thử xuất lại." title="Không tạo được báo cáo" tone="error" onClose={onDismiss} />;
  }
  if (data.status === 'READY') {
    return (
      <Alert
        actions={<Button label="Mở PDF" loading={open.pending} size="xs" variant="primary" onPress={() => void open.open(exportId)} />}
        description={readyDescription(data, timezone)}
        title="Báo cáo đã sẵn sàng"
        tone="success"
        onClose={onDismiss}
      />
    );
  }
  return <Alert description={`Kỳ ${periodLabel(data.periodKey)}. Bạn có thể rời màn hình, chúng tôi sẽ báo khi xong.`} title="Đang tạo báo cáo…" tone="info" />;
}
