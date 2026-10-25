import { useMemo } from 'react';
import { z } from 'zod';

// ⛔ Import TƯƠNG ĐỐI trong `shared/ui` — import barrel `@/shared/ui` từ chính
// bên trong nó tạo vòng (kit2-architecture.md).
import FormModal from './FormModal';
import { reasonServerError } from './reason-server-error';
import { TextareaField, useZodForm } from '../form';

/** Độ dài lý do — khớp `reasonSchema` phía BE (`shared/dto/common-schemas`: 10–500 ký tự). */
const DEFAULT_MIN_REASON_LENGTH = 10;
const DEFAULT_MAX_REASON_LENGTH = 500;

const buildSchema = (min: number, max: number) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(min, `Lý do tối thiểu ${min} ký tự`)
      .max(max, `Lý do tối đa ${max} ký tự`),
  });
type Values = z.infer<ReturnType<typeof buildSchema>>;

export interface ConfirmWithReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Mô tả tác động của thao tác (vd "Tài khoản sẽ bị khoá ngay lập tức"). */
  impact: React.ReactNode;
  confirmLabel?: string;
  /**
   * Sắc thái nút xác nhận: `danger` (đỏ) cho thao tác phá huỷ/khó hoàn tác, `primary` (mặc định)
   * cho còn lại.
   */
  confirmTone?: 'danger' | 'primary';
  /** Độ dài tối thiểu của lý do. Mặc định 10 (khớp `reasonSchema` BE) — chỉ nâng lên, đừng hạ dưới BE. */
  minReasonLength?: number;
  /** Độ dài tối đa của lý do. Mặc định 500 (khớp `reasonSchema` BE). */
  maxReasonLength?: number;
  /**
   * Chạy khi người dùng xác nhận, nhận lý do đã `trim`. Trả Promise: nút xác nhận hiện
   * "Đang xử lý..." và bị khoá trong lúc chờ (chống bấm đúp); NÉM LỖI thì modal giữ mở để thử lại
   * (hiển thị lỗi là việc của nơi gọi). Riêng lỗi axios `400 VAL_001` có `details.reason` (BE từ chối
   * chính lý do) được gắn thẳng vào ô lý do — nơi gọi chỉ cần ném tiếp lỗi, không tự `setError`.
   */
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Modal xác nhận CÓ LÝ DO — dùng cho mọi thao tác quản trị ảnh hưởng người
 * khác (khoá tài khoản, gỡ quyền, huỷ đăng ký…) mà audit log cần ghi lại VÌ
 * SAO. Lý do bắt buộc ≥ 10 ký tự — khớp `reasonSchema` phía BE.
 *
 * Dùng lại `FormModal` thay vì `ConfirmDialog`: cần một ô nhập (textarea), và
 * `FormModal` đã lo submit/validate/giữ-mở-khi-lỗi/trạng thái đang gửi qua `useZodForm`.
 */
export default function ConfirmWithReasonModal({
  open,
  onOpenChange,
  title,
  impact,
  confirmLabel = 'Xác nhận',
  confirmTone = 'primary',
  minReasonLength = DEFAULT_MIN_REASON_LENGTH,
  maxReasonLength = DEFAULT_MAX_REASON_LENGTH,
  onConfirm,
}: ConfirmWithReasonModalProps) {
  const schema = useMemo(
    () => buildSchema(minReasonLength, maxReasonLength),
    [minReasonLength, maxReasonLength],
  );
  const form = useZodForm<Values>(schema, { defaultValues: { reason: '' } });

  return (
    <FormModal<Values>
      confirmLabel={confirmLabel}
      confirmSkin={confirmTone === 'danger' ? 'danger' : undefined}
      form={form}
      open={open}
      size="sm"
      title={title}
      onConfirm={async (data) => {
        if (!data) return;
        try {
          await onConfirm(data.reason);
        } catch (err) {
          // BE từ chối chính lý do (`VAL_001` + `details.reason`) → hiện dưới ô lý do thay vì chỉ toast chung.
          const message = reasonServerError(err);
          if (message) form.setError('reason', { type: 'server', message });
          throw err; // vẫn ném tiếp: FormModal giữ modal mở để sửa lý do và gửi lại
        }
        form.reset();
      }}
      onOpenChange={(next) => {
        if (!next) form.reset();
        onOpenChange(next);
      }}
    >
      <div className="text-body-14 text-fg-2">{impact}</div>
      <TextareaField
        label="Lý do"
        maxLength={maxReasonLength}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
}
