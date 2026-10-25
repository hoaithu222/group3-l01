import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { PICKER_MIN_QUERY, resourcePickerService } from '../api/resource-picker.service';

/** Chỉ tải khi tờ chọn tài liệu MỞ (`enabled`) — phần lớn lượt đặt in đi từ tệp tải lên hoặc từ Resource Hub, không cần danh sách này. */
export function usePickerWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: ['o2o', 'picker', 'workspaces'],
    queryFn: () => resourcePickerService.workspaces(),
    enabled,
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở tờ chọn là tải lại nền.
    staleTime: 0,
  });
}

/** PDF của MỘT nhóm — khoá gồm cả từ khoá tìm (`q`), thiếu là đổi từ khoá mà danh sách đứng yên. */
export function usePickerPdfs(workspaceId: string | null, rawQuery: string) {
  // Dưới ngưỡng tìm của BE (2 ký tự) thì ĐÚNG là danh sách gốc — quy về '' để gõ ký tự đầu tiên không làm một lượt tải trùng.
  const query = rawQuery.trim().length >= PICKER_MIN_QUERY ? rawQuery.trim() : '';
  return useInfiniteQuery({
    queryKey: ['o2o', 'picker', 'pdfs', workspaceId, query],
    queryFn: ({ pageParam }) => resourcePickerService.pdfs(workspaceId as string, query, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: workspaceId !== null,
    // 0: tài liệu được tải lên/xoá/đổi tên ở Resource Hub (feature `resources`) — không ai làm mới khoá riêng này; để 30 s thì
    // mở lại tấm chọn vẫn thiếu PDF vừa tải lên, còn PDF đã xoá vẫn chọn được (đặt in hỏng).
    staleTime: 0,
  });
}
