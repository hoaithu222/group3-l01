import type { AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  boardPath,
  configPath,
  createExportPath,
  exportPath,
  heatmapPath,
  memberTasksPath,
  periodsPath,
  reportPath,
  workspaceHeatmapPath,
  workspaceMembersPath,
  workspacePath,
} from './contribution.api';
import type {
  BoardMeta,
  ContributionConfig,
  ContributionExport,
  ContributionPeriods,
  ContributionReport,
  CreateExportInput,
  ExportRef,
  Heatmap,
  HeatmapQuery,
  MemberTaskItem,
  MemberTasksPage,
  PeriodKey,
  PutContributionConfigInput,
  WorkspaceMemberOption,
  WorkspaceTimezone,
} from './contribution.types';

/** Số thẻ mỗi trang danh sách "thẻ được tính" — trần của BE (`LIMITS.contribution.memberTasksPageMax`). */
export const MEMBER_TASKS_PAGE_SIZE = 50;

/**
 * ⛔ Danh sách cursor KHÔNG dùng `unwrapData`: BE trả `{ data: [...], meta }` ở gốc thân, `unwrapData` bóc `.data` và VỨT `meta`
 * → `getNextPageParam` nổ (cùng bẫy `inboxService.list`).
 */
function cursorPage(response: AxiosResponse<{ data: MemberTaskItem[]; meta?: { nextCursor?: string | null } }>): MemberTasksPage {
  return { items: response.data.data ?? [], nextCursor: response.data.meta?.nextCursor ?? null };
}

/** Chuẩn hoá phản hồi heatmap: BE điền đủ ngày nhưng app không tin điều đó tuyệt đối (thiếu `days`/`maxTotal` thì coi là rỗng). */
function toHeatmap(response: AxiosResponse<Heatmap>): Heatmap {
  const data = unwrapData<Heatmap>(response);
  return { ...data, days: data.days ?? [], maxTotal: data.maxTotal ?? 0 };
}

/**
 * Lớp gọi API của báo cáo đóng góp. Mọi lời gọi `skipErrorToast`: màn tự vẽ lỗi trong khối (banner/tấm) — toast tự tắt sau vài
 * giây còn khối "Không tải được" thì nằm lại đúng chỗ người dùng đang nhìn. Không có lời gọi nào sửa điểm của người khác.
 */
export const contributionService = {
  async board(boardId: string): Promise<BoardMeta> {
    const response = await apiClient.get<BoardMeta>(boardPath(boardId), { skipErrorToast: true });
    const data = unwrapData<BoardMeta>(response);
    return { archivedAt: data.archivedAt ?? null, id: data.id, myPermissions: data.myPermissions ?? [], name: data.name };
  },

  async report(boardId: string, period: PeriodKey): Promise<ContributionReport> {
    const response = await apiClient.get<ContributionReport>(reportPath(boardId), { params: { period }, skipErrorToast: true });
    const data = unwrapData<ContributionReport>(response);
    return { ...data, members: data.members ?? [] };
  },

  async periods(boardId: string): Promise<ContributionPeriods> {
    const response = await apiClient.get<ContributionPeriods>(periodsPath(boardId), { skipErrorToast: true });
    const data = unwrapData<ContributionPeriods>(response);
    return { months: data.months ?? [], timezone: data.timezone, weeks: data.weeks ?? [] };
  },

  async memberTasks(boardId: string, userId: string, period: PeriodKey, cursor?: string): Promise<MemberTasksPage> {
    const response = await apiClient.get<{ data: MemberTaskItem[]; meta?: { nextCursor?: string | null } }>(
      memberTasksPath(boardId, userId),
      { params: { cursor, limit: MEMBER_TASKS_PAGE_SIZE, period }, skipErrorToast: true },
    );
    return cursorPage(response);
  },

  async config(boardId: string): Promise<ContributionConfig> {
    const response = await apiClient.get<ContributionConfig>(configPath(boardId), { skipErrorToast: true });
    return unwrapData<ContributionConfig>(response);
  },

  /** `PUT` với `expectedVersion` (CAS): lệch → `RES_003` (`details.currentVersion`), tổng ≠ 100 → `CONTRIB_002`. */
  async putConfig(boardId: string, input: PutContributionConfigInput): Promise<ContributionConfig> {
    const response = await apiClient.put<ContributionConfig>(configPath(boardId), input, { skipErrorToast: true });
    return unwrapData<ContributionConfig>(response);
  },

  async heatmap(boardId: string, query: HeatmapQuery): Promise<Heatmap> {
    const response = await apiClient.get<Heatmap>(heatmapPath(boardId), { params: query, skipErrorToast: true });
    return toHeatmap(response);
  },

  /** Heatmap gộp MỌI bảng của nhóm (p4-06). Khách/người ngoài → 404, khoảng ngày quá dài → `CONTRIB_004`. */
  async workspaceHeatmap(workspaceId: string, query: HeatmapQuery): Promise<Heatmap> {
    const response = await apiClient.get<Heatmap>(workspaceHeatmapPath(workspaceId), { params: query, skipErrorToast: true });
    return toHeatmap(response);
  },

  /**
   * ⛔ Trả NGUYÊN payload của `GET /workspaces/:id`, KHÔNG bóc riêng `effectiveTimezone`: khoá cache `['workspaces','detail',wsId]` dùng chung với
   * `features/workspaces` và `features/boards` (mỗi bên ghi tay khoá, không import chéo) — bóc bớt trường là làm nghèo dữ liệu của hai bên kia.
   */
  async workspaceTimezone(workspaceId: string): Promise<WorkspaceTimezone> {
    const response = await apiClient.get<WorkspaceTimezone>(workspacePath(workspaceId), { skipErrorToast: true });
    return unwrapData<WorkspaceTimezone>(response);
  },

  /** Thành viên nhóm đang ACTIVE (≤ 100). Đọc `response.data.data` vì endpoint kèm `meta` phân trang (`unwrapData` sẽ vứt `meta`, và ở đây không cần nó). */
  async workspaceMembers(workspaceId: string): Promise<WorkspaceMemberOption[]> {
    const response = await apiClient.get<{ data: WorkspaceMemberOption[] }>(workspaceMembersPath(workspaceId), {
      params: { limit: 100, page: 1, status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return response.data.data ?? [];
  },

  /** `202` (đang tạo) hoặc `200` (bản READY cùng dữ liệu) — cả hai đều trả `{ exportId, status }`. */
  async createExport(boardId: string, input: CreateExportInput): Promise<ExportRef> {
    const response = await apiClient.post<ExportRef>(createExportPath(boardId), input, { skipErrorToast: true });
    return unwrapData<ExportRef>(response);
  },

  /** Trạng thái xuất — KHÔNG kèm URL. Hết hạn → `410 CONTRIB_005`. */
  async getExport(exportId: string): Promise<ContributionExport> {
    const response = await apiClient.get<ContributionExport>(exportPath(exportId), { skipErrorToast: true });
    return unwrapData<ContributionExport>(response);
  },

  /**
   * URL tải PDF, ký sống ≤ 60 giây — ⛔ gọi NGAY lúc người dùng bấm "Mở PDF", không giữ trong cache/state: URL cũ hết hạn và mở
   * ra lỗi khó hiểu. Chưa READY → `409 CONTRIB_006`, hết hạn → `410 CONTRIB_005`.
   */
  async exportDownloadUrl(exportId: string): Promise<string> {
    const response = await apiClient.get<ContributionExport>(exportPath(exportId), { params: { download: 1 }, skipErrorToast: true });
    const url = unwrapData<ContributionExport>(response).url;
    if (!url) throw new Error('Không lấy được đường dẫn tệp báo cáo.');
    return url;
  },
};
