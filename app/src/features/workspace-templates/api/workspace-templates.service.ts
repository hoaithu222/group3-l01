import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  applyTemplatePath,
  WORKSPACE_TEMPLATES_PATH,
  workspaceChannelsPath,
  workspacePath,
} from './workspace-templates.api';
import type {
  ApplyTemplatePayload,
  ApplyTemplateResult,
  TemplateWorkspaceHead,
  WorkspaceTemplate,
} from './workspace-templates.types';

interface ChannelListPayload {
  discoverable: { name: string }[];
  joined: { name: string }[];
}

const NO_CHANNELS: ChannelListPayload = { discoverable: [], joined: [] };

/**
 * Mọi lượt gọi dùng `skipErrorToast`: lỗi (`TPL_*`, 403, 429, mạng) hiện TẠI CHỖ trong màn — toast chung ở đây sẽ trùng với
 * khối lỗi của màn và không có chữ hướng xử lý.
 */
export const workspaceTemplatesService = {
  /** Mẫu đang bật (Nhóm môn học / Đồ án / Nhóm tự học…) kèm danh sách kênh. Quản trị viên sửa mẫu ở admin (chỉ áp cho nhóm tạo sau). */
  async list(): Promise<WorkspaceTemplate[]> {
    const response = await apiClient.get<WorkspaceTemplate[]>(WORKSPACE_TEMPLATES_PATH, {
      skipErrorToast: true,
    });
    return unwrapData<WorkspaceTemplate[]>(response);
  },

  /**
   * Áp mẫu cho nhóm đã có. `Idempotency-Key` BẮT BUỘC (thiếu là 400): gọi lại cùng khoá trả đúng kết quả lần đầu. ⚠️ BE lưu cả
   * phản hồi 4xx theo khoá — nơi gọi phải đổi khoá sau mỗi phản hồi đã chốt (`useIdempotencyKey`).
   */
  async apply(
    workspaceId: string,
    { channelKeys, code, idempotencyKey }: ApplyTemplatePayload,
  ): Promise<ApplyTemplateResult> {
    const response = await apiClient.post<ApplyTemplateResult>(
      applyTemplatePath(workspaceId, code),
      { channelKeys },
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<ApplyTemplateResult>(response);
  },

  /**
   * Tên kênh ĐÃ CÓ (đang hoạt động + đã lưu trữ) để báo trước kênh của mẫu sẽ bị bỏ qua vì trùng tên. Chỉ là gợi ý: kênh
   * riêng tư mình không thấy thì không có ở đây — BE mới là chuẩn và báo lại ở kết quả. Lưu trữ lỗi thì bỏ qua phần đó.
   */
  async listChannelNames(workspaceId: string): Promise<string[]> {
    const load = async (status: 'ACTIVE' | 'ARCHIVED') =>
      unwrapData<ChannelListPayload>(
        await apiClient.get<ChannelListPayload>(workspaceChannelsPath(workspaceId), {
          params: { include: 'all', status },
          skipErrorToast: true,
        }),
      );
    const [active, archived] = await Promise.all([
      load('ACTIVE'),
      load('ARCHIVED').catch(() => NO_CHANNELS),
    ]);
    return [active, archived].flatMap((list) =>
      [...list.joined, ...list.discoverable].map((channel) => channel.name),
    );
  },

  /**
   * Vai trò của mình + trạng thái nhóm — cùng phản hồi `GET /workspaces/:id` mà `workspaces` dùng.
   * ⛔ Trả NGUYÊN phản hồi (chỉ khai kiểu hẹp), KHÔNG chọn riêng `myRole`: khoá cache `workspaceDetailKey` dùng chung với
   * `useWorkspace()`, mà bên đó đọc nó như một `WorkspaceDetail` đầy đủ.
   */
  async getWorkspaceHead(workspaceId: string): Promise<TemplateWorkspaceHead> {
    const response = await apiClient.get<TemplateWorkspaceHead>(workspacePath(workspaceId), {
      skipErrorToast: true,
    });
    return unwrapData<TemplateWorkspaceHead>(response);
  },
};
