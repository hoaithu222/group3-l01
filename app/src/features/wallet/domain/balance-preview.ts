/** Số dòng "Số dư thành viên" hiện sẵn ở dashboard trước khi cần bấm "Xem thêm". */
export const MEMBER_BALANCE_PREVIEW = 5;

export interface BalancePreview<T extends { userId: string }> {
  /** Số người bị giấu (0 = đang hiện đủ, không cần nút bung). */
  hidden: number;
  rows: T[];
}

/**
 * Chặn số dòng số dư thành viên (danh sách sinh từ dữ liệu BE không được phình vô hạn: nhóm 30 người sẽ đẩy "Khoản chi
 * gần đây" ra khỏi màn đầu). `sorted` đã xếp sẵn (người nợ nhiều nhất trước).
 *
 * - Tổng ≤ `limit + 1` thì hiện ĐỦ: giấu đúng 1 người rồi bắt bấm "Xem thêm 1 người" là tệ hơn cứ hiện nó.
 * - DÒNG CỦA TÔI luôn có mặt dù nằm ngoài top: đó là dòng người dùng tìm đầu tiên ("mình nợ/được nợ bao nhiêu").
 */
export function previewBalances<T extends { userId: string }>(
  sorted: readonly T[],
  meId: string | undefined,
  expanded: boolean,
  limit: number = MEMBER_BALANCE_PREVIEW,
): BalancePreview<T> {
  if (expanded || sorted.length <= limit + 1) return { hidden: 0, rows: [...sorted] };

  const rows = sorted.slice(0, limit);
  const me = sorted.find((item) => item.userId === meId);
  if (me && !rows.includes(me)) rows.push(me);
  return { hidden: sorted.length - rows.length, rows };
}
