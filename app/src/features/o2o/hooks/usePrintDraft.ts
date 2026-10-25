import { useEffect, useMemo, useRef, useState } from 'react';

import { shouldRotateIdempotencyKey, useIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';

import type { PrintSource } from '../api/o2o.types';
import { usePrintOrder, usePrintShop } from '../queries/print.queries';
import { useCancelPrintOrder, useCreatePrintOrder } from '../queries/print.mutations';
import { usePrintUpload } from './usePrintUpload';

/** Tệp nguồn của đơn: tài liệu Resource Hub (`id` = resourceId) hoặc PDF vừa tải lên (`id` = assetId). `name` chỉ để HIỆN. */
export interface DraftSource {
  kind: PrintSource['kind'];
  id: string;
  name: string;
}

export interface UsePrintDraftParams {
  shopId: string | undefined;
  /** Tệp có sẵn từ Resource Hub ("In tài liệu") — chỉ là giá trị KHỞI ĐẦU; đổi về sau qua `pickResource`/`changeFile`. */
  resource?: { id: string; name: string } | null;
  /** Tiếp tục đơn nháp cũ (mở lại từ "Đơn của tôi"). */
  orderId?: string;
}

function toPayload(source: DraftSource): PrintSource {
  return source.kind === 'RESOURCE'
    ? { kind: 'RESOURCE', resourceId: source.id }
    : { kind: 'UPLOAD', assetId: source.id };
}

/**
 * Bước 1 của cấu hình in: có TỆP → tạo đơn NHÁP ngay (BE đếm trang ở job nền, socket/hỏi lại báo khi xong — app.md §3 "Đang đếm trang…").
 *
 * Tạo đơn tự động khi có nguồn tệp + tiệm đang nhận đơn, ĐÚNG MỘT LẦN cho mỗi nguồn (`attempted` giữ chữ ký nguồn đã thử): effect chạy lại
 * vì lý do khác (tiệm tải lại…) không tạo đơn thứ hai. `Idempotency-Key` gắn theo chữ ký nguồn nên mạng chậm/thử lại vẫn MỘT đơn; lỗi 4xx
 * dứt khoát thì xoay khoá (BE lưu cả câu 4xx theo khoá 24 giờ — thử lại cùng khoá là nhận lại đúng câu lỗi cũ).
 */
export function usePrintDraft({
  shopId,
  resource: initialResource,
  orderId: initialOrderId,
}: UsePrintDraftParams) {
  const shop = usePrintShop(shopId);
  const upload = usePrintUpload('print-new');
  const [resource, setResource] = useState(initialResource ?? null);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [attempt, setAttempt] = useState(0);
  const attempted = useRef<string | null>(null);

  const { id: resourceId, name: resourceName } = resource ?? {};
  const uploadName = upload.item?.name ?? 'Tệp PDF';
  const source = useMemo<DraftSource | null>(() => {
    if (resourceId)
      return { kind: 'RESOURCE', id: resourceId, name: resourceName ?? 'Tài liệu nhóm' };
    if (upload.assetId) return { kind: 'UPLOAD', id: upload.assetId, name: uploadName };
    return null;
  }, [resourceId, resourceName, upload.assetId, uploadName]);
  const signature = source ? `${shopId}|${source.kind}|${source.id}|${attempt}` : '';

  const order = usePrintOrder(orderId);
  const { mutate: createOrder, reset: resetCreate, ...create } = useCreatePrintOrder();
  const { mutate: cancelOrder } = useCancelPrintOrder();
  const { key, rotate } = useIdempotencyKey('print-order', signature);
  const shopReady = shop.data?.acceptingOrders === true;

  useEffect(() => {
    if (!source || !shopId || !shopReady || orderId || attempted.current === signature) return;
    attempted.current = signature;
    createOrder(
      { payload: { shopId, source: toPayload(source) }, idempotencyKey: key },
      {
        onSuccess: (created) => setOrderId(created.id),
        onError: (error) => {
          if (shouldRotateIdempotencyKey(error)) rotate();
        },
      },
    );
  }, [source, signature, shopId, shopReady, orderId, createOrder, key, rotate]);

  /** Thử tạo đơn lại sau lỗi (mạng, 5xx…): đổi chữ ký để effect chạy lại, và xoá lỗi cũ. */
  const retryCreate = () => {
    attempted.current = null;
    resetCreate();
    setAttempt((value) => value + 1);
  };

  /**
   * "Đổi tệp": bỏ đơn nháp hiện tại (huỷ — BE cho huỷ DRAFT/QUOTED; lỗi cũng bỏ qua, cron dọn đơn nháp sau 72 giờ) rồi quay về bước chọn tệp.
   * Không huỷ thì mỗi lần đổi ý để lại một đơn nháp rác trong "Đơn của tôi". Nguồn `resource` cũng phải bỏ: còn nó thì effect tạo đơn lại ngay.
   */
  const changeFile = () => {
    if (orderId) cancelOrder({ orderId });
    setOrderId(undefined);
    setResource(null);
    if (upload.item) upload.remove(upload.item.localId);
    attempted.current = null;
    resetCreate();
  };

  return {
    shop,
    order,
    orderId,
    source,
    upload,
    creating: create.isPending,
    createError: create.error,
    retryCreate,
    changeFile,
    pickResource: setResource,
  };
}
