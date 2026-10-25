import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style và số đo của `BottomNav`.
 *
 * Tách khỏi `BottomNav.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), cùng cách chia như `chip/chip.styles.ts`.
 *
 * ── Số đo lấy từ Figma (`259:95676` = `Theme=Ma, Type=Menu`) ────────────────
 * Thanh cao **88 = 4 (đệm trên) + 50 (hàng mục) + 34 (vùng vạch gạt ngang)**.
 * Mục tab **70×44**, khe icon→nhãn **4**, khe giữa các mục **2**, đệm ngang 16,
 * nhãn 12/16. Con số 50 là chiều cao của mục GIỮA (nút "Quét QR" cao hơn 6dp);
 * ở đây chưa có mục đặc biệt đó nên hàng mục cao đúng 44.
 *
 * ⛔ Chú thích cũ ở chỗ này trích `259:97560` — SAI node: đó là `Type=1 button`,
 * tức số đo của `BottomActionBar`, không phải của thanh tab.
 */
export const bottomNav = tv(
  {
    slots: {
      /**
       * ⛔ KHÔNG có nền trắng và KHÔNG có viền trên.
       *
       * Bản vẽ cho thanh tab một dải gradient xanh đậm (`nav-from` → `nav-to`,
       * vẽ ở `BottomNavGradient`) và không có `strokes` nào. `bg-nav-to` ở đây
       * chỉ là lớp lót cùng tông nằm DƯỚI dải màu — có nó thì lúc SVG chưa kịp
       * vẽ xong thanh vẫn tối màu chứ không loé lên một mảng trong suốt.
       *
       * ⚠️ Token `bg-nav` (trắng 94%) là của component "bottom bar" — thanh tác
       * vụ nhanh Apple Pay / Trả góp (`259:95740`) — chứ không phải của thanh
       * tab này.
       */
      root: 'bg-nav-to',
      gradient: 'absolute inset-0',
      /**
       * `gap-3xs` = 2 và `pt-2xs` = 4 — đúng `gap 2` / `p4/0/0/0` của Figma.
       *
       * ── Trần bề rộng từ máy tính bảng ──────────────────────────────────────
       * ⛔ Hàng mục KHÔNG được giãn hết bề ngang máy tính bảng. `item` là
       * `flex-1`, nên trên màn 1000dp năm mục dàn ra cách nhau ~200dp: ngón cái
       * không với tới hai mục ngoài cùng khi cầm một tay, và mắt phải quét cả
       * bề ngang màn mới đọc được thanh tab. Kẹp `max-w-content` (720dp) rồi canh
       * giữa — cùng token với trần nội dung của `Screen` nên thanh tab thẳng cột
       * với nội dung phía trên.
       *
       * ⚠️ Trần đặt ở `row`, ⛔ KHÔNG ở `root`: `root` là chỗ đổ nền + dải màu
       * (`gradient` neo `absolute inset-0` vào nó). Kẹp `root` thì nền thanh tab
       * chỉ còn 720dp giữa màn và hai bên hở ra nội dung chạy phía sau.
       *
       * ⚠️ `tablet:w-full` bắt buộc đi kèm: thiếu nó thì `self-center` đổi bề
       * rộng hàng từ "kéo giãn" sang "vừa nội dung", và hàng tab co lại ôm sát
       * năm cái nhãn.
       */
      row: 'flex-row items-stretch gap-3xs px-md pt-2xs tablet:w-full tablet:max-w-content tablet:self-center',
      /**
       * `min-h-11` = 44dp: đúng chiều cao mục của Figma, và cũng đúng ngưỡng
       * vùng chạm tối thiểu.
       *
       * ⚠️ Vẫn là thang SỐ chứ không phải tên token, vì `min-h-control-*` KHÔNG
       * tồn tại: `tailwind.config.js` chỉ thêm `control-*` vào `height`. Gõ
       * `min-h-control-md` thì NativeWind bỏ qua ÂM THẦM và hàng tab mất chiều
       * cao tối thiểu, không lỗi nào báo.
       *
       * ⛔ Không bo góc, không nền cho CẢ MỤC (không pill): `State=Active` của Figma KHÔNG có pill.
       * Trạng thái đang mở phân biệt bằng nét icon + độ đậm + độ đục của chữ, và (thêm theo yêu cầu, vì chỉ ba tín hiệu
       * đó quá nhạt trên nền xanh đậm) `halo` — vòng sáng CHỈ quanh icon của mục đang mở.
       */
      item: 'min-h-11 flex-1 items-center justify-center gap-2xs',
      iconBox: 'size-xl items-center justify-center',
      /**
       * Vòng sáng phía sau icon của mục ĐANG MỞ — CHỈ mục đó hiện (mục khác dựng sẵn ở `opacity` 0 để vòng sáng diễn
       * vào/ra thay vì bật phụt, xem `BottomNavTab`). Lớp tuyệt đối nên không đổi
       * chiều cao hàng (đổi sang mục khác thì thanh không nhảy). Cỡ vòng (`inset`) nằm ở biến thể `featured` — mục thường:
       * `-inset-2xs` = icon 24 + 4×2 = vòng 32; mục nổi bật: `inset-0` (hộp đã là 32). Màu `white-3` (trắng 30%): trắng-trên-tối,
       * đúng ở cả hai chế độ.
       * ⚠️ Hai slot: `halo` chỉ định VỊ TRÍ (thẻ ngoài), `haloFill` mang nền tròn (thẻ trong) — thẻ ở GIỮA mang handle
       * `useAnimatedStyle` nên ⛔ không được mang class.
       */
      halo: 'absolute',
      haloFill: 'flex-1 rounded-full bg-white-3',
      label: 'text-label-sm',
      /**
       * ⛔ Huy hiệu KHÔNG có trong bản vẽ — là phần app tự thêm. Vì vậy nó phải
       * tự lo phần đọc được trên nền xanh đậm:
       *
       *   · `bg-action-error` (#C30000) đặt thẳng lên `nav-to` (#014A3E) chỉ đo
       *     được **1.62:1** — ô đỏ gần như tan vào thanh. Viền trắng 2dp tách nó
       *     ra khỏi nền, đúng cách iOS/Android làm huy hiệu trên thanh màu.
       *   · Chữ dùng `action-error-fg` CÙNG CẶP với nền: trắng ở chế độ sáng
       *     (6.3:1), đỏ gần đen ở chế độ tối (#1F0404, 7.02:1). ⛔ Giữ
       *     `neutral-0` trắng cứng thì ở chế độ tối là chữ trắng trên nền đỏ
       *     SÁNG #FF6B6B — 2.78:1, số biến mất.
       *
       * `min-h-lg`/`min-w-lg` = 20 chứ không phải 16: viền 2dp ăn vào trong (RN
       * dùng border-box), 16 thì chữ 12/16 không còn chỗ và bị cắt cụt.
       *
       * ⛔ `min-h-` chứ KHÔNG phải `h-lg`. Với chiều cao CỨNG 20dp, viền 2dp mỗi
       * bên chỉ chừa lại hộp nội dung **16dp** — vừa khít lineHeight 16 của
       * `text-caption-sm` ở cỡ chữ THƯỜNG và không còn một dp dự phòng. Bật
       * "Cỡ chữ: Lớn" (1.3× — đúng trần `maxFontSizeMultiplier` mà `BottomNav`
       * đặt) thì dòng chữ cao 20.8dp > 16 ⇒ con số bị cắt ngang thân, dấu tiếng
       * Việt mất trước, và KHÔNG có lỗi nào báo. ✅ `Badge` (`min-h-4`/`min-h-6`)
       * và badge của `TabItem` (`min-h-4`) đã xử đúng ca này — làm cho khớp.
       * ⚠️ Ở cỡ chữ thường `min-h-lg` vẫn cho ra ĐÚNG 20dp của bản vẽ, vì nội
       * dung thấp hơn sàn.
       */
      badge:
        'absolute -right-xs -top-2xs min-h-lg min-w-lg items-center justify-center rounded-full border-thick border-border-white bg-action-error px-2xs',
      badgeLabel: 'text-caption-sm font-semibold text-action-error-fg',
    },
    variants: {
      /**
       * Figma `State=Default` → nhãn `BODY/T12-Regular` màu trắng **80%**;
       * `State=Active` → `LABEL/T12-Semibold` màu trắng **100%**.
       * Độ đậm nằm trong biến thể chứ không ở slot gốc, vì nó ĐỔI theo trạng thái.
       *
       * ⚠️ **Nhãn KHÔNG mở cố ý lệch bản vẽ: trắng 100%, không phải 80%.**
       * `nav-from` (#358676) là TÂM dải toả tròn, tức là đúng chỗ tab GIỮA đứng.
       * Trắng 80% trên đó đo được **3.41:1** — dưới ngưỡng 4.5:1 của chữ thường,
       * và chỉ hỏng ở tab giữa, chỉ ở chế độ sáng, nên mắt thường không bắt được.
       * Trắng 100% kéo lên **4.35:1** (rìa thanh, trên `nav-to`, là 10.24:1).
       *
       * ⚠️ 4.35 vẫn thiếu 0.15 so với 4.5 — và đó là trần: không có màu chữ nào
       * sáng hơn trắng. Đóng nốt khoảng này phải làm ĐẬM `nav-from`, tức là đổi
       * dải màu nhận diện của ngân hàng — việc của ngân hàng, không phải của lập
       * trình viên (xem `src/shared/ui/AGENTS.md`, mục tương phản). Bù bằng
       * icon: mỗi nhãn luôn có icon phía trên, nên MÀU không phải dấu hiệu duy nhất.
       *
       * ⛔ Đừng "sửa lại cho đúng bản vẽ" bằng cách trả về `fg-on-nav-muted`.
       * Trạng thái vẫn phân biệt được: đậm/nhạt của FONT, không phải của màu.
       */
      selected: {
        true: { label: 'font-semibold text-fg-on-nav-accent' },
        false: { label: 'font-regular text-fg-on-nav' },
      },
      /**
       * Mục NỔI BẬT ở giữa (Trang chủ). Figma vẽ mục giữa cao hơn 6dp (50 so với 44 — nút "Quét QR"):
       * hộp icon 32dp + khe 2 + nhãn 16 = 50 đúng số đo đó, nên hàng mục không phải cao thêm.
       *
       * ⛔ Hộp icon KHÔNG có nền riêng: vòng tròn chỉ là `halo` và CHỈ hiện khi mục đang mở. Bản trước vẽ vòng
       * trắng 20% ở Trang chủ MỌI lúc (đậm hơn chút khi mở) — đứng ở tab khác vẫn thấy Trang chủ "sáng" nên người
       * dùng đọc nhầm mục đang mở. Ở mục này halo phủ đúng hộp 32 (`inset-0`) thay vì nở ra quanh icon.
       *
       * ⛔ KHÔNG nhô ra khỏi mép trên của thanh (kiểu nút tròn nổi): trên Android, phần con nằm NGOÀI
       * hộp của cha vẽ ra được nhưng KHÔNG nhận cú chạm — nút giữa sẽ nhìn thấy mà bấm không ăn.
       */
      featured: {
        true: { item: 'gap-3xs', iconBox: 'size-3xl rounded-full', halo: 'inset-0' },
        false: { halo: '-inset-2xs' },
      },
    },
    defaultVariants: { featured: false, selected: false },
  },
  { twMergeConfig },
);

/**
 * Đệm đáy tối thiểu cho máy KHÔNG có vạch gạt ngang (`insets.bottom` = 0).
 *
 * ⚠️ Bản vẽ ghi 34 — nhưng 34 chính là vùng vạch gạt ngang của iPhone, thứ
 * `insets.bottom` đã trả về lúc chạy. Ép 34 ở đây thì máy Android ba nút lĩnh
 * trọn một dải trống 34dp mà bản vẽ không hề có.
 */
export const MIN_BOTTOM_PADDING = 8;
