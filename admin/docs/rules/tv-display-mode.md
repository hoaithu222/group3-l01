# TV Display Mode (BẮT BUỘC)

> Chế độ hiển thị riêng cho TV 65", khoảng cách nhìn ~3m. Bật bằng `?display=tv`
> trong URL hoặc trang **Cài đặt** (`src/app/pages/SettingsPage.tsx`).
> **3 mức cỡ chữ**: 1.1 (mặc định) / 1.2 / 1.3 + thu padding ngoài (nhường diện tích).
> **KHÔNG ẩn Header/Dock, KHÔNG phóng to bố cục** — người dùng chốt 2026-08-07.

---

## 0. Nguyên tắc tối cao — 3 mức chọn được, trần 1.3

```
1. MỘT THẾ GIỚI          → Cùng 1 codebase, 3 mức TV (mặc định 1.1, max 1.3)
2. KHÔNG KỲ PHỤC          → KHÔNG ẩn chrome / cài đặt / nút bấm khi TV
3. CHỈ NHÂN CHỮ          → --ui-scale (1.1/1.2/1.3) nhân riêng token typography
4. KHUNG GIỮ NGUYÊN      → KHÔNG phóng root font-size (bố cục không giãn)
5. PADDING NHƯỢNG DỊ     → thu padding ngoài để user xem từ xa
6. DARK THEME ONLY       → TV ép dark (config)
7. TRẦN 1.3, KHÔNG VƯỢT  → Rủi ro chữ tràn khỏi nút/chip/ô bảng cố định
8. KHÔNG MIGRATION       → Design cũ (scale 1.5/1.8, overscan, ẩn chrome) đã bỏ
```

**Bài học:** Phóng root font-size = phóng tất cả (Tailwind v4 `--spacing: 0.25rem`)
→ bảng/panel tràn, vỡ bố cục ở TV. Chỉ nhân token chữ = chữ to, khung giữ → đúng.
Trần 1.3 vì khung không giãn → mỗi bậc chữ to là bậc rủi ro tràn.

---

## 1. Cấu trúc scale: store → CSS var → render

| Lớp | Nơi | Giá trị / Hành động |
|-----|-----|-------------|
| **Store** | `src/app/store/slices/display/index.ts` (`useDisplayStore`) | `mode` ('standard' \| 'tv'), `uiScale` (1 \| 1.1 \| 1.2 \| 1.3) |
| **Selector** | `.../display/selectors.ts` | `selectIsTv` · `selectEffectiveUiScale` — ⛔ luôn dùng selector, KHÔNG đọc thẳng `state.uiScale` |
| **URL param** | `src/app/router/DisplayUrlSync.tsx` — `?display=tv&scale=1.2` | tên param ở `constants.ts`: `DISPLAY_PARAM` · `SCALE_PARAM` |
| **CSS var** | `src/app/providers/DisplayProvider.tsx` ghi thẳng lên `<html>` | `--ui-scale` (1 / 1.1 / 1.2 / 1.3) · `--lh-scale` (nửa nhịp) · class `.tv` |
| **CSS var (weight)** | `:root.tv` trong `globals.css` | `--fw-regular: 500` · `--fw-medium: 600` |
| **UI** | `src/app/pages/SettingsPage.tsx` | Chọn chế độ + mức scale từ `UI_SCALE_VALUES` |
| **Render** | Typography (kit2) | Font size: `calc(var(--fs-{token}, <mặc định>) * var(--ui-scale, 1))` |
| **UI Padding** | `src/app/router/layouts/BackgroundLayout.tsx` | Padding ngoài của `<main>` — nhường diện tích khi xem từ xa |

**VỰỤ: KHÔNG hardcode scale ở component**. `--ui-scale` do `DisplayProvider` đặt
một chỗ trên `<html>`. UI chọn mức qua `UI_SCALE_VALUES = [1.1, 1.2, 1.3]`.

⚠️ `globals.css` **không** khai `--ui-scale` trong khối `.tv`; nó chỉ đặt giá trị
gốc `--ui-scale: 1` ở `:root`. Giá trị TV được `DisplayProvider` ghi bằng
`root.style.setProperty('--ui-scale', …)` — sửa nhầm chỗ sẽ không có tác dụng.

---

## 2. Cơ chế nhân chữ ×1.1/1.2/1.3 — TỪ CSS VAR, KHÔNG ROOT FONT-SIZE

Tài liệu cũ (bỏ) dùng `html { font-size: calc(16px * var(--ui-scale)); }` (scale 
1.8×) → phóng tất cả spacing/kích thước → bố cục vỡ. **Cách mới (3 mức chọn được):**

```ts
// DisplayProvider.tsx — ghi hệ số lên <html> (mức do user chọn: 1.1 / 1.2 / 1.3)
root.style.setProperty('--ui-scale', String(scale));
root.style.setProperty('--lh-scale', String(1 + (scale - 1) * 0.5)); // nửa nhịp
root.classList.toggle('tv', isTv);
```

```css
/* globals.css — chỉ NÂNG BẬC WEIGHT, không đụng --ui-scale */
:root.tv {
  --fw-regular: 500;    /* Nâng weight nửa bậc: 450→500 */
  --fw-medium: 600;     /* 500→600 */
  /* --fw-semibold, --fw-bold: giữ nguyên */
}

/* Font size — nhân riêng, KHÔNG vào root */
/* src/styles/font/generated-font.css */
@utility text-body-14 {
  font-size: calc(var(--fs-body-14, 0.875rem) * var(--ui-scale, 1));
  /* Normal: 0.875rem × 1 = 14px */
  /* TV ×1.1: 0.875rem × 1.1 = 15.4px */
  /* TV ×1.2: 0.875rem × 1.2 = 16.8px */
  /* TV ×1.3: 0.875rem × 1.3 = 18.2px */
  line-height: calc(var(--lh-body-14, 1.25rem) * var(--ui-scale, 1));
  font-weight: var(--fw-regular, 450);
}
```

**Hệ quả (kiểm trên Chrome thật):**
| | Normal | ×1.1 | ×1.2 | ×1.3 |
|---|---|---|---|---|
| `body-14` | 14px | 15.4px | 16.8px | 18.2px |
| `caption-10` | 10px | 11px | 12px | 13px |
| Giãn dòng | 20px | 22px | 24px | 26px |
| `p-4` (padding) | 16px | 16px | 16px | 16px |
| `h-11` (height) | 44px | 44px | 44px | 44px |

**Quy luật:**
- Chữ: nhân `--ui-scale` (14px → 15.4–18.2px)
- Spacing/kích thước box: **GIỮ NGUYÊN** (root KHÔNG phóng)
- Bố cục: không bị kéo giãn, user từ xa đọc được chữ to hơn
- **Trần 1.3** để chữ không tràn khỏi nút/chip/ô bảng cố định

---

## 3. Vì sao KHÔNG phóng bố cục — bài học phải giữ

Cách làm SAI đã bị loại: phóng `font-size` của `<html>`.

Tailwind v4 khai `--spacing` bằng **rem**, nên phóng gốc là phóng luôn mọi
`p-*`, `gap-*`, `h-*`, `w-*`. Ở hệ số 1.8, màn 1920px chỉ còn tương đương
1067px logic → bảng tràn, panel vỡ, hộp thoại chạy ra ngoài khung.

Vì thế cơ chế hiện tại **chỉ nhân riêng token chữ** qua `--ui-scale`, còn khung
giữ nguyên kích thước pixel.

⛔ Ba thứ KHÔNG được thêm lại (đều đã thử và đã bỏ):

| Đừng làm | Vì sao |
|---|---|
| `html { font-size: calc(16px * var(--ui-scale)) }` | Phóng cả spacing → vỡ bố cục |
| Hệ số > 1.3 | Khung không giãn, chữ to hơn nữa là tràn khỏi nút/chip/ô bảng |
| Phóng `barSize` / bán kính donut / kích thước icon theo `uiScale` | Khung cứng thì px cứng phải giữ nguyên |

## 4. ⛔ Checklist: thêm dashboard mới compatible TV

### Bắt buộc dùng `@/shared/charts`

| Nội dung | Từ | Nếu không = blocked |
|----------|-----|-------|
| Bậc mật độ (`ChartDensity`) | `@/shared/charts/constants/chart-density.constants` | Hardcode cỡ chữ → không scale |
| Helper `useChartMetrics` | `@/shared/charts/hooks/useChartMetrics` | Không đo độ cao → kẹt bậc, chữ nhỏ |
| Helper token màu (`tokenVar`, `tokenVarAlpha`, `labelInt`, `fmt3`, …) | `@/shared/charts` (barrel) | Fork tức ngay = drift khi fix bug |
| Style theo bậc (`buildChartStyles`, `chartDensityFor`) | `@/shared/charts` (barrel) | Mỗi fork đông cứng ở một cỡ chữ |

### Form input & UI

- Dùng kit2 component (không fork)
- Dùng `text-{scale}-{weight}` font token (rem tự scale qua CSS var)
- KHÔNG `px` cứng cho kích thước UI (dùng Tailwind scale → rem → auto phụ `--ui-scale`)

---

## 5. TV mode hoạt động ra sao — con đường dòng chảy

```
User bật TV mode (URL ?display=tv hoặc UserMenu)
  ↓
store.mode = 'tv' + persist
  ↓
<html> nhận class ".tv" (hoặc đọc store, ghi --ui-scale)
  ↓
CSS var --ui-scale: 1.1 + nâng font-weight (--fw-regular: 500, --fw-medium: 600)
  ↓
Typography nhân 1.1: calc(14px * 1.1 = 15.4px) ← tất cả font qua generated-font.css
  ↓
Layout padding ngoài của <main> ở BackgroundLayout (nhường diện tích)
  ↓
Kết quả: chữ to hơn 10%, padding ngoài gọn, khung KHÔNG giãn → xem TV được, không vỡ
```

---

## 6. Phạm vi TV

TV mode là **công tắc toàn app**, không phải tính năng của riêng màn nào: bật lên
là mọi trang đều nhân cỡ chữ theo `--ui-scale`. Vì thế:

- ⛔ Mọi màn hình mới **mặc định nằm trong scope TV** — không có danh sách trắng.
- Màn nào có chart → BẮT BUỘC dùng `useChartMetrics` từ `@/shared/charts` (§4),
  nếu không thì chữ trong chart kẹt cỡ desktop trong khi phần còn lại đã to lên.
- Muốn ĐƯA MỘT MÀN RA NGOÀI scope (giữ cỡ cứng vì lý do bố cục) → phải ghi lý do
  vào PR **và** thêm một dòng vào bảng dưới. Bảng trống nghĩa là không có ngoại lệ.

| Màn / module ngoài scope | Lý do | Ngày |
|--------------------------|-------|------|
| _(chưa có)_ | — | — |

---

## 7. ⛔ Anti-patterns — BLOCK MERGE

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `fontSize: 10` cứng, KHÔNG nhân `m.uiScale` | `Math.round(10 * m.uiScale)` — giữ nguyên số gốc, TV nhân thêm |
| Thay số đã tinh chỉnh tay bằng `m.axisTick` / `m.barLabel` | GIỮ số gốc (xem §Quy tắc nền — chữ đổi cỡ cả khi TẮT TV là hồi quy) |
| `scale` ngoài `UI_SCALE_VALUES` trong code | Chỉ `1.1 / 1.2 / 1.3`; mặc định `DEFAULT_TV_UI_SCALE` |
| `--ui-scale` set rải rác ở component | CHỈ `DisplayProvider` ghi lên `<html>` — một chỗ duy nhất |
| `html { font-size: calc(...) }` ở TV | KHÔNG, sẽ phóng spacing → vỡ layout |
| Phép chia `height / uiScale` ở chart | KHÔNG, bỏ từ lâu — dùng height thực |
| Phóng `barSize / donutRadius` theo `uiScale` | KHÔNG, khung không giãn, px cứng vẫn px cứng |
| Dùng fork `chart-tokens.ts` thay shared | Import từ `@/shared/charts` |
| `overscan`, `TV_MIN_FONT`, `TV_GRID_WIDTH` trong code | Bỏ hết, chỉ nhớ để không add lại |

---

## 8. Bật/tắt TV mode

### URL param (dev testing)
```
?display=tv                    // toggle TV
```

### Trang Cài đặt (production)
- `src/app/pages/SettingsPage.tsx` — chọn chế độ + mức scale
- Ghi vào `useDisplayStore` (`mode`, `uiScale`) — persist qua zustand

### Keyboard escape (backup)
```
Ctrl/Cmd + Alt + Shift + T  → TẮT TV mode
```
⚠️ Đây là **lối thoát một chiều**, KHÔNG phải toggle: `useTvEscapeHatch` chỉ gọi
`setMode('standard')` khi đang ở TV. Bật TV vẫn phải qua trang Cài đặt hoặc URL.
Hook bỏ qua phím khi con trỏ đang ở `<input>` / `<textarea>` / vùng
`contentEditable`, và so bằng `event.code === 'KeyT'` (vị trí phím vật lý) chứ
không so `event.key` — Option+T trên macOS sinh ra `†`.

---

## 9. Font weight ở TV

| Scale | Desktop | TV |
|-------|---------|-----|
| regular (no suffix) | 450 | 500 (nâng nửa bậc) |
| `-medium` | 500 | 600 (nâng nửa bậc) |
| `-semibold` | 600 | 600 (giữ) |
| `-bold` | 700 | 700 (giữ) |

Cơ chế: `.tv` class set `--fw-regular: 500`, `--fw-medium: 600` (globals.css)
→ generated-font.css dùng `font-weight: var(--fw-*, fallback)` → TV tự động đậm hơn.

---

## 10. Cross-references

- Chart bậc mật độ (compact/base/large/xlarge) → `chart-conventions.md` (§1.5)
- Font token + rem mechanics → `font-system.md` (§Đơn vị: px → rem)
- Tailwind rem + breakpoint → `tailwind-conventions.md` (§Đơn vị: rem + media query)
- Shared chart infra → `reuse-first.md` (§Chart Infrastructure)
- Store config: `src/app/store/slices/display/constants.ts` (`UI_SCALE_VALUES`, `DEFAULT_TV_UI_SCALE`)
- Layout component: `src/app/router/layouts/BackgroundLayout.tsx`
  (đã sửa: không còn nhánh `isTv ? … : …` — lề lấy từ hằng `SHELL_GUTTER_X`/
  `SHELL_GUTTER_Y`, 8px ở MỌI chế độ từ 2026-09-29 nên TV không còn bậc `tv:` riêng.)
- Font generation: `scripts/generate-font.mjs` (rem × `--ui-scale` nhân)
- CSS var: `src/styles/globals.css` (.tv class, `--ui-scale`, `--fw-*`)

---

## 11. Khi vi phạm — BLOCK MERGE

- Chart axis dùng `fontSize: 12` cứng, KHÔNG nhân `m.uiScale` → **block merge** (TV không to chữ được)
- Đổi cỡ chữ/kích thước đã có sang thang chung `m.scale.*` → **revert** (đổi cả khi TẮT TV)
- Dùng scale ngoài `UI_SCALE_VALUES` → **revert**
- Phóng root font-size cho TV (HTML { font-size: calc(...) }) → **block merge** (vỡ layout)
- Phép chia `height / uiScale` trong useChartMetrics → **revert** (bỏ cơ chế cũ)
- `overscan`, `TV_MIN_FONT`, `TV_GRID_WIDTH` constants trong code → **revert**
- Dùng fork `chart-tokens.ts` thay `@/shared/charts` → **revert**
- `p-4` / `p-6` ở page outer khi TV mode (padding quá to) → fail review
