import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient dùng chung.
 *
 * Ba khác biệt so với cấu hình web, đều vì đặc thù di động:
 *
 *  · `retry: 1` — mạng di động rớt gói thường xuyên, một lượt thử lại chữa được
 *    phần lớn ca chập chờn. Nhiều hơn thì người dùng ngồi nhìn spinner rất lâu
 *    trước khi biết là hỏng, và nếu đang trong vùng sóng yếu thì mỗi lần thử lại
 *    còn ngốn pin.
 *
 *  · `refetchOnWindowFocus: false` — trên di động "focus" bắn mỗi lần người dùng
 *    chuyển app qua lại, kể cả khi chỉ liếc thông báo. Bật lên là một cơn mưa
 *    request trên mạng 4G tính theo dung lượng. Chỗ nào THẬT SỰ cần dữ liệu mới
 *    thì gọi `refetch()` tường minh, hoặc kéo-để-làm-mới.
 *
 *  · `refetchOnReconnect: true` — bù lại cho hai điều trên. Đây mới là tín hiệu
 *    đúng của di động: vừa có sóng lại thì dữ liệu trên màn chắc chắn đã cũ.
 *
 * `staleTime` 60s: đủ để chuyển màn qua lại không gọi lại API, đủ ngắn để dữ
 * liệu không cũ tới mức gây hiểu nhầm.
 *
 * `networkMode: 'always'` (p0-12): `onlineManager` được nối với NetInfo ở
 * `core/net/online-manager.ts` để `refetchOnReconnect` có tín hiệu thật (RN không
 * có sự kiện `online` của trình duyệt). Chế độ mặc định `'online'` sẽ còn TREO
 * request khi mất mạng — skeleton quay mãi, nút Lưu quay mãi — trong khi các màn
 * hiện có được viết theo giả định request THẤT BẠI NGAY khi mất sóng. `'always'`
 * giữ đúng hành vi cũ (chạy luôn, hỏng ngay), chỉ thêm việc tự tải lại khi có mạng.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'always',
    },
    mutations: {
      // ⛔ Mutation KHÔNG tự thử lại: gửi trùng một lượt "tạo phiếu" hay
      // "duyệt" là tạo ra hai bản ghi thật, không thể tự sửa.
      retry: false,
      networkMode: 'always',
    },
  },
});
