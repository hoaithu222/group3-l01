import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useLocalStorage } from '@/shared/hooks';
import { showToast } from '@/shared/utils/toast.utils';

import { SOUND_STORAGE_KEY } from '../constants/partner.constants';
import { partnerKeys } from '../service/partner.keys';
import type { PartnerOrderEvent } from '../types/partner.types';
import { playNewOrderSound } from '../utils/sound.utils';

/**
 * Cảnh báo đơn mới cho cổng chủ tiệm (admin.md p6-05 §2.4 + §3) — gắn ở `PartnerPage` để chạy trên MỌI tab của cổng:
 *  - `partner:order` (S→C `user:{chủ tiệm}`, chỉ phát khi khách vừa GỬI đơn): làm mới hàng đợi + toast + tiếng "ting" (nếu bật)
 *    + khi tab trình duyệt đang ẨN thì đặt số đơn mới lên tiêu đề tab ("(2) Đơn in mới · …"), trả lại tiêu đề khi tab hiện lại;
 *  - `print-order:updated` (đơn của tiệm đổi trạng thái — kể cả do chính tiệm bấm ở tab khác): chỉ làm mới dữ liệu.
 * Bật/tắt âm báo lưu localStorage (mỗi máy tiệm tự nhớ); trả `soundOn`/`setSoundOn` cho tab "Tài khoản".
 */
export function usePartnerAlerts() {
  const qc = useQueryClient();
  const [soundOn, setSoundOn] = useLocalStorage<boolean>(SOUND_STORAGE_KEY, true);
  /** Tiêu đề gốc của tab lúc bắt đầu đếm đơn mới (`null` = không đang đếm). */
  const baseTitle = useRef<string | null>(null);
  const unseen = useRef(0);

  const flagTitle = useCallback(() => {
    if (!document.hidden) return;
    baseTitle.current ??= document.title;
    unseen.current += 1;
    document.title = `(${unseen.current}) Đơn in mới · ${baseTitle.current}`;
  }, []);

  useEffect(() => {
    const restore = () => {
      if (document.hidden || baseTitle.current === null) return;
      document.title = baseTitle.current;
      baseTitle.current = null;
      unseen.current = 0;
    };
    document.addEventListener('visibilitychange', restore);
    return () => {
      document.removeEventListener('visibilitychange', restore);
      // Rời cổng lúc còn đang đếm → trả tiêu đề gốc, đừng để "(2) Đơn in mới" dính sang trang khác.
      if (baseTitle.current !== null) document.title = baseTitle.current;
      baseTitle.current = null;
      unseen.current = 0;
    };
  }, []);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: partnerKeys.all });
  }, [qc]);

  useSocketEvent<PartnerOrderEvent>(SocketEvent.PARTNER_ORDER, (event) => {
    refresh();
    showToast('info', `Có đơn in mới ${event.code}`);
    if (soundOn) playNewOrderSound();
    flagTitle();
  });
  useSocketEvent(SocketEvent.PRINT_ORDER_UPDATED, refresh);

  return { soundOn, setSoundOn };
}
