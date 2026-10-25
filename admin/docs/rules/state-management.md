# State Management — Zustand slices (`src/app/store/`)

> State CẤP APP (auth, theme, display mode) dùng Zustand, chia slice theo
> domain. State CẤP SERVER (dữ liệu từ API) dùng TanStack Query — xem
> `api-patterns.md`. State CẤP FORM dùng react-hook-form — xem `form-
> validation.md`. Đừng lẫn 3 loại này vào 1 chỗ.

## Khi nào Zustand, khi nào KHÔNG

| Loại state | Dùng gì |
|---|---|
| Dữ liệu từ server (list, detail, mutation) | TanStack Query — KHÔNG copy vào Zustand store |
| Auth/session, theme, display mode (state toàn app, nhiều nơi đọc) | Zustand slice |
| Filter/search/pagination/tab của 1 trang | URL qua `useQueryParams()` — KHÔNG Zustand, KHÔNG `useState` |
| State chỉ 1 component/2-3 component con dùng | `useState` cục bộ tại component cha gần nhất — KHÔNG "lỡ tay" đẩy lên Zustand global |

## Cấu trúc 1 slice — `src/app/store/slices/{domain}/`

```
slices/{domain}/
  index.ts       # export use{Domain}Store — hook chính, dùng create() (+ persist nếu cần)
  types.ts       # {Domain}StoreType — state + action trong 1 interface
  selectors.ts   # select* — derived value, tính 1 lần, không lặp logic ở nơi gọi
```

Barrel `src/app/store/index.ts` re-export TỪNG slice: hook chính + `types` +
`selectors` (+ `constants`/`utils` nếu slice có). Import store LUÔN qua
`@/app/store`, KHÔNG import sâu vào `slices/{domain}/...`.

## Selector — tính derived value 1 chỗ, đừng lặp logic ở nơi gọi

```ts
// selectors.ts
export const selectIsTv = (state: DisplayStoreType) => state.mode === 'tv';

export const selectEffectiveUiScale = (state: DisplayStoreType) =>
  state.mode === 'tv' ? state.uiScale : 1;
```

Ví dụ thật: `selectEffectiveUiScale` luôn trả `1` ở chế độ standard dù store
còn nhớ `uiScale` cũ đã chọn khi ở TV — **mọi nơi cần nhân cỡ chữ (chart
metrics...) PHẢI dùng selector này**, KHÔNG đọc thẳng `state.uiScale` (xem
`chart-conventions.md`). Đây là lý do có tầng selector: logic "khi nào áp
dụng scale" chỉ viết đúng 1 lần.

## `persist` middleware — khai `partialize` + `version`/`migrate` khi đổi shape

```ts
export const useThemeStore = create<ThemeStoreType>()(
  persist(
    (set, get) => ({ ...initialState, setTheme: ..., resetTheme: ... }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: () => ({ ...initialState }), // ép state cũ về mặc định khi đổi shape
      partialize: (state) => ({ theme: state.theme }), // CHỈ field cần lưu, không cả action
    },
  ),
);
```

`partialize` LUÔN khai rõ field nào được lưu — không mặc định lưu cả object
state (bao gồm cả function action, vô nghĩa khi serialize). Khi đổi shape
field đã persist (đổi enum, xoá field...) → tăng `version` + viết `migrate`
để state cũ trong `localStorage` của user không làm app crash lúc rehydrate.
Không phải slice nào cũng cần `persist` — chỉ dùng khi state cần sống qua
lần reload (theme, display mode), KHÔNG dùng cho state auth nhạy cảm (token
đã ở cookie HttpOnly, không cần Zustand lưu lại — xem `test-viewpoint.md §4`).

## Action — đặt trong cùng object `create()`, không tách file riêng

```ts
setTheme: (theme: ThemeMode) => set({ theme }),
toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
```

Action đơn giản viết trực tiếp trong `create()`. Chỉ tách hàm riêng ra ngoài
khi logic đủ phức tạp (gọi API, side-effect nhiều bước) — khi đó cân nhắc có
nên là TanStack Query mutation thay vì Zustand action hay không (đọc lại bảng
đầu file).

## Đọc store trong component — luôn qua selector, không lấy cả object

```tsx
// ✅ ĐÚNG — chỉ re-render khi đúng field này đổi
const isTv = useDisplayStore(selectIsTv);

// ❌ SAI — re-render mỗi khi BẤT KỲ field nào trong store đổi
const { mode } = useDisplayStore();
```

## Liên quan

`api-patterns.md` (server state, URL-synced filter) · `chart-conventions.md`
(ví dụ dùng `selectEffectiveUiScale` thật) · `tv-display-mode.md` (slice
`display` chi tiết) · `test-viewpoint.md` (token KHÔNG lưu Zustand/
localStorage).
