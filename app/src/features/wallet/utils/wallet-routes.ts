import type { Href } from 'expo-router';

/**
 * Href của các màn ví — MỘT chỗ để đổi đường dẫn (`navigation.md`, cùng vai `PATHS`).
 * Deep link `https://<domain>/w/{wsId}/wallet` đi qua `app/w/[wsId]/wallet.tsx` rồi về `walletHref(wsId)`.
 *
 * ⚠️ `walletHref` ép kiểu `as Href` vì route CHỈ-CÓ-`index` (`wallet/index.tsx`) bị bộ sinh typed routes
 * (`.expo/types/router.d.ts`) sinh THẤT THƯỜNG khi `expo start` chạy nền: lúc là `/workspaces/[wsId]/wallet`,
 * lúc là `/workspaces/[wsId]/wallet/index` — `tsc` xanh/đỏ tuỳ lúc sinh, còn chuỗi thật
 * `/workspaces/<id>/wallet` đúng ở MỌI trường hợp lúc chạy (cùng bẫy `boards/utils/board-routes.ts`).
 * Các route con (`expenses/new`, `settle`, …) không dính nên dùng `{ pathname, params }` có kiểu.
 */

export function walletHref(wsId: string): Href {
  return `/workspaces/${wsId}/wallet` as Href;
}

export function addExpenseHref(wsId: string): Href {
  return { pathname: '/workspaces/[wsId]/wallet/expenses/new', params: { wsId } };
}

export function expenseHref(wsId: string, expenseId: string): Href {
  return {
    pathname: '/workspaces/[wsId]/wallet/expenses/[expenseId]',
    params: { wsId, expenseId },
  };
}

/** `toId`/`amount` là GỢI Ý điền sẵn (từ dòng "Gợi ý thanh toán") — người dùng vẫn sửa được. */
export function settleHref(wsId: string, toId?: string, amount?: number): Href {
  const params: { wsId: string; toId?: string; amount?: string } = { wsId };
  if (toId) params.toId = toId;
  if (amount) params.amount = String(amount);
  return { pathname: '/workspaces/[wsId]/wallet/settle', params };
}

export function historyHref(wsId: string): Href {
  return { pathname: '/workspaces/[wsId]/wallet/history', params: { wsId } };
}

export function walletSettingsHref(wsId: string): Href {
  return { pathname: '/workspaces/[wsId]/wallet/settings', params: { wsId } };
}

export const PAYMENT_PROFILES_HREF: Href = '/me/payment-profiles';

/**
 * Thông báo `wallet.*` → màn đích (p6-04 app.md §1: "thông báo mở đúng màn"). `refs` là
 * `notification.refs` của BE. Trả `null` khi thiếu `workspaceId` (không có đích an toàn).
 *
 * ⚠️ Chưa có nơi GỌI: hộp thư thông báo (p1-07) chưa dựng phía app (`ActivityScreen` còn là
 * khung "Sắp có") và chưa có luồng bấm-thông-báo-đẩy nào. Hàm này là điểm nối sẵn — khi
 * inbox có, chỉ cần gọi `resolveWalletNotificationHref(item.type, item.refs)`.
 * Số tiền KHÔNG bao giờ nằm trong `refs` nên không có gì để lộ ở màn khoá.
 */
export function resolveWalletNotificationHref(
  type: string,
  refs: Record<string, unknown> | null | undefined,
): Href | null {
  const wsId = typeof refs?.workspaceId === 'string' ? refs.workspaceId : null;
  if (!wsId || !type.startsWith('wallet.')) return null;

  switch (type) {
    case 'wallet.expense-added': {
      const expenseId = typeof refs?.expenseId === 'string' ? refs.expenseId : null;
      // `if` + hai `return`, KHÔNG dùng `? :` — TS gộp hai `Href` (union hàng trăm nhánh) thành lỗi TS2590 "too complex".
      if (expenseId) return expenseHref(wsId, expenseId);
      return walletHref(wsId);
    }
    // NGƯỜI NHẬN thấy thẻ "cần xác nhận" ở dashboard (cả lượt nhắc `stale` sau 48 giờ chưa xử lý);
    // NGƯỜI GỬI được báo kết quả (confirmed/rejected) thì xem ở lịch sử thanh toán.
    case 'wallet.settlement-pending':
    case 'wallet.settlement-stale':
      return walletHref(wsId);
    case 'wallet.settlement-confirmed':
    case 'wallet.settlement-rejected':
      return historyHref(wsId);
    default:
      // `wallet.debt-reminder` và mọi loại `wallet.*` mới về sau: về dashboard là đích an toàn.
      return walletHref(wsId);
  }
}
