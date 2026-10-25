import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { CursorPage } from '../types/portal.types';
import type {
  SkillOption,
  TalentCard,
  TalentProfile,
  TalentProof,
  TalentSearchParams,
} from '../types/talent.types';
import { toTalentCard, toTalentProfile } from '../utils/talent-mapper';
import { portalApi } from './portal.api';

/** Phản hồi `GET /skills` — chỉ lấy hai trường cho ô lọc; phần "tiến độ của tôi" là của người đang đăng nhập, không liên quan tới HR. */
interface SkillCatalogRow {
  code: string;
  name: string;
}

/**
 * Service THUẦN tìm ứng viên. Mọi lỗi được phân biệt Ở NƠI GỌI: `search` tắt toast (`RECR_002` → banner trạng thái, `RECR_010` → đếm ngược, 404 → làm mới),
 * `profile`/`proof` tắt toast vì 404 ("Ứng viên không còn hiển thị") và `RECR_010` là trạng thái giao diện tự xử lý. Ánh xạ qua `talent-mapper` để email/SĐT
 * (nếu có lọt vào) không bao giờ tới state.
 */
const quiet = { skipErrorToast: true } as RequestConfig;

export const talentService = {
  /** `skills` gửi dạng CSV (`a,b`) — BE nhận cả hai kiểu, nhưng CSV tránh phụ thuộc cách axios tuần tự hoá mảng (`skills[]=`). */
  search: async (
    companyId: string,
    params: TalentSearchParams,
    cursor?: string,
  ): Promise<CursorPage<TalentCard>> => {
    const { skills, ...rest } = params;
    const res = (
      await apiClient.get<CursorPage<TalentCard>>(portalApi.talentSearch(companyId), {
        params: { ...rest, ...(skills && skills.length > 0 && { skills: skills.join(',') }), cursor },
        ...quiet,
      })
    ).data;
    return { data: res.data.map(toTalentCard), meta: res.meta };
  },

  profile: async (companyId: string, userId: string): Promise<TalentProfile> =>
    toTalentProfile(
      (
        await apiClient.get<ApiResponse<TalentProfile>>(portalApi.talent(companyId, userId), quiet)
      ).data.data,
    ),

  proof: async (companyId: string, userId: string, skillId: string): Promise<TalentProof> =>
    (
      await apiClient.get<ApiResponse<TalentProof>>(
        portalApi.talentProof(companyId, userId, skillId),
        quiet,
      )
    ).data.data,

  skills: async (): Promise<SkillOption[]> =>
    (await apiClient.get<ApiResponse<SkillCatalogRow[]>>(portalApi.skills)).data.data.map((s) => ({
      code: s.code,
      name: s.name,
    })),
};
