import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { OFFERS_PAGE_SIZE, PORTAL_ERROR } from '../constants/portal.constants';
import type { OfferListParams, OfferMessage } from '../types/offer.types';
import type { CursorPage } from '../types/portal.types';
import type { TalentProfile } from '../types/talent.types';
import { errorCodeOf } from '../utils/portal-errors';
import { offerService } from './offer.service';
import { portalKeys } from './portal.keys';

const nextCursor = <T>(last: CursorPage<T>): string | undefined =>
  last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined;

/**
 * Làm mới mọi thứ liên quan tới lời mời: danh sách, chi tiết, hạn mức (gửi trừ lượt).
 * ⛔ KHÔNG làm mới hồ sơ ứng viên: mỗi lần BE trả hồ sơ là một dòng nhật ký `talent.profile-view` + một lượt trong trần 300/ngày — nút "Gửi/Xem lời mời" trên hồ sơ
 * được VÁ TẠI CHỖ bằng `patchProfileOpenOffer` thay vì refetch.
 */
export function refreshOffers(qc: QueryClient, companyId: string): void {
  void qc.invalidateQueries({ queryKey: portalKeys.offerLists(companyId) });
  void qc.invalidateQueries({ queryKey: portalKeys.usage(companyId) });
  void qc.invalidateQueries({ queryKey: ['portal', 'offer'] });
}

/** Vá `openOffer` của hồ sơ ứng viên ĐANG có trong cache (không tạo lượt xem mới). `null` = lời mời đã đóng. */
export function patchProfileOpenOffer(
  qc: QueryClient,
  companyId: string,
  studentId: string,
  openOffer: TalentProfile['openOffer'],
): void {
  qc.setQueryData<TalentProfile>(portalKeys.profile(companyId, studentId), (old) =>
    old ? { ...old, openOffer } : old,
  );
}

/** Danh sách lời mời của doanh nghiệp (cursor, "Tải thêm"). `enabled` theo trạng thái công ty: PENDING/REJECTED chưa có lời mời nào để gọi. */
export const useOffers = (companyId: string | undefined, params: OfferListParams, enabled = true) =>
  useInfiniteQuery({
    queryKey: portalKeys.offers(companyId ?? '', params),
    queryFn: ({ pageParam }) =>
      offerService.list(companyId as string, { ...params, limit: OFFERS_PAGE_SIZE }, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    placeholderData: keepPreviousData,
    enabled: enabled && !!companyId,
  });

/** Chi tiết lời mời (nội dung, JD, `sharedEmail` khi có). 404 → ngăn kéo báo "không còn"; `retry: false`. */
export const useOffer = (companyId: string | undefined, offerId: string | null) =>
  useQuery({
    queryKey: portalKeys.offer(offerId ?? ''),
    queryFn: () => offerService.detail(companyId as string, offerId as string),
    enabled: !!companyId && !!offerId,
    retry: false,
  });

/**
 * Gửi lời mời (`Idempotency-Key`). KHÔNG toast lỗi ở đây (service đã tắt toast): `RECR_005`/`RECR_006`/`RECR_007` có thông điệp riêng trong modal.
 * Thành công → làm mới danh sách/hạn mức/hồ sơ (lượt còn lại đã đổi).
 */
export const useSendOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: offerService.send,
    onSuccess: (res, { companyId, studentId }) => {
      refreshOffers(qc, companyId);
      const offer = res.data;
      patchProfileOpenOffer(qc, companyId, studentId, {
        id: offer.id,
        status: offer.status,
        sentAt: offer.sentAt,
      });
      showToast('success', 'Đã gửi lời mời');
    },
    // Hạn mức/lời mời mở đã đổi (người khác vừa gửi, hoặc hết lượt): làm mới số lượt còn lại để giao diện khớp thực tế.
    onError: (err, { companyId, studentId }) => {
      const code = errorCodeOf(err);
      if (code === PORTAL_ERROR.quotaExceeded || code === PORTAL_ERROR.openOfferExists) {
        refreshOffers(qc, companyId);
      }
      // Đã có lời mời mở với ứng viên này mà hồ sơ trong cache chưa biết: đó là trường hợp DUY NHẤT đáng một lượt xem hồ sơ mới để nút đổi thành "Xem lời mời".
      if (code === PORTAL_ERROR.openOfferExists) {
        void qc.invalidateQueries({ queryKey: portalKeys.profile(companyId, studentId) });
      }
    },
  });
};

/** `POST …/withdraw` — SENT/READ/INTERESTED → WITHDRAWN (không hoàn lượt). `RECR_009` = đã đóng (làm mới để nút biến mất). */
export const useWithdrawOffer = (companyId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => offerService.withdraw(companyId as string, offerId),
    onSuccess: (res) => {
      if (companyId) {
        refreshOffers(qc, companyId);
        patchProfileOpenOffer(qc, companyId, res.data.student.userId, null);
      }
      showToast('success', 'Đã thu hồi lời mời');
    },
    onError: (err) => {
      if (errorCodeOf(err) === PORTAL_ERROR.invalidState && companyId) refreshOffers(qc, companyId);
    },
  });
};

/**
 * Trao đổi trong lời mời — `useInfiniteQuery`; mỗi trang là tin CŨ HƠN trang trước (BE trả mới nhất trước). `enabled` chỉ khi lời mời đã có thể có tin (INTERESTED trở đi
 * hoặc đã từng): SENT/READ chưa có thread nên KHÔNG gọi. Mở thread đặt lại "chưa đọc" của phía mình ở BE → làm mới danh sách để cột "Tin mới" về 0.
 */
export const useOfferMessages = (offerId: string | null, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: portalKeys.messages(offerId ?? ''),
    queryFn: ({ pageParam }) => offerService.messages(offerId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled: enabled && !!offerId,
    retry: false,
  });

/** Trang tin đã tải, phẳng và theo thứ tự ĐỌC (cũ → mới). */
export function flattenMessages(
  data: InfiniteData<CursorPage<OfferMessage>> | undefined,
): OfferMessage[] {
  if (!data) return [];
  const newestFirst = data.pages.flatMap((p) => p.data);
  return [...newestFirst].reverse();
}

/**
 * Gửi tin (`clientMessageId` idempotent). `RECR_008` = chưa Quan tâm/bị khoá/tạm ngưng: làm mới lời mời để ô soạn tự ẩn (interceptor đã toast).
 * Thành công không cần refetch tay — socket `offer:message-created` (gửi cả cho chính người gửi) kéo tin mới về; tuy nhiên vẫn làm mới để không phụ thuộc socket.
 */
export const useSendMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: offerService.sendMessage,
    onSuccess: (_res, { offerId }) => {
      void qc.invalidateQueries({ queryKey: portalKeys.messages(offerId) });
    },
    onError: (err) => {
      if (errorCodeOf(err) === PORTAL_ERROR.threadClosed) {
        void qc.invalidateQueries({ queryKey: ['portal', 'offer'] });
      }
    },
  });
};
