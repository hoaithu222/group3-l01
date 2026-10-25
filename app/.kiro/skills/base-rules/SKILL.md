---
name: base-rules
description: LUẬT MẶC ĐỊNH của base React Native này — đọc TRƯỚC mọi việc động vào mã nguồn, kể cả việc trông như một dòng. Dùng khi người dùng nhờ sửa/thêm bất cứ thứ gì trong repo (màn hình, component, API, form, route, token, test, cấu hình), khi bắt đầu một phiên làm việc mới, hoặc khi phân vân "chỗ này đặt file ở đâu / có được làm thế không". Chứa bảy điều cấm, quy trình bắt buộc, cổng kiểm `npm run check`, và bảng chỉ đường sang các skill chuyên sâu.
---

# Luật mặc định — base Android (React Native)

Expo SDK 57 · React Native 0.86 · Expo Router · NativeWind 4 (Tailwind **3.4**) ·
TypeScript strict · React Query 5 · Zustand 5 · Jest.

## 0. Đây là BASE, không phải app của một ngân hàng

Bộ token, bộ component và bộ quy tắc bố cục hiện tại dựng theo **tham chiếu**
design system BIDV SmartBanking. Đó là **dữ liệu** lấp vào khung, không phải bản
thân cái khung.

| Loại                              | Ví dụ                                                                                              | Sang dự án khác                |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Cơ chế** — giữ nguyên           | quy trình dưới đây · `tv()` + `twMergeConfig` · `npm run check` · cấu trúc feature · luật trợ năng | Dùng lại                       |
| **Dữ liệu tham chiếu** — thay hết | tên/giá trị token, số đo Figma, `docs/rules/webview.md`, bộ icon                                   | Thay bằng bản vẽ của dự án mới |

⛔ Vì vậy đừng chép con số trong tài liệu vào code như thể nó là hằng số của
base. Đọc lại từ `src/styles/*.json` và từ bản vẽ của chính dự án.

---

## 1. Trước khi sửa — đọc đúng ba thứ

1. `README.md` (một lần cho mỗi phiên) và `AGENTS.md`.
2. Quy tắc tương ứng trong `docs/rules/`:

   | Sắp sửa gì                 | Đọc                                                                            |
   | -------------------------- | ------------------------------------------------------------------------------ |
   | Bất kỳ JSX nào             | `ui-components.md` (DÙNG component) · `styling-nativewind.md` · `mobile-ux.md` |
   | **Dùng** component có sẵn  | `ui-components.md`                                                             |
   | Lưới màn, định dạng tiền/ngày | `screen-layout.md`                       |
   | Bố cục, tablet, xoay ngang | `responsive.md`                                                                |
   | Cấu trúc thư mục, đặt tên  | `feature-structure.md` · `code-style.md`                                       |
   | Gọi API                    | `api-patterns.md`                                                              |
   | Route, guard, thanh tab    | `navigation.md`                                                                |
   | Form                       | `form-validation.md`                                                           |
   | Test                       | `testing.md`                                                                   |
   | Màn webview                | `webview.md`                                                                   |

3. Skill chuyên sâu cho loại việc đang làm — bảng ở mục 6.

**Ưu tiên SỬA file có sẵn.** Tạo file mới chỉ khi thật sự cần một đơn vị mới, và
phải đặt đúng chỗ theo `feature-structure.md`.

---

## 2. ⛔ Bảy điều KHÔNG được làm

1. **KHÔNG tạo `src/app/`.** Expo Router ưu tiên nó hơn `app/` ở gốc ⇒ toàn bộ
   cây route bị bỏ qua, build vẫn xanh, app hiện màn trống. Vỏ ứng dụng ở
   `src/shell/`. Có test chặn (`tests/project-structure.test.ts`).

2. **KHÔNG sửa file `*.generated.*`.** Sửa JSON nguồn trong `src/styles/` rồi
   `npm run generate:styles`; icon thì sửa `.svg` trong `assets/icons/` rồi
   `npm run generate:icons`.

3. **KHÔNG viết màu/cỡ chữ thô.** `bg-white`, `text-[17px]`,
   `style={{ color: '#fff' }}` đều sai. Dùng token.

4. **KHÔNG đọc biến môi trường động.** `process.env[key]` luôn `undefined` —
   Metro thay chuỗi lúc build. Viết đủ tên tại chỗ đọc; thêm biến mới thì thêm
   một dòng vào `RAW` (`env.config.ts`) và một dòng vào `types/env.d.ts`.

5. **KHÔNG để refresh token ra ngoài kho khoá.** `expo-secure-store`, không phải
   `AsyncStorage`.

6. **KHÔNG gộp `unavailable` với `unauthenticated`** khi làm mới token. Mất sóng
   ≠ phiên chết. Xem `src/core/api/session.ts`.

7. **KHÔNG `expect(el).toHaveStyle(...)`** trong test — NativeWind không biên
   dịch trong Jest, `style` luôn rỗng. Test hành vi.

### Bốn điều cấm bổ sung, cùng hạng

8. **KHÔNG dùng `@expo/vector-icons`.** Gói đã bị gỡ khỏi `package.json`. Cả app
   dùng MỘT bộ icon: `<Icon name="…" />` từ `@/shared/ui/icon`.

9. **KHÔNG tự viết control mới khi `src/shared/ui/` đã có.** Tra barrel
   `src/shared/ui/index.ts` trước (và `tests/ui/`). Viết cục bộ trong
   feature chỉ khi bộ chung thật sự không có, và phải ghi rõ vì sao.

10. **KHÔNG nhập từ `@/shared/ui` bên trong `src/shared/ui/`.** Nhập chéo qua
    barrel tạo import vòng; trên RN vòng hiện ra LÚC CHẠY dưới dạng
    `undefined is not a function` ở một file không liên quan. Nhập thẳng
    (`'../button/Button'`). ESLint chặn (`import/no-cycle`).

11. **KHÔNG tự đo màn hình bằng `Dimensions.get()` và KHÔNG dùng `sm:`/`md:`.**
    `Dimensions.get()` đọc một lần rồi thôi ⇒ xoay máy hay chia đôi màn hình là
    bố cục **kẹt ở kích thước lúc mở màn**; còn thang `sm/md/lg` của Tailwind đã
    bị GHI ĐÈ nên không sinh CSS ⇒ im lặng vô tác dụng. Dùng
    `useBreakpoint()`/`useResponsiveValue()` (`@/shared/theme`) và ba bậc
    `phone:` 390 · `tablet:` 600 · `tablet-lg:` 840. Luật đầy đủ:
    `docs/rules/responsive.md`.

---

## 3. Quy trình sửa

1. **Tra trước khi viết.** Component đã có chưa (`src/shared/ui/index.ts`)?
   Token tên là gì (`src/styles/colors/colors.json`)? Icon có tên đó không
   (`ls assets/icons/system`)? ⛔ Đừng đoán tên rồi để NativeWind nuốt im lặng.
2. **Viết**, bám khuôn của file xung quanh: mật độ chú thích, cách đặt tên, thứ
   tự import.
3. **Chú thích VÌ SAO**, tiếng Việt, dùng dấu hiệu `⛔` `⚠️` `✅` `❌`. Mỗi prop
   "quên là hỏng thật trên máy" phải nói rõ hỏng RA SAO.
4. **Chạy cổng kiểm** (mục 4). Đỏ thì sửa, ⛔ đừng nới ngưỡng và đừng tắt luật.
5. **Báo cáo trung thực**: cái gì đã làm, cái gì bỏ dở, cái gì chưa chắc.

---

## 4. Cổng kiểm — `npm run check`

```bash
npm run check      # typecheck → lint → check:imports → check:classes → test
```

Năm bước, và bước thứ tư là bước không thể bỏ:

| Bước                | Bắt được gì                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `typecheck`         | sai kiểu, sai tên icon (`IconName` là union thật)                 |
| `lint`              | thứ tự import, prop sắp xếp, `import/no-cycle`, màu thô           |
| `check:imports`     | nhập sai tầng, nhập chéo feature                                  |
| **`check:classes`** | **class Tailwind KHÔNG sinh CSS — thứ DUY NHẤT bắt được lỗi này** |
| `test`              | hành vi                                                           |

⚠️ NativeWind bỏ qua class không tồn tại **hoàn toàn im lặng**: không cảnh báo,
không lỗi, giao diện chỉ đơn giản là sai. `tsc` và `eslint` đều mù với chuỗi
trong `className`.

⚠️ `check:classes` báo nhầm khi mã nguồn có chuỗi TRÔNG như class (tiền tố tên
token `'bg-'`, tên biến thể, khoá object). Cách xử đúng: **sửa phía code** cho
chuỗi đó không còn giống class (ví dụ tách bằng `split('-')[0]` thay vì viết
hằng `'bg-'`). Chỉ sửa bộ lọc trong `scripts/check-classes.mjs` khi thật sự là
lỗi của bộ lọc, ⛔ và không bao giờ bỏ qua kết quả.

---

## 5. Ranh giới thư mục

```
app/            file route — MỎNG, chỉ import + return. Tên file = đường dẫn.
src/shell/      vỏ ứng dụng: provider, store, điều hướng, phiên đăng nhập
src/core/       hạ tầng: api client, config, storage
src/shared/     dùng chung: ui/ · theme/ · utils/ · form/ · constants/
src/features/   nghiệp vụ, mỗi feature một thư mục, ⛔ KHÔNG import chéo nhau
src/styles/     JSON nguồn của token + file sinh
```

⛔ Không gọi API trong component (qua `queries/`), không để logic nghiệp vụ
trong component (qua `hooks/`).

---

## 6. Đi tiếp bằng skill nào

| Việc                                                      | Skill            |
| --------------------------------------------------------- | ---------------- |
| Dựng/sửa component, sửa `className`, implement node Figma | `ui-component`   |
| Bố cục co giãn, máy tính bảng, xoay ngang, tràn layout    | `responsive-ui`  |
| Đổi màu, thang chữ, bo góc, giãn cách, font               | `design-tokens`  |
| Thêm màn hình, feature, route, tab, guard                 | `feature-screen` |
| Gọi API, React Query, xử lý 401/refresh                   | `api-data`       |
| Form + Zod, và viết test                                  | `form-and-test`  |

---

## 7. Trạng thái hiện tại của base

- **Token**: mỗi nhóm một thư mục trong `src/styles/` — `colors/` · `typography/`
  · `layout/`. Thang chữ có **15 vai trò**, ⛔ KHÔNG còn tên cũ
  (`text-body`, `text-label`, `text-caption`, `text-title`, `text-heading`);
  chúng đã bị gộp vào thang vai trò để base chỉ còn MỘT cách viết đúng.
- **Component**: `src/shared/ui/` — đọc `src/shared/ui/AGENTS.md` TRƯỚC khi thêm
  hay sửa bất kỳ component nào ở đó.
- **Thanh tab dưới** của app dùng chính `BottomNav` của bộ chung, nối qua
  `src/shell/navigation/AppTabBar.tsx`. ⛔ Đừng quay lại thanh tab mặc định của
  React Navigation — nó không đi qua NativeWind nên phải khai lại font/màu bằng
  style nội tuyến, và đó là chỗ luôn bị quên khi đổi token.
- **Danh mục component**: `src/shared/ui/index.ts` + `tests/ui/`. Trang `/demo`
  (thư viện component chạy trong app) đã gỡ ở p0-12.
