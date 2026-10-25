import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { workspaceSearchKeys, workspaceSearchService, type WorkspaceSearchPage } from '../api';

/** Đánh dấu `joined: true` cho kênh vừa vào ở MỌI trang kết quả đang cache (mọi từ khoá/bộ lọc của nhóm này). */
function markJoined(
  data: InfiniteData<WorkspaceSearchPage> | undefined,
  channelId: string,
): InfiniteData<WorkspaceSearchPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.map((row) =>
        row.type === 'channels' && row.hit.channelId === channelId
          ? { ...row, hit: { ...row.hit, joined: true } }
          : row,
      ),
    })),
  };
}

/**
 * Tham gia kênh CÔNG KHAI từ kết quả tìm loại Kênh — cùng endpoint với "Khám phá" của `channels`, không import feature đó.
 * Thành công thì kết quả đang hiện đổi ngay sang "đã tham gia" (không phải tìm lại — tốn hạn mức 30 lần/phút) và danh sách
 * kênh của nhóm được làm mới (khoá `['channels', wsId, …]` là hợp đồng cache của `channels`).
 */
export function useJoinChannelFromSearch(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (channelId: string) => workspaceSearchService.joinChannel(channelId),
    onSuccess: (_result, channelId) => {
      queryClient.setQueriesData<InfiniteData<WorkspaceSearchPage>>(
        { queryKey: workspaceSearchKeys.results(workspaceId) },
        (data) => markJoined(data, channelId),
      );
      void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
      // `['channels', wsId]` KHÔNG khớp chi tiết kênh (`['channels','detail',chId]`) hay thành viên (`['channels',chId,'members']`)
      // — thiếu hai dòng này thì mở kênh ngay sau khi tham gia vẫn thấy quyền của người ngoài (ô nhập bị khoá) tới hết `staleTime`.
      void queryClient.invalidateQueries({ queryKey: ['channels', 'detail', channelId] });
      void queryClient.invalidateQueries({ queryKey: ['channels', channelId, 'members'] });
    },
  });
}
