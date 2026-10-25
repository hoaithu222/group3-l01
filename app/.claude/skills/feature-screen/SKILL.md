---
name: feature-screen
description: Thêm hoặc sửa MÀN HÌNH / FEATURE / ROUTE trong base React Native này. Dùng khi người dùng nói "thêm màn hình…", "thêm tab…", "làm chức năng…", "thêm trang…", khi cần đăng ký phân hệ mới vào thanh tab, khi đụng tới hàng rào đăng nhập (guard), deep link hay PATHS. Chứa thứ tự bước bắt buộc và ba cái bẫy khiến route "có mà bấm không vào được".
---

# Thêm một màn hình / feature

Đọc `base-rules` trước. File này chỉ nói phần điều hướng và cấu trúc feature.
Tài liệu nền: `docs/rules/navigation.md` · `docs/rules/feature-structure.md`.

## Bố cục một màn hình — luôn là khung này

```tsx
import { Screen } from '@/shared/ui/screen';
import { AppBar } from '@/shared/ui/navigation';

export function ReportScreen() {
  return (
    <Screen header={<AppBar title="Báo cáo" onBack={router.back} />}>
      {/* nội dung, xếp theo mức ưu tiên TỪ TRÊN XUỐNG */}
    </Screen>
  );
}
```

- `Screen` lo: nền + dải gradient đầu màn + vùng an toàn + vùng cuộn + lề 16.
- Màn CÓ Ô NHẬP thì thêm `keyboardAware` — thiếu nó thì bàn phím che chính ô
  đang gõ, và người dùng kết luận là `Input` hỏng.
- ⛔ Có `gradient` (mặc định BẬT) thì `AppBar` để mặc định, **đừng** truyền
  `opaque`: hai mảng màu chồng nhau, mép nối hiện thành một đường ngang không có
  trong bản vẽ.
- Thanh hành động dính đáy: `footer={<BottomActionBar>…</BottomActionBar>}`.
- ⛔ Đừng quay lại `<ScrollView>` + `<View>` trần. Mỗi màn tự dựng khung là mỗi
  màn lệch một kiểu — và không màn nào có vùng an toàn đúng.

## Thứ tự bước — một màn hình có tab

1. **Feature**: `src/features/<ten>/screens/<Ten>Screen.tsx`
   (cấu trúc đầy đủ xem `docs/rules/feature-structure.md`).
2. **Route mỏng**: `app/(app)/<ten>.tsx` — chỉ `import` + `return`.
3. **Đăng ký phân hệ**: thêm một mục vào `MODULE_REGISTRY`
   (`src/shell/navigation/module-registry.ts`). Mặc định `placement: 'menu'` (vào danh sách chọn phân hệ);
   `'bar'` chỉ cho 4 phân hệ chính trên thanh tab (`BAR_MODULE_LIMIT`, D-29).
4. **`PATHS`**: thêm dòng vào `src/shell/config/constants.ts`.
5. `npm run check`.

### ⛔ Ba cái bẫy ở bước 3–4

- **`name` phải trùng ĐÚNG tên file route** (không đuôi). Sai một ký tự thì
  Expo Router không tìm thấy màn hình cho khai báo đó: tab hiện ra nhưng bấm vào
  không có gì, và **không có lỗi nào báo**.
- **`icon` lấy từ bộ icon của repo**, không phải Ionicons. Tra tên thật bằng
  `ls assets/icons/system` — ⛔ đừng đoán theo thói quen phương Tây
  (`close` → `cancel`, `eye` → `view`, `chevron-down` → `arrow-down-small`).
  Gõ sai là `tsc` đỏ, nên đừng ngại; nhưng đoán tên "gần đúng" mà tồn tại thì
  ra icon khác hẳn.
- **Khai `PATHS.X` mà quên tạo file route** = bấm vào rơi vào màn 404.
  `tests/project-structure.test.ts` đối chiếu hai danh sách và sẽ đỏ — đó là
  test cố ý, ⛔ đừng sửa test cho qua.

### Phân hệ cần quyền

```ts
{ id: 'report', name: 'reports', placement: 'menu', href: '/reports', title: 'Báo cáo',
  description: 'Số liệu theo tháng', icon: 'chart-1', permission: { resource: 'report', action: 'view' } }
```

Lọc quyền chỉ được làm ở MỘT chỗ: `useAccessibleModules()`. Mọi nơi hiển thị
danh sách phân hệ (thanh tab, menu, ô tìm nhanh) đều gọi hook đó.

⚠️ Đây là lọc để HIỂN THỊ, không phải hàng rào bảo mật — người dùng vẫn gõ được
đường dẫn. Hàng rào thật nằm ở backend.

## Màn hình KHÔNG có tab

- Vẫn nằm trong `app/(app)/` nhưng đăng ký với `placement: 'menu'` (không có tab; hiện trong danh sách
  chọn phân hệ, vào được bằng đường dẫn / deep link), **hoặc**
- Đặt ở một nhóm route riêng ngoài `(app)` khi nó không thuộc phần đã đăng nhập
  — mẫu có sẵn: `app/invite/`, `app/m/`, `app/c/` (link ngắn ngoài `(app)`).

## Guard đăng nhập

Hàng rào là `<Redirect>` đặt trong `_layout.tsx` của NHÓM, không phải trong từng
màn hình. ⛔ Đừng gọi `router.replace` trong `useEffect` của màn hình: nó chạy
SAU lần vẽ đầu, nên màn hình được bảo vệ chớp lên một nhịp trước khi bị đẩy đi.

Sau đăng nhập / đăng xuất dùng `replace`, ⛔ không dùng `push` — `push` giữ màn
đăng nhập trong ngăn xếp và nút Back của Android quay ngược về đó.

## Xong việc

```bash
npm run check
```

Và tự trả lời ba câu: tab có hiện đúng không · bấm vào có mở đúng màn không ·
tắt `EXPO_PUBLIC_AUTH_ENABLED` rồi bật lại thì guard còn đúng không.
