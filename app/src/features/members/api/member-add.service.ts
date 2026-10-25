import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { memberLookupPath } from './member-add.api';
import { membersPath } from './members.api';
import type { AddMemberResult, MemberLookupItem } from './member-add.types';

/**
 * ⛔ `skipErrorToast` ở cả hai lời gọi: màn tự hiện lỗi NGAY DƯỚI kết quả (câu riêng cho từng mã — `INV_004` ở đây nghĩa "người
 * này đang bị chặn khỏi nhóm", khác câu "Bạn không thể tham gia nhóm này" mà bảng mã chung gán cho `INV_004`), toast của interceptor
 * sẽ hiện thêm MỘT câu sai ngữ cảnh.
 */
export const memberAddService = {
  /** `q` là email ĐẦY ĐỦ hoặc SĐT (E.164) — nơi gọi đã phân loại bằng `classifyContactInput`; BE từ chối tên/chuỗi dở dang (400). */
  async lookup(workspaceId: string, q: string): Promise<MemberLookupItem[]> {
    const response = await apiClient.get<MemberLookupItem[]>(memberLookupPath(workspaceId), {
      params: { q },
      skipErrorToast: true,
    });
    return unwrapData<MemberLookupItem[]>(response);
  },

  async add(workspaceId: string, userId: string): Promise<AddMemberResult> {
    const response = await apiClient.post<AddMemberResult>(
      membersPath(workspaceId),
      { userId },
      { skipErrorToast: true },
    );
    return unwrapData<AddMemberResult>(response);
  },
};
