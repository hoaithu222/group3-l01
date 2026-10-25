/**
 * Kết quả ÁP MẪU nhóm (p5-04) — dùng chung giữa `workspaces` (`data.template` của `POST /workspaces`) và `workspace-templates`
 * (`POST /workspaces/:id/templates/:code/apply`). Nằm ở `shared/` vì hai feature không được import chéo nhau
 * (`docs/rules/feature-structure.md`), cùng cách `shared/search`.
 */

/** `NAME_EXISTS` — đã có kênh trùng tên (kể cả kênh lưu trữ); `TYPE_UNAVAILABLE` — loại kênh (thoại/pomodoro) chưa bật. */
export type TemplateSkipReason = 'NAME_EXISTS' | 'TYPE_UNAVAILABLE';

export interface TemplateCreatedChannel {
  id: string;
  key: string;
  name: string;
}

export interface TemplateSkippedChannel {
  key: string;
  /** Thường là `TemplateSkipReason`, nhưng BE có thể thêm lý do mới — luôn hiển thị qua `skipReasonLabel`. */
  reason: string;
}

export interface TemplateApplyResult {
  /** Mã mẫu — chỉ có ở kết quả của TẠO NHÓM. */
  code?: string;
  createdChannels: TemplateCreatedChannel[];
  /** Chỉ có ở kết quả của TẠO NHÓM: nhóm đã tạo xong nhưng áp mẫu lỗi (BE nuốt lỗi để không làm hỏng việc tạo nhóm). */
  failed?: boolean;
  skipped: TemplateSkippedChannel[];
}

/** Mẫu + kênh đã chọn khi TẠO NHÓM: `channelKeys` rỗng nghĩa là "dùng mẫu nhưng không tạo kênh nào" (BE chấp nhận). */
export interface TemplateSelection {
  channelKeys: string[];
  code: string;
}

/** Hợp đồng giữa form tạo nhóm (host, `workspaces`) và bước chọn mẫu (`workspace-templates`) do FILE ROUTE nối. */
export interface TemplateStepProps {
  /** Đang gửi yêu cầu tạo nhóm — khoá lựa chọn. */
  disabled: boolean;
  onChange: (value: TemplateSelection | null) => void;
  /** Tăng mỗi khi BE từ chối mẫu (`TPL_001`/`CFG_005`) — bước mẫu tải lại danh sách để mẫu đã tắt biến mất. */
  refreshToken: number;
  /** Mẫu đang chọn; `null` = "Không dùng mẫu". */
  value: TemplateSelection | null;
}

const SKIP_REASON_LABEL: Record<TemplateSkipReason, string> = {
  NAME_EXISTS: 'đã có kênh trùng tên',
  TYPE_UNAVAILABLE: 'loại kênh này chưa được bật',
};

export function skipReasonLabel(reason: string): string {
  return SKIP_REASON_LABEL[reason as TemplateSkipReason] ?? 'không tạo được';
}

export type TemplateOutcomeTone = 'info' | 'success' | 'warning';

export interface TemplateOutcome {
  message: string;
  tone: TemplateOutcomeTone;
}

/**
 * Một câu GỌN cho kết quả áp mẫu (toast sau khi tạo nhóm): `failed` → cảnh báo kèm hướng xử lý; tạo được thì báo số kênh và
 * số kênh bị bỏ qua. Chi tiết từng kênh do màn "Áp mẫu" hiển thị, không nhét vào toast.
 */
export function summarizeTemplateResult(result: TemplateApplyResult): TemplateOutcome {
  if (result.failed) {
    return {
      message:
        'Đã tạo nhóm nhưng chưa tạo được kênh theo mẫu. Bạn có thể áp lại mẫu trong Cài đặt nhóm.',
      tone: 'warning',
    };
  }
  const created = result.createdChannels.length;
  const skipped = result.skipped.length;
  if (created > 0 && skipped === 0)
    return { message: `Đã tạo ${created} kênh theo mẫu.`, tone: 'success' };
  if (created > 0)
    return { message: `Đã tạo ${created} kênh theo mẫu · bỏ qua ${skipped} kênh.`, tone: 'info' };
  if (skipped > 0)
    return { message: `Không tạo kênh mới — ${skipped} kênh bị bỏ qua.`, tone: 'info' };
  return { message: 'Không có kênh nào được tạo theo mẫu.', tone: 'info' };
}
