# Hướng dẫn và Quy tắc cho Antigravity (Gemini) — Super App Mobile (React Native)

Tài liệu này áp dụng cho toàn bộ thư mục `app/` trong Super App.
Đường dẫn bên dưới tính từ thư mục `app/`. Tham khảo thêm `../GEMINI.md` cho quy tắc toàn repository.
Lưu ý: Cây route được nhắc tới là `super-app/app/app/`, không phải package bên ngoài.

---

## 1. Tech Stack

| Tầng | Công nghệ | Lưu ý quan trọng |
| :--- | :--- | :--- |
| **Nền tảng** | React Native 0.86 · Expo SDK 57 | TypeScript strict mode |
| **Điều hướng** | **Expo Router** (file-based, typed routes) | Cây route tại `app/app/`, vỏ ứng dụng tại `src/shell/` |
| **Styling** | **NativeWind 4** (dựa trên **Tailwind 3.4**) | Không có `@theme`, không có CSS variables hiện đại |
| **Biến thể component** | `tailwind-variants` (`tv()`) | Bắt buộc truyền `{ twMergeConfig }` |
| **Dữ liệu server** | TanStack React Query 5 · Axios (`@/core/api`) | Cache, query hooks, mutation |
| **State client** | Zustand 5 | State cục bộ |
| **Form & Schema** | React Hook Form + Zod **v4** | Zod v4 (khác backend là v3) |
| **Icon** | SVG xuất từ Figma (`@/shared/ui/icon`) | `<Icon name="..." />` |
| **Test** | Jest (`jest-expo`) + RNTL | `@testing-library/react-native` |

---

## 2. ⛔ BẢY ĐIỀU KHÔNG ĐƯỢC LÀM (CRITICAL)

1. **KHÔNG TẠO `src/app/`**:
   Expo Router ưu tiên tìm kiếm `src/app/` trước `app/` ở gốc. Nếu tạo `src/app/`, toàn bộ cây route tại `app/(app)/` sẽ bị Metro bỏ qua, build vẫn xanh nhưng ứng dụng hiện màn hình trắng trơn. Vỏ ứng dụng bắt buộc nằm tại **`src/shell/`**.
2. **KHÔNG sửa file `*.generated.*`**:
   Mọi file có đuôi `.generated.` đều được sinh tự động. Muốn sửa token màu, font hay layout, phải sửa JSON nguồn trong `src/styles/` rồi chạy `npm run generate:styles`. Sửa icon thì sửa file `.svg` trong `assets/icons/` rồi chạy `npm run generate:icons`.
3. **KHÔNG viết màu hoặc cỡ chữ thô**:
   Tuyệt đối cấm `bg-white`, `text-[#fff]`, `text-[17px]`, `style={{ color: '#fff' }}`. Mọi style phải dùng semantic token để hỗ trợ đổi theme sáng/tối.
4. **KHÔNG đọc biến môi trường động**:
   `process.env[key]` luôn trả về `undefined` vì Metro compiler thay thế chuỗi tĩnh lúc build. Luôn viết đủ tên biến: `process.env.EXPO_PUBLIC_*`. Thêm biến mới phải khai báo trong `RAW` (`env.config.ts`) và `types/env.d.ts`.
5. **KHÔNG để refresh token ra ngoài kho khoá OS**:
   Bắt buộc dùng `expo-secure-store`, tuyệt đối không lưu token vào `AsyncStorage`.
6. **KHÔNG gộp `unavailable` với `unauthenticated` khi refresh token**:
   Mất sóng/mất mạng (`unavailable`) ≠ hết hạn phiên (`unauthenticated`). Mất kết nối không được xoá phiên đăng nhập của người dùng (`src/core/api/session.ts`).
7. **KHÔNG `expect(el).toHaveStyle(...)` trong Jest test**:
   NativeWind không biên dịch class thành inline style trong môi trường Jest, thuộc tính `style` luôn rỗng. Bắt buộc test theo hành vi người dùng (render được, bấm được, disabled chặn được, hiển thị đúng text/icon).

---

## 3. Khác biệt cốt tử với Web (Base-Projects)

| Bên Web (React DOM) | Ở Mobile App (React Native) |
| :--- | :--- |
| `src/app/` = vỏ ứng dụng | **`src/shell/`** (xem điều cấm số 1) |
| Tailwind 4, `@theme`, `oklch()` | Tailwind **3.4** — KHÔNG có các tính năng này |
| `import.meta.env.VITE_*` | `process.env.EXPO_PUBLIC_*`, viết tường minh |
| `localStorage` (đồng bộ) | `AsyncStorage` (bất đồng bộ) + `expo-secure-store` |
| Cookie HttpOnly cho refresh token | Kho khoá hệ điều hành (`expo-secure-store`) |
| `window.location.assign('/login')` | Dọn auth store, Auth Guard tự động điều hướng |
| Thẻ HTML `<div>`, `<span>`, `<p>` | `<View>`, `<Text>` — **MỌI CHỮ PHẢI NẰM TRONG `<Text>`** |
| Vitest | Jest (`jest-expo`) |

---

## 4. Quy tắc UI Component & Design System (`src/shared/ui/`)

Bộ component giao diện lấy design system **BIDV SmartBanking v2.0** làm tham chiếu chuẩn.
Đọc thêm `src/shared/ui/AGENTS.md` trước khi sửa bất kỳ component nào trong `shared/ui`.

### Nguyên tắc số 1: Số đo lấy từ Figma, Màu lấy từ Token
- Kích thước, padding, border-radius, font-size lấy từ thiết kế Figma.
- Mã màu hex trong Figma **CẤM CHÉP VÀO CODE**. Phải map sang token tương ứng (`bg-action-base`, `text-fg-1`, `border-border-brand`...).

### Tên token ≠ Tên class (Cạm bẫy NativeWind)
Tiện ích là `<thuộc tính>-<tên token>`:
- Token `bg-1` → class là **`bg-bg-1`** (viết `bg-1` là sai).
- Token `bg-nav` → class là **`bg-bg-nav`** (viết `bg-nav` sẽ bị NativeWind bỏ qua âm thầm và mất nền).
- Token `fg-1` → class là **`text-fg-1`**.
- Token `border-1` → class là **`border-border-1`**.

### Tương phản & Chữ
- **Chữ chính**: `text-fg-1`.
- **Chữ phụ**: `text-fg-2` (đạt tương phản ≥ 5:1).
- ⛔ **CẤM DÙNG** `text-fg-3`, `text-fg-4`, `text-fg-5` làm màu chữ nội dung (giờ, chú thích, mô tả, lý do, trạng thái...). Trình kiểm tra `npm run check:contrast` sẽ chặn đứng vì các token này có tương phản dưới 4.5:1 (chỉ dành riêng cho placeholder).
- **Chữ trên nút/nền hành động**: Luôn dùng token `*-fg` tương ứng (`action-base` đi với `text-action-fg`, `action-accent` đi với `text-action-accent-fg`). Ở dark mode, nền nút chuyển sang màu SÁNG và chữ là màu TỐI, viết cứng `text-white` sẽ làm chữ biến mất hoàn toàn.

### Biến thể Component (`tv()`)
Luôn dùng `tailwind-variants` kèm cấu hình merge bắt buộc:
```typescript
import { tv } from 'tailwind-variants';
import { twMergeConfig } from '@/shared/utils/style/cn';

export const buttonStyles = tv(
  {
    slots: {
      root: 'flex-row items-center justify-center',
      label: 'text-label-lg',
    },
    variants: {
      variant: {
        primary: { root: 'bg-action-base', label: 'text-action-fg' },
        outline: { root: 'border-hairline border-border-brand', label: 'text-fg-brand' },
      },
      size: {
        md: { root: 'h-control-md rounded-2xs px-md' },
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
  { twMergeConfig } // ⛔ BẮT BUỘC để tránh xung đột class
);
```

### React Native KHÔNG CÓ `:hover`
- Thiết bị di động không có chuột, bỏ hoàn toàn trạng thái hover.
- Trạng thái bấm (press) dùng `<Pressable>` với render prop ở children:
```tsx
<Pressable
  accessibilityRole="button"
  accessibilityState={{ disabled }}
  className={styles.pressable()}
  disabled={disabled}
  onPress={onPress}
>
  {({ pressed }) => <View className={styles.root({ pressed })}>{children}</View>}
</Pressable>
```
⛔ `className` trong NativeWind **KHÔNG NHẬN HÀM**. Viết `className={({ pressed }) => ...}` sẽ bị TypeScript báo lỗi.

### `Animated.View` và `className` KHÔNG ĐI CHUNG
NativeWind gộp class và style thành một object mang khoá `viewDescriptors`. Reanimated phát hiện khoá này sẽ vứt sạch style từ class.
- **Quy tắc**: Thẻ mang `useAnimatedStyle` thì **KHÔNG ĐƯỢC mang `className`**. Hãy lồng một `<View className="...">` bên trong hoặc bên ngoài để định hình layout tĩnh.

### Kích thước & Hình học
- **Bo góc**: `rounded-lg` ở đây đã được override thành **32dp** (không phải 8dp như Tailwind gốc). Muốn 8dp phải dùng **`rounded-2xs`**.
- **Chiều cao control**: `h-control-xs` (32), `h-control-sm` (40), `h-control-md` (48), `h-control-lg` (56). `min-h-control-*` KHÔNG tồn tại trong Tailwind 3.4.
- **Vùng chạm tối thiểu**: Luôn ≥ 44dp. Nếu control nhỏ hơn phải dùng `hitSlop`.
- **Accessibility**: Luôn có `accessibilityRole`, nhãn `accessibilityLabel`, và phản ánh đúng `accessibilityState`.

### Icon
- Chỉ dùng icon BIDV xuất từ Figma qua `<Icon name="..." />` (`@/shared/ui/icon`).
- `@expo/vector-icons` đã bị gỡ hoàn toàn khỏi dự án.

---

## 5. Phân hệ và Điều hướng (Module Registry & Tabs)

- Thanh tab dưới = **Tối đa 4 phân hệ chính (`BAR_MODULE_LIMIT = 4`) + Nút Trang chủ ở giữa**.
- Nguồn duy nhất cho thanh tab và danh sách chọn phân hệ là `src/shell/navigation/module-registry.ts` (`MODULE_REGISTRY`):
  - `placement`: `'bar'` (tối đa 4 tab) hoặc `'menu'` (phân hệ phụ trong sheet).
  - `name`: **PHẢI TRÙNG ĐÚNG** tên file/thư mục route trong `app/(app)/`. Sai một ký tự thì Expo Router không khớp route, bấm vào tab không có tác dụng.
- **Phân hệ nhiều màn hình**: Bắt buộc phải có file `_layout.tsx` riêng trong thư mục con đó (ví dụ `app/(app)/me/_layout.tsx` chứa `<Stack screenOptions={STACK_SCREEN_OPTIONS} />`, hằng số ở `@/shell/navigation/stack-screen-options` = ẩn header + trượt ngang; đừng chép lại `{ headerShown: false }` trần). Nếu thiếu, Expo Router sẽ hoist các màn hình con thành các tab ngang hàng.
- **Trang chủ**: Nằm tại `app/(app)/index.tsx`, khai báo ở `HOME_MODULE`, không nằm trong `MODULE_REGISTRY`.
- **Socket & Capabilities**:
  - Socket singleton tại `src/core/socket/`, vòng đời do `AppProviders` điều khiển.
  - Capabilities service tại `src/core/capabilities/`, hook tại `src/shell/capabilities/`.

---

## 6. Lệnh kiểm tra bắt buộc trước khi hoàn tất

Chạy trong thư mục `app/`:
```bash
npm run check
```
Chuỗi kiểm tra gồm:
1. `typecheck`: Kiểm tra TypeScript strict — sinh bảng route vào `.typecheck/` (`scripts/typed-routes.mjs`) rồi `tsc -p tsconfig.typecheck.json --noEmit`.
2. `lint`: ESLint bắt các lỗi cú pháp và quy chuẩn.
3. `check:imports`: Kiểm tra cấu trúc import hợp lệ.
4. `check:classes`: **CỰC KỲ QUAN TRỌNG** — Đây là công cụ duy nhất bắt được các class Tailwind chết (`text-body`, `rounded-2xl`...) mà NativeWind bỏ qua trong im lặng.
5. `check:contrast`: Đo độ tương phản màu chữ/nền theo WCAG AA.
6. `check:touch-targets`: Đảm bảo vùng chạm ≥ 44dp.
7. `check:file-size`: Kiểm tra giới hạn kích thước file.
8. `test`: Chạy test Jest.

Tất cả các bước phải pass 100% trước khi kết thúc tác vụ.
