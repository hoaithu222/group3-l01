import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  ME_WELLBEING_ASSESSMENTS_PATH,
  ME_WELLBEING_BREAK_PATH,
  ME_WELLBEING_DATA_PATH,
  ME_WELLBEING_PATH,
  ME_WELLBEING_SHARES_PATH,
  MY_ACTIVE_WORKSPACES_PATH,
  wellbeingAckPath,
  wellbeingSharePath,
} from './wellbeing.api';
import { parseHistory, parseMyWorkspaces, parseSetting, parseShare, parseShares } from './wellbeing.schemas';
import type {
  AckAction,
  MyWorkspace,
  PatchWellbeingInput,
  TakeBreakInput,
  UpdateWellbeingInput,
  WellbeingDays,
  WellbeingHistory,
  WellbeingSetting,
  WellbeingShare,
} from './wellbeing.types';

/**
 * Theo dõi sức khoẻ học tập (p7-03). ⚠️ Mọi lời gọi `skipErrorToast: true`: màn tự hiện lỗi bằng câu của feature (`wellbeing-errors.ts`,
 * gồm mã `WELL_*`/`CFG_005`) — để interceptor toast thêm là hai câu cho một lỗi. Đọc phản hồi qua schema (cắt điểm số, bỏ phần hỏng).
 */
const QUIET = { skipErrorToast: true } as const;

export const wellbeingService = {
  /** Không tạo dòng nào ở BE khi chỉ xem: chưa bật ⇒ `{ enabled: false, … }` mặc định. Cờ `burnout` tắt ⇒ 404 `CFG_005`. */
  async setting(): Promise<WellbeingSetting> {
    return parseSetting(unwrapData(await apiClient.get(ME_WELLBEING_PATH, QUIET)));
  },

  /**
   * Đường DUY NHẤT để bật/tắt: `optIn: true` bật; `optIn: false` tắt VÀ xoá dữ liệu ngay. ⚠️ Tắt luôn dùng được kể cả khi cờ `burnout` tắt —
   * quyền rút lại của người dùng không phụ thuộc việc admin tắt phân hệ. Bật thì cần cờ (BE 404 `CFG_005`).
   */
  async update(input: UpdateWellbeingInput): Promise<WellbeingSetting> {
    return parseSetting(unwrapData(await apiClient.put(ME_WELLBEING_PATH, input, QUIET)));
  },

  /**
   * Sửa cài đặt của người ĐANG bật (đổi "Nhắc nhẹ"). Không có `optIn` nên không bao giờ bật lại: chưa/đã tắt ⇒ 409 `WELL_001`, BE không ghi gì. Cần cờ `burnout` (tắt ⇒ 404 `CFG_005`).
   * Trả `SettingDto` như `PUT`.
   */
  async patch(input: PatchWellbeingInput): Promise<WellbeingSetting> {
    return parseSetting(unwrapData(await apiClient.patch(ME_WELLBEING_PATH, input, QUIET)));
  },

  /** `WELL_001` (409) khi chưa bật — màn chuyển sang giải thích/bật. `days` chỉ 7 hoặc 30. */
  async history(days: WellbeingDays): Promise<WellbeingHistory> {
    return parseHistory(
      unwrapData(
        await apiClient.get(ME_WELLBEING_ASSESSMENTS_PATH, { ...QUIET, params: { days } }),
      ),
    );
  },

  /** 204. `DISMISS` = "Đã hiểu"; `SNOOZE` = "Nhắc lại sau" (BE tạm hoãn cảnh báo 24 giờ). Bấm lại là no-op; id không phải của tôi ⇒ 404. */
  async ack(assessmentId: string, action: AckAction): Promise<void> {
    await apiClient.post(wellbeingAckPath(assessmentId), { action }, QUIET);
  },

  /** 204. Xoá toàn bộ chỉ số + đánh giá đã thu thập, GIỮ trạng thái bật. Luôn dùng được, kể cả khi cờ `burnout` tắt. */
  async deleteData(): Promise<void> {
    await apiClient.delete(ME_WELLBEING_DATA_PATH, QUIET);
  },

  /** 204. P1 — TakeABreakWidget báo đã nghỉ xong; không trả gì để đọc lại (BE không lưu bản ghi riêng). Cần cờ `burnout`. */
  async takeBreak(input: TakeBreakInput): Promise<void> {
    await apiClient.post(ME_WELLBEING_BREAK_PATH, input, QUIET);
  },

  /** P1 — danh sách nhóm tôi ĐÃ tự bật chia sẻ mức rủi ro (không phải mọi nhóm tôi tham gia). */
  async shares(): Promise<WellbeingShare[]> {
    return parseShares(unwrapData(await apiClient.get(ME_WELLBEING_SHARES_PATH, QUIET)));
  },

  /** P1 — bật chia sẻ với một nhóm. `WELL_001` chưa bật theo dõi; `WELL_002` không phải thành viên ACTIVE của nhóm. Idempotent. */
  async share(workspaceId: string): Promise<WellbeingShare> {
    return parseShare(unwrapData(await apiClient.put(wellbeingSharePath(workspaceId), undefined, QUIET)));
  },

  /** 204. P1 — tắt chia sẻ; luôn được phép (kể cả đã tắt theo dõi/rời nhóm). Idempotent. */
  async unshare(workspaceId: string): Promise<void> {
    await apiClient.delete(wellbeingSharePath(workspaceId), QUIET);
  },

  /** P1 — nhóm tôi đang là thành viên (danh sách chọn chia sẻ) — gọi THẲNG `GET /workspaces`, không qua `features/workspaces`. */
  async myWorkspaces(): Promise<MyWorkspace[]> {
    return parseMyWorkspaces(
      unwrapData(
        await apiClient.get(MY_ACTIVE_WORKSPACES_PATH, { ...QUIET, params: { status: 'ACTIVE' } }),
      ),
    );
  },
};
