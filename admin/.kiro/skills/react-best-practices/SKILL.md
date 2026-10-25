---
name: react-best-practices
description: Checklist tối ưu hiệu năng React cho base-projects — re-render, bundle, JS thuần — trích từ bộ 45 rule của Vercel Engineering, đã lược bỏ phần Next.js/RSC không áp dụng (project dùng Vite SPA). Dùng khi nghi ngờ 1 màn hình chậm hoặc trước khi ship 1 tính năng nặng dữ liệu.
---

# React Performance Checklist

base-projects là **Vite SPA** (React Router v7, không SSR/RSC) — các rule
gắn với Next.js App Router/Server Components **KHÔNG áp dụng** và đã bị loại
khỏi danh sách dưới đây (đánh dấu rõ ở cuối để biết vì sao bỏ).

## 1. Tránh waterfall — CRITICAL

- `await` song song bằng `Promise.all()` khi 2+ request độc lập, KHÔNG
  `await` tuần tự từng cái một.
- Query độc lập trong cùng component → tách `useQuery` riêng, đừng gộp
  `queryFn` ôm nhiều fetch nối tiếp.
- Bọc phần chờ lâu trong `<Suspense>` boundary riêng, đừng để 1 fetch chậm
  chặn toàn bộ cây component render.

## 2. Bundle size — CRITICAL

- KHÔNG import cả barrel khi chỉ cần 1 export (`import { formatDate } from
  '@/shared/utils/format/format.utils'`, không `import * as utils`).
- Thư viện nặng dùng hiếm (export PDF, xử lý ảnh...) → `import()` động ngay
  tại điểm dùng, không import tĩnh ở đầu file.
- Third-party script không thiết yếu (analytics...) → load sau khi UI chính
  đã tương tác được, không chặn initial render.
- Preload route/data khi hover vào link điều hướng tới nó (nếu chi phí thấp).

## 3. Client data fetching — MED-HIGH

- TanStack Query đã tự dedup request trùng key trong cùng thời điểm — KHÔNG
  tự viết cache/dedup layer riêng đè lên nó.
- Global event listener (resize, scroll, keydown...) → đăng ký 1 lần dùng
  chung (hook `useMediaQuery`/`useElementSize` có sẵn ở `@/shared/hooks`),
  KHÔNG mỗi component tự `addEventListener` riêng cho cùng 1 sự kiện.

## 4. Re-render — MEDIUM (áp dụng trực tiếp, fully React-generic)

- Đọc state ở component con nhất cần nó, không đọc ở cha rồi truyền prop
  xuống nhiều tầng nếu con cháu không cần re-render theo.
- `useMemo`/`useCallback`/`memo()` theo nguyên tắc ở `docs/rules/code-
  optimization.md` — không memo phản xạ.
- Dependency array chỉ chứa **giá trị primitive ổn định** — object/array tạo
  mới mỗi render trong deps làm effect chạy lại vô ích.
- Derived state tính trực tiếp trong render (hoặc `useMemo`), KHÔNG đồng bộ
  qua `useEffect` + `useState` riêng (2 nguồn sự thật, dễ lệch nhau).
- `setState` dạng hàm (`setCount(c => c + 1)`) khi update dựa trên giá trị cũ
  — tránh stale closure trong handler/effect.
- Khởi tạo state nặng qua lazy initializer: `useState(() => expensiveInit())`,
  KHÔNG `useState(expensiveInit())` (chạy lại mỗi render dù bị bỏ kết quả).
- `startTransition` cho update không khẩn cấp (filter danh sách lớn) để
  không chặn input đang gõ.

## 5. Rendering — MEDIUM

- SVG động (icon xoay, progress ring...) → animate transform ở wrapper, hạn
  chế animate trực tiếp path phức tạp.
- Danh sách dài ẩn ngoài viewport → cân nhắc `content-visibility: auto`.
- JSX tĩnh không phụ thuộc props/state → hoist ra ngoài component (khai 1
  lần ở module scope) thay vì tạo lại mỗi render.
- Điều kiện render: `cond ? <A/> : null`, tránh `cond && <A/>` khi `cond` có
  thể là `0`/`''` (render nhầm số 0 ra màn hình).

## 6. JS thuần — LOW-MED (không liên quan React, áp dụng mọi nơi tính toán nặng)

- Tra cứu lặp lại nhiều lần → build `Map`/object index 1 lần, đừng
  `array.find()` trong vòng lặp lồng nhau (O(n²) ẩn).
- Truy cập `array.length`/property lồng sâu trong vòng lặp nóng → cache ra
  biến local trước vòng lặp.
- Kiểm tra rẻ trước (`if (!arr.length) return`) trước khi làm việc tốn kém.
- Trùng lặp phần tử → `Set`, tra cứu theo key → `Map`, không `array.includes()`
  trong vòng lặp.
- `array.toSorted()` (immutable) thay `array.sort()` (mutate tại chỗ) khi
  không chắc ai khác còn giữ tham chiếu mảng gốc.

## 7. Advanced — LOW

- Handler cần đọc giá trị props/state MỚI NHẤT nhưng không muốn nằm trong
  dependency array (tránh effect chạy lại) → dùng ref pattern
  (`useEventCallback` có sẵn ở `@/shared/hooks`), không tự chế `useRef` +
  đồng bộ tay.

---

## Bị loại vì Next.js/RSC-specific — KHÔNG áp dụng cho Vite SPA này

`async-api-routes` (Next.js Route Handlers) · `bundle-dynamic-imports` kiểu
`next/dynamic` (dùng `React.lazy` chuẩn React thay thế) ·
`server-cache-react` (`React.cache()`, chỉ có nghĩa trong Server Component) ·
`server-serialization` (giảm data truyền Server→Client Component — không có
khái niệm này trong SPA) · `server-after-nonblocking` (Next `after()` API) ·
`rendering-hydration-no-flicker` (vấn đề riêng của SSR hydration, SPA không
hydrate). `client-swr-dedup` đã diễn giải lại thành TanStack Query ở mục 3.
