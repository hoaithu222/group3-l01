import type {
  AdjustExpensePayload,
  CreateExpensePayload,
  ExpenseDetailView,
  SplitParticipantPayload,
  UpdateExpensePayload,
} from '../api';
import { draftToParticipants } from '../domain/split-draft';
import type { ExpenseFormValues } from '../schemas/wallet-forms.schemas';

/**
 * Ngày chi → ISO gửi BE.
 *
 * ⚠️ `DatePicker` trả `Date` lúc 00:00 GIỜ MÁY; `toISOString()` thẳng sẽ ra 17:00 UTC của
 * NGÀY HÔM TRƯỚC (giờ VN) — người ở múi giờ khác đọc lại thấy lùi một ngày (bẫy như
 * `toApiDate`, xem `date.utils.ts`). Ghim vào 12:00 giờ máy: lệch tới ±12 giờ múi giờ vẫn
 * cùng ngày lịch. Riêng "hôm nay" giữ NGUYÊN giờ hiện tại để khoản vừa ghi xếp đúng thứ tự.
 */
export function toOccurredAtIso(picked: Date, now: Date = new Date()): string {
  const sameDay =
    picked.getFullYear() === now.getFullYear() &&
    picked.getMonth() === now.getMonth() &&
    picked.getDate() === now.getDate();
  if (sameDay) return now.toISOString();
  return new Date(
    picked.getFullYear(),
    picked.getMonth(),
    picked.getDate(),
    12,
    0,
    0,
  ).toISOString();
}

export function buildCreatePayload(
  values: ExpenseFormValues,
  receiptAssetId?: string,
): CreateExpensePayload {
  return {
    amount: values.amount,
    category: values.category,
    description: values.description,
    occurredAt: toOccurredAtIso(values.occurredAt),
    paidBy: values.paidBy,
    participants: draftToParticipants(values.split),
    splitType: values.split.splitType,
    ...(receiptAssetId ? { receiptAssetId } : {}),
  };
}

/** Bản khai ĐÚNG mới của cả khoản chi (be.md `createAdjustmentSchema`) — server tự tính chênh lệch. */
export function buildAdjustPayload(values: ExpenseFormValues): AdjustExpensePayload {
  return {
    amount: values.amount,
    description: values.description,
    participants: draftToParticipants(values.split),
    splitType: values.split.splitType,
  };
}

const byUser = (a: SplitParticipantPayload, b: SplitParticipantPayload) =>
  a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;

/** Chỉ so phần liên quan tới kiểu chia (EQUAL bỏ qua amount/bps đã lưu) và không phụ thuộc thứ tự chọn. */
function normalizeParticipants(
  splitType: string,
  list: readonly SplitParticipantPayload[],
): string {
  return JSON.stringify(
    [...list].sort(byUser).map((p) => ({
      amount: splitType === 'CUSTOM' ? p.amount : undefined,
      bps: splitType === 'PERCENT' ? p.bps : undefined,
      userId: p.userId,
    })),
  );
}

/**
 * PATCH chỉ chứa phần ĐÃ ĐỔI (+ `expectedVersion`). Đổi số tiền HOẶC cách chia thì gửi cả
 * `amount` + `splitType` + `participants` cùng nhau — BE kiểm lại tổng sau khi hợp nhất
 * với bản cũ, gửi lẻ một nửa dễ ra `WALLET_002` oan (vd đổi số tiền mà giữ nguyên CUSTOM cũ).
 * `receiptAssetId`: `undefined` = không đụng · `null` = gỡ ảnh.
 */
export function buildUpdatePayload(
  values: ExpenseFormValues,
  original: ExpenseDetailView,
  receiptAssetId: string | null | undefined,
): UpdateExpensePayload {
  const participants = draftToParticipants(values.split);
  const amountChanged = values.amount !== original.amount;
  const splitChanged =
    values.split.splitType !== original.splitType ||
    normalizeParticipants(values.split.splitType, participants) !==
      normalizeParticipants(
        original.splitType,
        original.participants.map((p) => ({
          amount: p.amount ?? undefined,
          bps: p.bps ?? undefined,
          userId: p.userId,
        })),
      );

  const payload: UpdateExpensePayload = { expectedVersion: original.version };
  if (amountChanged || splitChanged) {
    payload.amount = values.amount;
    payload.splitType = values.split.splitType;
    payload.participants = participants;
  }
  if (values.description !== original.description) payload.description = values.description;
  if (values.category !== original.category) payload.category = values.category;
  if (values.paidBy !== original.paidBy) payload.paidBy = values.paidBy;
  if (toDayKey(values.occurredAt) !== toDayKey(new Date(original.occurredAt)))
    payload.occurredAt = toOccurredAtIso(values.occurredAt);
  if (receiptAssetId !== undefined && receiptAssetId !== original.receiptAssetId)
    payload.receiptAssetId = receiptAssetId;
  return payload;
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
