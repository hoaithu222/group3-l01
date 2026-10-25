import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { socket, SocketEvent, useConnectionState, useSocketEvent } from '@/core/socket';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { portfolioService } from '../api/portfolio.service';
import type {
  PortfolioBuild,
  PortfolioBuildUpdatedEvent,
  PortfolioOverview,
} from '../api/portfolio.types';
import { BUILD_POLL_CONNECTED_MS, BUILD_POLL_MS } from '../constants/portfolio.constants';
import { refreshOverview } from '../queries/portfolio.mutations';
import { portfolioKeys } from '../queries/portfolio.keys';
import { usePortfolio } from '../queries/portfolio.queries';
import { isBuildInFlight, mergeBuildEvent, patchBuild } from '../utils/portfolio-cache';

/**
 * Áp một kết quả dựng trang vào cache. Socket và poll cùng gọi hàm này nên nó IDEMPOTENT: cùng `(id, status)` hai lần thì lần sau không làm gì — không toast đôi.
 * Khi build vừa CHẠY → XONG: làm mới hồ sơ (`status`, `publicUrl`, `hasUnpublishedChanges` chỉ server biết) và báo kết quả đúng một lần.
 */
function applyBuild(
  queryClient: QueryClient,
  next: (current: PortfolioBuild | null) => PortfolioBuild | null,
): void {
  const before = queryClient.getQueryData<PortfolioOverview>(portfolioKeys.overview());
  if (!before) return;
  const current = before.latestBuild;
  const build = next(current);
  if (build?.id === current?.id && build?.status === current?.status) return;
  queryClient.setQueryData<PortfolioOverview | undefined>(
    portfolioKeys.overview(),
    patchBuild(before, build),
  );
  if (build?.status !== 'READY' && build?.status !== 'FAILED') return;
  void refreshOverview(queryClient);
  if (build.id !== current?.id || !isBuildInFlight(current)) return; // build server tự xếp (thu hồi huy hiệu): làm mới thầm lặng, không "chúc mừng"
  if (build.status === 'READY') {
    // Việc DÀI (dựng trang chạy nền) vừa xong ⇒ rung "thành công" kèm toast — người dùng có thể đang ở màn khác trong ngăn xếp portfolio.
    hapticSuccess();
    showToast('success', 'Đã công khai hồ sơ');
  } else showToast('error', 'Chưa tạo được trang portfolio. Mở hồ sơ để thử lại.');
}

/**
 * Tiến độ dựng trang (app.md p6-07 §4 "Socket"): `portfolio:build-updated` (`user:{id}`) vá `latestBuild`; nối lại socket ⇒ tải lại hồ sơ (sự kiện trong lúc
 * mất kết nối là mất hẳn). DỰ PHÒNG: khi build còn chạy thì hỏi `builds/latest` — 5 giây/lần nếu socket không nối, 20 giây/lần (lưới an toàn) nếu còn nối.
 * Mount ở màn Tổng quan: ngăn xếp giữ màn đó sống khi người dùng đi xem trước/sửa thông tin nên vẫn nhận sự kiện.
 */
export function usePortfolioBuildEvents(): void {
  const queryClient = useQueryClient();
  const connection = useConnectionState();
  const overview = usePortfolio();
  const inFlight = isBuildInFlight(overview.data?.latestBuild);

  useSocketEvent<PortfolioBuildUpdatedEvent>(SocketEvent.PORTFOLIO_BUILD_UPDATED, (event) => {
    if (typeof event?.buildId !== 'string') return;
    applyBuild(queryClient, (current) => mergeBuildEvent(current, event, new Date().toISOString()));
  });

  useEffect(() => {
    const onConnect = () => void refreshOverview(queryClient);
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [queryClient]);

  useQuery({
    enabled: inFlight,
    queryFn: async () => {
      const build = await portfolioService.latestBuild();
      applyBuild(queryClient, () => build);
      return build;
    },
    queryKey: portfolioKeys.latestBuild(),
    refetchInterval: connection === 'connected' ? BUILD_POLL_CONNECTED_MS : BUILD_POLL_MS,
    retry: false,
    staleTime: 0,
  });
}
