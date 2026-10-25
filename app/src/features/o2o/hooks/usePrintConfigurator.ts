import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useNetworkStatus } from '@/shared/hooks/use-network-status';

import type { PrintSettings } from '../api/o2o.types';
import {
  DEFAULT_SETTINGS,
  O2O_ERROR_MESSAGES,
  PICKUP_PRESETS,
  type PickupPresetKey,
} from '../constants/o2o.constants';
import { useSubmitPrintOrder, useUpdatePrintOrder } from '../queries/print.mutations';
import { useQuote } from '../queries/print.queries';
import { fileProblemCode, isCountingPages } from '../utils/order-status';
import { o2oErrorCode, o2oErrorMessage } from '../utils/o2o-errors';
import { normalizePageRange, pageRangeError } from '../utils/page-range';
import { orderTicketHref } from '../utils/o2o-routes';
import { useDebouncedValue } from './useDebouncedValue';
import { usePrintDraft, type UsePrintDraftParams } from './usePrintDraft';

/** Chuẩn hoá để so sánh/gửi đi: khoảng trang bỏ khoảng trắng, rỗng → `null` (BE cũng làm vậy ở `toSettings`). */
function normalize(settings: PrintSettings): PrintSettings {
  const range = normalizePageRange(settings.pageRange ?? '');
  return { ...settings, pageRange: range === '' ? null : range };
}

const sameSettings = (a: PrintSettings, b: PrintSettings) =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

function pickupIso(key: PickupPresetKey): string | null {
  const minutes = PICKUP_PRESETS.find((preset) => preset.key === key)?.minutes ?? null;
  return minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Trạng thái + hành động của màn cấu hình in (app.md §3): tệp → đơn nháp (`usePrintDraft`) → cấu hình → báo giá → gửi.
 *
 * `settings` là DẪN XUẤT: nền = cấu hình của đơn (mặc định A4/đen trắng/1 bản) + phần người dùng đã sửa (`edits`), rồi ép về khả năng của tiệm
 * (khoá A3/màu/2 mặt/đóng gáy khi tiệm không hỗ trợ). Dẫn xuất thay vì đồng bộ bằng effect nên mở lại đơn nháp không có nhịp "cấu hình nháy về mặc định".
 *
 * Báo giá lấy từ SERVER (`POST /print-shops/:id/quote`) theo cấu hình đã DEBOUNCE 400 ms — cùng hàm tính với lúc gửi đơn, app không tự tính tiền.
 * Gửi đơn = (nếu cấu hình khác đơn đã lưu) `PATCH` với `expectedVersion` rồi `submit` (BE tính lại báo giá theo bảng giá HIỆN TẠI lúc gửi, IR-15),
 * sau đó `replace` sang màn vé — `replace` chứ không `push`, để nút Back không quay về form đã gửi.
 */
export function usePrintConfigurator(params: UsePrintDraftParams) {
  const draft = usePrintDraft(params);
  const { isOnline } = useNetworkStatus();
  const update = useUpdatePrintOrder(draft.orderId);
  const submit = useSubmitPrintOrder();
  const [edits, setEdits] = useState<Partial<PrintSettings>>({});
  const [pickup, setPickup] = useState<PickupPresetKey>('none');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const order = draft.order.data;
  const shop = draft.shop.data;
  const caps = shop?.capabilities;
  const merged = { ...(order?.settings ?? DEFAULT_SETTINGS), ...edits };
  const settings: PrintSettings = {
    ...merged,
    paper: caps && !caps.a3 ? 'A4' : merged.paper,
    color: caps && !caps.color ? false : merged.color,
    duplex: caps && !caps.duplex ? false : merged.duplex,
    binding: caps && !caps.binding ? false : merged.binding,
  };

  const pages = order?.pages ?? null;
  const fileProblem = order ? fileProblemCode(order) : null;
  const localRangeError = pageRangeError(settings.pageRange ?? '', pages);
  // ⚠️ Debounce CHUỖI chứ không phải đối tượng: `normalize()` dựng đối tượng mới mỗi lần vẽ ⇒ `useDebouncedValue` thấy giá trị "đổi" mãi,
  // đặt state → vẽ lại → đối tượng mới → ... vòng lặp không dứt.
  const signature = JSON.stringify(normalize(settings));
  const debouncedSignature = useDebouncedValue(signature);
  const debounced = useMemo(
    () => JSON.parse(debouncedSignature) as PrintSettings,
    [debouncedSignature],
  );
  const settled = debouncedSignature === signature;
  const quote = useQuote(params.shopId, pages, debounced, localRangeError === null && !fileProblem);

  const quoteCode = quote.error ? o2oErrorCode(quote.error) : undefined;
  const rangeError =
    localRangeError ?? (quoteCode === 'O2O_012' ? (O2O_ERROR_MESSAGES.O2O_012 ?? null) : null);
  const settingsError =
    quote.error && quoteCode !== 'O2O_012' ? o2oErrorMessage(quote.error) : null;
  const quoteBusy = quote.isFetching || quote.isPlaceholderData || !settled;
  const submitting = update.isPending || submit.isPending;

  const canSubmit =
    isOnline &&
    !submitting &&
    order !== undefined &&
    !isCountingPages(order) &&
    !fileProblem &&
    pages !== null &&
    !rangeError &&
    !settingsError &&
    quote.data !== undefined &&
    !quoteBusy;

  const send = async () => {
    if (!order || !canSubmit) return;
    setSubmitError(null);
    try {
      let current = order;
      const pickupBy = pickupIso(pickup);
      if (!sameSettings(order.settings, settings) || pickupBy !== null) {
        current = await update.mutateAsync({
          settings: normalize(settings),
          pickupBy,
          expectedVersion: order.version,
        });
      }
      const result = await submit.mutateAsync(current.id);
      router.replace(orderTicketHref(result.order.id));
    } catch (error) {
      setSubmitError(o2oErrorMessage(error));
    }
  };

  return {
    ...draft,
    settings,
    setSettings: (patch: Partial<PrintSettings>) => setEdits((prev) => ({ ...prev, ...patch })),
    pickup,
    setPickup,
    pages,
    fileProblem,
    rangeError,
    settingsError,
    quote: quote.data,
    quoteBusy,
    submitError,
    submitting,
    canSubmit,
    isOnline,
    send,
  };
}
