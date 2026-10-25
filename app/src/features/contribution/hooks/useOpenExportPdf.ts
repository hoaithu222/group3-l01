import { useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { contributionService } from '../api/contribution.service';
import { contributionKeys } from '../queries/contribution.keys';
import { contributionErrorMessage, isExportExpired } from '../utils/contribution-errors';

/**
 * "Mở PDF": xin URL ký NGAY LÚC BẤM (`GET /contribution-exports/:id?download=1`, sống ≤ 60 giây) rồi mở bằng trình xem của hệ điều hành.
 * ⛔ Không giữ URL trong cache/state — URL cũ hết hạn và mở ra lỗi khó hiểu (app.md §4). P0 dùng `Linking.openURL`; xem ngay trong app
 * là P1. Hết hạn (`410 CONTRIB_005`) → làm mới trạng thái để banner đổi sang "Xuất lại"; lỗi khác → toast, giữ nguyên banner.
 *
 * Chống bấm đúp bằng `ref`, KHÔNG bằng state: hai lần chạm liền nhau có thể tới trước lần vẽ lại đầu tiên, khi `pending` (state) còn `false`.
 * `pending` chỉ để nút hiện vòng quay.
 */
export function useOpenExportPdf() {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const open = async (exportId: string): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const url = await contributionService.exportDownloadUrl(exportId);
      await Linking.openURL(url);
    } catch (error) {
      if (isExportExpired(error)) {
        void queryClient.invalidateQueries({ queryKey: contributionKeys.export(exportId) });
      }
      showToast('error', contributionErrorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return { open, pending };
}
