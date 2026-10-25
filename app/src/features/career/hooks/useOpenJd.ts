import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { offersService } from '../api/offers.service';
import { offerKeys } from '../queries/offers.keys';
import { recruiterErrorMessage } from '../utils/recruiter-errors';

/**
 * Mở tệp mô tả công việc (JD, PDF) của lời mời. ⛔ `jdUrl` là URL KÝ sống ~60 giây và nằm trong cache chi tiết — mở bằng bản đã cache là gặp
 * link hết hạn (app.md §4 "không giữ URL"): luôn lấy bản mới NGAY lúc bấm (`staleTime: 0`), ghi luôn vào cache rồi mới mở. Mở bằng trình duyệt trong app
 * (`expo-web-browser`); viewer PDF của p3-01 chưa dùng ở đây (chưa có trên mọi dev-client — xem app.md §6).
 */
export function useOpenJd(offerId: string) {
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setOpening(true);
    try {
      const fresh = await qc.fetchQuery({
        queryFn: () => offersService.get(offerId),
        queryKey: offerKeys.detail(offerId),
        staleTime: 0,
      });
      if (!fresh.jdUrl) {
        showToast('error', 'Không mở được tệp mô tả công việc, thử lại sau');
        return;
      }
      await WebBrowser.openBrowserAsync(fresh.jdUrl);
    } catch (error) {
      showToast('error', recruiterErrorMessage(error));
    } finally {
      setOpening(false);
    }
  };

  return { open, opening };
}
