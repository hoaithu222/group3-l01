import type { BulkErrorDetail, ItemInput } from '../api/study.types';

export interface ItemErrors {
  /** Mã lỗi BE của từng trường (`prompt` → `REQUIRED`…) — hiện thành câu ở `describeBulkError`. */
  fields: { code: string; field: string; message?: string }[];
}

/** Câu tiếng Việt cho `details[].code` của `STUDY_001` (be.md p4-01 §13 mục 1). */
const CODE_TEXT: Record<string, string> = {
  CONFLICT_DELETE: 'Mục vừa được sửa và xoá cùng lúc',
  DUPLICATE: 'Bị trùng',
  DUPLICATE_KEY: 'Mã mục bị trùng',
  DUPLICATE_OPTION_ID: 'Lựa chọn bị trùng mã',
  EMPTY_AFTER_NORMALIZE: 'Nội dung trống sau khi chuẩn hoá',
  INVALID: 'Giá trị không hợp lệ',
  INVALID_FORMAT: 'Sai định dạng',
  INVALID_REF: 'Tham chiếu không hợp lệ',
  INVALID_TYPE: 'Loại mục không hợp lệ',
  NOT_FOUND: 'Mục không còn tồn tại',
  REQUIRED: 'Bắt buộc nhập',
  STUDY_005: 'Đáp án đúng không nằm trong các lựa chọn',
  STUDY_006: 'Ảnh hoặc âm thanh chưa sẵn sàng',
  TOO_FEW: 'Chưa đủ số lượng tối thiểu',
  TOO_LONG: 'Quá dài',
  TOO_MANY: 'Quá nhiều',
  TOO_SHORT: 'Quá ngắn',
};

export function describeBulkError(detail: { code: string; message?: string }): string {
  return CODE_TEXT[detail.code] ?? detail.message ?? 'Giá trị không hợp lệ';
}

/**
 * `details[{ index, clientItemKey, field, code }]` → lỗi theo `clientItemKey` (app.md p4-01 §2 `map-bulk-errors`).
 * `index` là vị trí trong `upsert[]` ĐÃ GỬI — khi BE thiếu `clientItemKey` thì tra ngược qua `sent[index]`.
 */
export function mapBulkErrors(
  details: readonly BulkErrorDetail[],
  sent: readonly ItemInput[],
): Record<string, ItemErrors> {
  const result: Record<string, ItemErrors> = {};
  details.forEach((detail) => {
    const key = detail.clientItemKey ?? sent[detail.index]?.clientItemKey;
    if (!key) return;
    const entry = (result[key] ??= { fields: [] });
    entry.fields.push({ code: detail.code, field: detail.field ?? '', message: detail.message });
  });
  return result;
}

/** Khoá mục ĐẦU TIÊN có lỗi theo thứ tự hiển thị — màn soạn nhảy tới đó. */
export function firstErroredKey(
  errors: Record<string, unknown>,
  order: readonly string[],
): string | undefined {
  return order.find((key) => key in errors);
}
