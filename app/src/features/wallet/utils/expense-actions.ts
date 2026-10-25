import type { ExpenseDetailView } from '../api';
import { isExpenseLocked } from './wallet-errors';

export interface ExpenseActionState {
  /** Được sửa/xoá trực tiếp: quản lý được, là khoản chi GỐC và chưa ai thanh toán. */
  canEditOrDelete: boolean;
  /** Đã có người trả (hoặc BE báo `WALLET_004`) ⇒ chỉ còn lối "Tạo khoản điều chỉnh". */
  locked: boolean;
  /** Người xem có quyền quản lý và đây là khoản chi gốc (khoản ĐIỀU CHỈNH không sửa/xoá/điều chỉnh tiếp). */
  manageable: boolean;
}

/**
 * Suy ra hành động nào của khoản chi còn dùng được. Dùng chung cho thanh tiêu đề (nút Sửa + menu "⋯") và thân màn
 * (thông báo khoá) để hai nơi KHÔNG thể lệch nhau: một nơi vẽ nút Sửa còn nơi kia nói "đã khoá" là nói dối người dùng.
 *
 * Khoá theo phép chiếu `paidAmount > 0` / trạng thái share `PAID|PARTIAL` (đề phòng BE trả `WALLET_004` muộn — lúc đó
 * `deleteError` cũng khoá).
 */
export function expenseActionState(
  expense: ExpenseDetailView,
  deleteError: unknown,
): ExpenseActionState {
  const hasPayment = expense.shares.some(
    (share) => share.paidAmount > 0 || share.status === 'PAID' || share.status === 'PARTIAL',
  );
  const locked = hasPayment || isExpenseLocked(deleteError);
  const manageable = expense.canManage && expense.kind === 'EXPENSE';
  return { canEditOrDelete: manageable && !locked, locked, manageable };
}
