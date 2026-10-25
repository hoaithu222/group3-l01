import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { capabilitiesService, type Capabilities } from '@/core/capabilities';
import { appConfig } from '@/core/config/env.config';
import { readJson, writeJson } from '@/core/storage/app-storage';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useClockOffsetStore } from '@/shell/store/slices/clock';

/**
 * `useCapabilities()` — cờ phân hệ + giới hạn nghiệp vụ hiện hành, từ backend.
 *
 * ── Vì sao cần cache OFFLINE, không chỉ cache của React Query ────────────────
 * `gcTime` của React Query chỉ giữ dữ liệu trong BỘ NHỚ — tắt app là mất. Mở
 * lại app lúc mất mạng (hầm gửi xe, máy bay) thì `queryFn` treo hoặc lỗi, và
 * nếu không có gì khác, `useAccessibleModules()` không biết cờ nào đang bật ⇒
 * ẩn sạch các tab có `featureFlag`, người dùng tưởng app hỏng. `CACHE_KEY` ghi
 * xuống `AsyncStorage` mỗi lần tải THÀNH CÔNG, và `AppProviders` đọc lại bản
 * này để mồi vào `queryClient` (`setQueryData`) TRƯỚC khi query thật chạy —
 * xem `readCachedCapabilities()`.
 *
 * ⚠️ Không dùng kho khoá (`secure-storage`): capabilities không phải bí mật,
 * và kho khoá chậm hơn nhiều — không đáng cho dữ liệu đọc mỗi lần mở app.
 */
export const CAPABILITIES_QUERY_KEY = ['capabilities'] as const;

/** Khoá `AsyncStorage` giữ bản capabilities tải thành công gần nhất. */
const CAPABILITIES_CACHE_KEY = 'capabilities.last';
/** `ETag` của bản trên (p0-07) — khoá RIÊNG để `readCachedCapabilities()` giữ nguyên hình dạng cũ (chỉ dữ liệu). */
const CAPABILITIES_ETAG_KEY = 'capabilities.etag';

/**
 * Làm mới capabilities ngay (`invalidate` → tải lại có điều kiện `If-None-Match`, 304 rẻ). Dùng khi có tín hiệu cấu hình đổi:
 * `config:updated`, foreground sau ≥ 60 s ở nền, socket nối lại, một API trả `CFG_005` (p0-07 `app.md` §4).
 */
export function refreshCapabilities(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
}

export function useRefreshCapabilities(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => refreshCapabilities(queryClient);
}

export function useCapabilities() {
  const status = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    // 5 phút: đủ để chuyển tab qua lại không gọi lại, đủ ngắn để cờ mới bật ở
    // admin lan tới app trong một phiên dùng (không cần đăng xuất/vào lại).
    staleTime: 5 * 60_000,
    // 24 giờ: `gcTime` chỉ quyết định dữ liệu sống trong BỘ NHỚ bao lâu sau khi
    // không còn observer nào dùng tới — dài hơn nhiều so với các query khác vì
    // đây là dữ liệu vẽ KHUNG app (thanh tab), mất khung giữa chừng dễ thấy hơn
    // mất dữ liệu danh sách.
    gcTime: 24 * 3_600_000,
    /**
     * Tắt xác thực (`appConfig.authEnabled === false`) ⇒ luôn bật, vì lúc đó
     * không có khái niệm "chưa đăng nhập" — đây là chế độ dựng giao diện.
     * Bật xác thực ⇒ CHỈ gọi khi đã có phiên; gọi lúc `restoring`/`anonymous`
     * là một request 401 chắc chắn hỏng, và với `EXPO_PUBLIC_ENABLE_REFRESH_TOKEN`
     * bật thì đó còn là một lượt refresh vô nghĩa ở MỖI lần mở app.
     */
    enabled: !appConfig.authEnabled || status === 'authenticated',
    queryFn: async () => {
      // Hỏi CÓ ĐIỀU KIỆN chỉ khi còn bản trong bộ nhớ để trả lại nếu 304; không thì tải đủ (200).
      const current = queryClient.getQueryData<Capabilities>(CAPABILITIES_QUERY_KEY);
      const etag = current ? await readJson<string>(CAPABILITIES_ETAG_KEY) : null;
      const result = await capabilitiesService.fetch(etag);
      if (result.notModified) {
        if (current) return current;
        // 304 mà không có bản để trả (dữ liệu bị xoá giữa chừng) — tải lại không điều kiện.
        return capabilitiesService.get();
      }
      const data = result.data;
      // Cố ý KHÔNG `await` lỗi ghi cache làm hỏng query: đọc thành công là việc
      // chính, ghi cache offline chỉ là phụ trợ. `writeJson` tự nuốt lỗi ghi.
      await Promise.all([
        writeJson(CAPABILITIES_CACHE_KEY, data),
        writeJson(CAPABILITIES_ETAG_KEY, result.etag),
      ]);
      if (data.serverNow) useClockOffsetStore.getState().setFromServerNow(data.serverNow);
      return data;
    },
  });
}

/**
 * Một cờ phân hệ cụ thể đang bật hay không.
 *
 * Trả `undefined` khi CHƯA có dữ liệu (đang tải lần đầu, chưa có cache) — phân
 * biệt với `false` (đã biết chắc là TẮT). `useAccessibleModules()` dựa vào ranh
 * giới này để không ẩn tab trong lúc còn đang tải.
 */
export function useFeature(flag: string): boolean | undefined {
  const { data } = useCapabilities();
  return data ? Boolean(data.features[flag]?.enabled) : undefined;
}

/**
 * Đọc bản capabilities đã cache (AsyncStorage) — KHÔNG qua React Query.
 *
 * Gọi Ở `AppProviders` lúc khởi động, rồi mồi kết quả vào `queryClient` bằng
 * `setQueryData(CAPABILITIES_QUERY_KEY, cached)` TRƯỚC khi `useCapabilities()`
 * chạy lần đầu. Nhờ vậy màn hình đầu tiên (thanh tab) vẽ ĐÚNG cờ ngay cả khi
 * mất mạng, thay vì chớp qua trạng thái "chưa có dữ liệu" rồi mới ổn định.
 */
export function readCachedCapabilities(): Promise<Capabilities | null> {
  return readJson<Capabilities>(CAPABILITIES_CACHE_KEY);
}
