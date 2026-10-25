import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { hapticSuccess } from '@/shared/utils/haptics';

import type { ReportOutcome } from '../hooks/useReportForm';

export interface ReportReceiptProps {
  outcome: ReportOutcome;
}

/**
 * Biên nhận sau khi gửi (app.md p1-08 §2 `ReportReceipt`) — nói thật ba ca, không chung chung:
 *   · lần đầu: "Đã gửi báo cáo. Cảm ơn bạn."
 *   · `alreadyReported` (BE 200): báo cáo của bạn về nội dung này đã có, KHÔNG tạo bản thứ hai.
 *   · chặn kèm theo thất bại: báo cáo VẪN được ghi nhận, chỉ phần chặn chưa xong.
 * Không hứa kết quả xử lý ("sẽ bị gỡ") — người kiểm duyệt mới quyết định.
 */
export function ReportReceipt({ outcome }: ReportReceiptProps) {
  const { report, block } = outcome;
  const alreadyReported = report.alreadyReported;

  // Rung "thành công" ĐÚNG MỘT LẦN khi biên nhận hiện ra (gửi báo cáo là việc vừa XONG) — báo cáo trùng thì không rung: không có gì mới xảy ra.
  useEffect(() => {
    if (!alreadyReported) hapticSuccess();
  }, [alreadyReported]);

  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-sm py-md">
      {/* Ô icon 64 có tông (cùng họ hình minh hoạ của `EmptyState`) thay cho dấu tick trần: gửi mới = `success`, đã báo cáo trước đó = `info`. */}
      <IconTile name="checkmark-circle" size="xl" tone={alreadyReported ? 'info' : 'success'} />
      <Text className="text-center text-label-lg text-fg-1">
        {alreadyReported ? 'Bạn đã báo cáo nội dung này trước đó' : 'Đã gửi báo cáo. Cảm ơn bạn.'}
      </Text>
      <Text className="text-center text-body-md text-fg-2">
        {alreadyReported
          ? 'Báo cáo của bạn đang được xem xét, không cần gửi lại.'
          : 'Người kiểm duyệt sẽ xem xét. Người bị báo cáo không biết ai đã báo cáo.'}
      </Text>
      {block === 'done' ? <Text className="text-center text-body-md text-fg-2">Bạn cũng đã chặn người này.</Text> : null}
      {block === 'failed' ? (
        <Text className="text-center text-body-md text-error">
          Chưa chặn được người này. Bạn có thể chặn lại từ thông tin của họ.
        </Text>
      ) : null}
    </View>
  );
}
