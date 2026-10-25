import { create } from 'zustand';

/**
 * "Ý định" mở tấm Báo cáo / xác nhận Chặn từ MỘT feature bất kỳ (p1-08).
 *
 * ── Vì sao có store này ─────────────────────────────────────────────────────
 * Menu tin (`chat`), thẻ thành viên (`members`), thông tin kênh (`channels`), thông tin hội
 * thoại (`conversations`) đều cần mở `ReportSheet`/`BlockConfirmSheet` — mà hai tấm đó thuộc
 * `features/moderation/` và các feature kia KHÔNG được import nhau (`feature-structure.md`).
 * Nơi gọi chỉ GHI một yêu cầu vào store này (qua `useModerationActions`); `ModerationHost`
 * (`moderation`, mount MỘT lần ở `app/(app)/_layout.tsx` — nơi lắp ráp được phép import mọi
 * feature) đọc yêu cầu rồi dựng tấm tương ứng.
 *
 * ⚠️ Khác `app.md` p1-08 §2 (route modal `/(app)/report?targetType=&targetId=`): một route
 * modal đẩy vào ngăn xếp `Tabs` của `(app)` sẽ CHUYỂN TAB (rồi `router.back()` quay về tab
 * ĐẦU chứ không về màn chat), và trên máy tính bảng chia đôi (`MessagesSplitLayout`) không có
 * "màn trước" để lùi về. Host + store không có hai điểm yếu đó, và truyền được kiểu có cấu trúc
 * thay vì chuỗi tham số phải parse lại.
 *
 * Không lưu bền, không lưu người dùng: đăng xuất xoá qua `reset()`.
 */

/** Đích báo cáo — hình dạng khớp `POST /reports` (`targetType` + `targetId`), kèm thứ tấm cần để vẽ. */
export type ReportRequest =
  | {
      targetType: 'MESSAGE';
      targetId: string;
      /** Tác giả tin — có thì tấm hiện ô "Chặn người này"; `null` (tin hệ thống) thì không. */
      authorId: string | null;
    }
  | {
      targetType: 'USER';
      targetId: string;
      name?: string;
      /** Báo cáo trong ngữ cảnh một nhóm → người kiểm duyệt của nhóm xử lý (BE `contextWorkspaceId`). */
      contextWorkspaceId?: string;
    }
  | { targetType: 'CHANNEL'; targetId: string; name?: string }
  | { targetType: 'CONVERSATION'; targetId: string; name?: string };

export interface BlockRequest {
  userId: string;
  name?: string;
  /** `block` = hỏi trước khi chặn; `unblock` = hỏi trước khi bỏ chặn. */
  mode: 'block' | 'unblock';
}

interface ModerationIntentState {
  report: ReportRequest | null;
  block: BlockRequest | null;
  requestReport: (request: ReportRequest) => void;
  requestBlock: (request: BlockRequest) => void;
  closeReport: () => void;
  closeBlock: () => void;
  reset: () => void;
}

export const useModerationIntentStore = create<ModerationIntentState>((set) => ({
  report: null,
  block: null,
  requestReport: (report) => set({ report }),
  requestBlock: (block) => set({ block }),
  closeReport: () => set({ report: null }),
  closeBlock: () => set({ block: null }),
  reset: () => set({ report: null, block: null }),
}));
