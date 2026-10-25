import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của bộ chọn ngày.
 *
 * ── Số đo lấy từ Figma "Date Picker" (section 259:97362) ─────────────────────
 * Ô ngày 40×40, bo tròn hoàn toàn · khe giữa các ô 8 · hàng KHÔNG có khe dọc ·
 * hàng bo 24 và cắt tràn (để dải chọn khoảng bo đúng ở hai mép tuần) · chữ
 * trong ô 14/20 · nhãn thứ 14/20 Medium · tiêu đề tháng 16/24 SemiBold · nút
 * mũi tên 40×40 (đệm 10 + icon 20) · khe tiêu đề ↔ lưới 4 · đệm ngang 16.
 *
 * ⚠️ Khe ngang 8dp KHÔNG viết thành `gap-xs`: dải "trong khoảng" của chế độ
 * range phải LIỀN MẠCH qua khe đó (Figma vẽ đoạn nối bằng một SVG riêng đè lên
 * khe). Ở đây mỗi cột là `flex-1` và nền dải tô kín cả cột nên dải liền mà
 * không cần hình vẽ nào; vòng tròn 40dp bên trong vẫn đúng cỡ thiết kế.
 *
 * ⛔ MÀU không chép từ Figma, và chỉ dùng token VAI TRÒ (`action-*`, `fg-*`,
 * `border-*`). Bậc thang màu (`primary-5`…) GIỐNG NHAU ở chế độ sáng và tối,
 * nên ô ngày đang chọn tô bằng thang màu sẽ gần như vô hình trên nền tối.
 *
 * ⛔ KHÔNG đặt `gap` lên `root`. Đã hỏng một lần đúng như vậy: `gap-2xs` ở gốc
 * rơi vào CẢ BẢY chỗ — giữa thanh điều khiển và hàng nhãn thứ, và giữa cả 6
 * hàng ngày — trong khi Figma (`I259:97450;4905:23812;4824:40320`, frame
 * "Month" cao **324**) chỉ có MỘT khe 4dp: `Control 40` + gap 4 + `Dates 280`,
 * còn 6 hàng ngày nằm ở y = 40/80/120/160/200/240, tức khe dọc = **0**. Khe
 * thừa đó cộng dồn thành +28dp và làm hàng nhãn thứ dính vào hàng ngày đầu
 * trong khi các hàng ngày lại rời ra — ngược đúng nhịp của bản vẽ. Khe duy nhất
 * đặt bằng `mb-2xs` của chính `control`.
 */
export const calendarStyles = tv(
  {
    slots: {
      /**
       * ⚠️ `tablet:max-w-[420px] tablet:self-center` là phần THÊM so với bản vẽ
       * (bản vẽ chỉ có khung điện thoại 375dp). Lưới là 7 cột `flex-1`, nên để
       * nó trải hết 840dp thì mỗi cột rộng 120dp trong khi vòng tròn ngày vẫn
       * 40dp — người dùng thấy 42 chấm nhỏ rải rác trên một mặt phẳng trống, và
       * ngón tay phải bò ngang cả gang tay để đi từ Thứ Hai sang Chủ nhật.
       * Chặn ở 420 giữ đúng nhịp lưới của điện thoại. `max-w` chỉ CHẶN chứ
       * không ép nên máy hẹp 320dp vẫn co lại được.
       */
      root: 'w-full bg-bg-1 tablet:max-w-[420px] tablet:self-center',
      /** `mb-2xs` = khe 4dp DUY NHẤT của lưới (Figma: Control 40 + gap 4 + Dates). */
      control: 'mb-2xs w-full flex-row items-center justify-between',
      navButton: 'h-10 w-10 items-center justify-center rounded-full',
      /**
       * Lớp TRONG của nút mũi tên — chỗ duy nhất tô được phản hồi lúc nhấn.
       *
       * `className` của NativeWind chỉ nhận CHUỖI nên `pressed` phải lấy ở
       * children của `Pressable`; mà `Pressable` đã giữ vùng chạm 40dp rồi, nên
       * lớp nền nhấn nằm ở một `<View>` phủ kín bên trong (`h-full w-full`).
       */
      navButtonInner: 'h-full w-full items-center justify-center rounded-full',
      title: 'flex-1 text-center text-label-lg font-semibold text-fg-1',
      /**
       * Cao **40dp** đúng một ô `_Calendar cell` của Figma, không phải chiều cao
       * tự nhiên 20dp của `<Text>`: hàng nhãn thứ và hàng ngày dùng chung một ô
       * lưới nên hai hàng phải cùng nhịp, nếu không "T2" nằm lệch tâm so với cột
       * số bên dưới nó.
       */
      weekRow: 'min-h-10 w-full flex-row items-center',
      weekLabel: 'flex-1 text-center text-label-md font-medium text-fg-1',
      /**
       * `overflow-hidden` + bo 24 chính là cách bản thiết kế bo hai đầu dải
       * chọn khoảng ở mép tuần: dải tô kín cả hàng rồi bị hàng cắt cong.
       */
      row: 'w-full flex-row items-center overflow-hidden rounded-md',
    },
    variants: {
      /**
       * Phản hồi khi bấm hai mũi tên đổi tháng/năm.
       *
       * Chú giải "Button" của section Figma liệt kê trạng thái **Press** (Hover
       * và Focus thì bỏ — không có con trỏ chuột trên di động). Không có nó thì
       * người dùng bấm ‹ và trong lúc lưới vẽ lại không thấy gì đổi, nên bấm
       * thêm lần nữa và nhảy hai tháng. `action-tint` là cùng lớp nền nhấn với
       * `CalendarDay`/`CalendarUnitPicker` để cả bộ lịch phản hồi giống nhau.
       */
      pressed: {
        true: { navButtonInner: 'bg-action-tint' },
      },
    },
    defaultVariants: { pressed: false },
  },
  { twMergeConfig },
);

export const calendarDayStyles = tv(
  {
    slots: {
      /**
       * Vùng chạm: cột rộng ~49dp × cao 44dp (40 của ô + 2 đệm mỗi bên) — trên
       * ngưỡng 44dp của cả Apple lẫn Google. ⛔ Đừng bỏ `py-3xs` để lấy lại
       * đúng 40dp của Figma: ô ngày nằm sát nhau theo chiều dọc nên bấm trượt
       * là chọn nhầm ngày, và người dùng chỉ phát hiện sau khi đã xác nhận.
       */
      pressable: 'flex-1 items-center justify-center py-3xs',
      /** Dải nền của chế độ range — rộng bằng cả cột nên nối liền qua khe. */
      track: 'h-10 w-full items-center justify-center',
      /**
       * ⚠️ `aspect-square w-full max-w-10`, KHÔNG phải `h-10 w-10` cứng.
       *
       * Figma chốt vòng tròn 40dp trên khung 375dp: 375 − 2×16 = 343, chia 7 cột
       * ra 49dp — vòng 40 lọt thoải mái. Nhưng lịch không phải lúc nào cũng nằm
       * trong tấm trượt: đặt vào một thẻ có đệm riêng trên máy 320dp thì lưới
       * chỉ còn ~256dp ⇒ cột 36.6dp, và vòng 40dp CỨNG tràn sang cột bên cạnh
       * rồi bị `overflow-hidden` của hàng xén mất hai ô ngoài cùng.
       *
       * Cách viết mới: vòng rộng bằng CỘT (`w-full`), chặn trần 40 (`max-w-10`)
       * để máy tính bảng không thổi nó to ra, và `aspect-square` giữ nó TRÒN —
       * cao luôn bằng rộng. ⛔ Đừng thay bằng `h-10 max-w-10 w-full`: chiều cao
       * đứng yên trong khi bề rộng co lại thì vòng tròn thành hình bầu dục.
       */
      circle: 'aspect-square w-full max-w-10 items-center justify-center rounded-full',
      label: 'text-label-md font-semibold text-fg-1',
    },
    variants: {
      state: {
        default: {},
        /**
         * Ngày của tháng trước/sau: vẫn hiện nhưng mờ và không bấm được.
         *
         * ⚠️ `fg-3` chứ không phải `fg-4`: `fg-4` đo được 1.73:1 trên nền thẻ —
         * gần như không đọc được. Con số vẫn phải ĐỌC ĐƯỢC dù mờ, vì nó cho
         * biết tuần đầu/cuối tháng bắt đầu từ đâu.
         */
        outside: { label: 'text-fg-3' },
        disabled: { label: 'text-action-disabled-fg' },
        /**
         * Hôm nay mà còn chọn được: chỉ VIỀN thương hiệu, không tô nền. Tô nền
         * thì hôm nay trông y hệt ngày đang chọn, người dùng tưởng đã chọn sẵn
         * và bấm thẳng "Áp dụng".
         */
        today: { circle: 'border border-border-brand' },
        /** Hôm nay nhưng bị khoá: viền nhạt, chữ mờ. */
        todayDisabled: { circle: 'border border-border-1', label: 'text-action-disabled-fg' },
        /**
         * Ngày đang chọn — VÀNG ĐỒNG, đúng bản vẽ.
         *
         * Đo pixel trên `259:97450` (bottom sheet chế độ khoảng, 375×742): ô
         * đang chọn `#B18535` = token `action-accent` (`Background/Secondary/
         * Default`). ⛔ Không phải `action-base` (#00453C, xanh) — đó là ĐỔI HỌ
         * MÀU chứ không phải chỉnh sắc độ, và lịch xanh cạnh một bản thiết kế
         * vàng đồng thì ai đối chiếu màn hình với Figma cũng thấy ngay.
         *
         * ⛔ Chữ là `action-accent-fg` (MỰC #1A1A1A), KHÔNG phải trắng như
         * Figma vẽ: trắng trên #B18535 chỉ đo được 3.35:1. Đây đúng luật "thiết
         * kế và tương phản đá nhau" của `src/shared/ui/AGENTS.md` — giữ nguyên
         * màu NỀN của thương hiệu, chỉ đổi phần CHỮ.
         */
        selected: { circle: 'bg-action-accent', label: 'text-action-accent-fg' },
      },
      /**
       * Vị trí trong khoảng đang chọn. Dải nền `surface-secondary` = `#F7F3EB`
       * đo được trên bản vẽ (`Background/Secondary/Light`), tức nền nhạt CÙNG
       * HỌ với ô đang chọn; hai đầu khoảng là vòng `action-accent` do biến thể
       * `selected` vẽ đè lên trên dải.
       *
       * ⚠️ Trước đây dải này dùng `action-tint`, trùng đúng màu phản hồi lúc bấm
       * ở `CalendarDay.tsx` ⇒ bấm một ô bất kỳ trông y hệt "ô này nằm trong
       * khoảng". Sau khi đổi, `action-tint` trong nhóm này chỉ còn MỘT nghĩa:
       * phản hồi lúc bấm.
       */
      rangePosition: {
        none: {},
        start: { track: 'rounded-l-full bg-surface-secondary' },
        middle: { track: 'bg-surface-secondary' },
        end: { track: 'rounded-r-full bg-surface-secondary' },
      },
    },
    defaultVariants: { rangePosition: 'none', state: 'default' },
  },
  { twMergeConfig },
);

/**
 * Lưới chọn NĂM và chọn THÁNG — 3 cột × 4 hàng = 12 ô viên thuốc.
 *
 * Figma (`259:97470`, "Date picker bottom sheet" 375×812): thanh điều khiển
 * `‹ 2020 – 2029 ›` giống hệt lưới ngày, rồi 12 ô ~88×40 bo tròn hoàn toàn; ô
 * đang chọn nền `#B18535`. Lưới tháng cùng bố cục, đầu đề là năm và nhãn ô là
 * "Tháng 1"…"Tháng 12".
 *
 * ⚠️ Ô cao 40 như bản vẽ, nhưng vùng CHẠM phải ≥ 44dp nên `cell` thêm `py-2xs`
 * (4 mỗi bên) ⇒ 48dp một hàng và 8dp khe nhìn thấy giữa hai hàng — cùng nhịp
 * với khe ngang 8dp của lưới ngày. ⛔ Đừng bỏ `py-2xs` để lấy lại đúng 40: ba
 * cột nằm sát nhau theo chiều dọc, bấm trượt là chọn nhầm năm.
 */
export const calendarUnitStyles = tv(
  {
    slots: {
      grid: 'w-full flex-row flex-wrap items-center',
      /** 3 cột ⇒ mỗi ô đúng một phần ba bề rộng LƯỚI, không phải một số dp cứng. */
      cell: 'w-1/3 items-center justify-center py-2xs',
      /**
       * ⚠️ `min-h-10` chứ KHÔNG phải `h-10`. Nhãn ở đây là CHỮ ("Tháng 12"),
       * không phải một chữ số như lưới ngày: trên máy 320dp một ô chỉ rộng
       * ~93dp, nên khi người dùng phóng cỡ chữ hệ thống thì nhãn xuống hai dòng
       * — với chiều cao cứng, dòng thứ hai bị cắt ngang thân chữ. Ở cỡ chữ
       * thường `min-h-10` cho ra ĐÚNG 40dp của bản vẽ vì nội dung thấp hơn sàn.
       *
       * ⚠️ Viên thuốc này KHÔNG phải hình tròn (khác lưới ngày), nên cho nó cao
       * lên không phá dáng nào cả.
       */
      pill: 'min-h-10 w-full items-center justify-center rounded-full py-2xs',
      label: 'text-label-md font-semibold text-fg-1',
    },
    variants: {
      state: {
        default: {},
        /** Hai ô thừa của lưới năm (2019 · 2030 khi đang xem thập kỷ 2020). */
        outside: { label: 'text-fg-3' },
        disabled: { label: 'text-action-disabled-fg' },
        /** ⛔ Chữ MỰC trên nền vàng — xem chú thích của `selected` ở lưới ngày. */
        selected: { pill: 'bg-action-accent', label: 'text-action-accent-fg' },
      },
    },
    defaultVariants: { state: 'default' },
  },
  { twMergeConfig },
);

/**
 * Ô nhập ngày (trigger). Cố ý DÙNG LẠI số đo của `Input` (ô 56 = đệm 16 + dòng
 * 24 + đệm 16, bo 24, viền 1) để hai ô đứng cạnh nhau trong một form không lệch
 * nhau pixel nào. ⛔ Không nhập `inputStyles` từ nhóm `input`: hai nhóm sẽ dính
 * vào nhau và một thay đổi bên đó lặng lẽ đổi hình ô ngày.
 */
export const datePickerStyles = tv(
  {
    slots: {
      /**
       * ⚠️ `tablet:max-w-content` (720dp) — cùng trần với `input/input.styles.ts`,
       * và phải bằng nhau: ô ngày cố ý dùng lại số đo của `Input` để hai ô đứng
       * cạnh nhau trong một form không lệch nhau pixel nào; trần bề rộng lệch
       * thì trên máy tính bảng chúng lại lệch. Nơi gọi cần ô tràn hết bề ngang
       * thì truyền `className="tablet:max-w-none"`.
       */
      root: 'w-full gap-xs tablet:max-w-content',
      label: 'text-label-lg font-semibold text-fg-1',
      /**
       * ⚠️ Giữ `border` TRẦN, đừng đổi sang `border-hairline`: `tailwind-merge`
       * xếp `border-hairline` vào nhóm MÀU viền, nên biến thể `state` bên dưới
       * đè mất bề dày — ô còn màu viền nhưng dày 0, và không có lỗi nào báo.
       */
      field:
        'min-h-14 w-full flex-row items-center gap-xs rounded-md border bg-bg-input px-md py-md',
      value: 'flex-1 text-body-lg text-fg-1',
      messageRow: 'w-full flex-row items-center gap-2xs',
      message: 'flex-1 text-caption-lg text-error',
    },
    variants: {
      state: {
        default: { field: 'border-border-1' },
        error: { field: 'border-error' },
        /** `disabled-1`/`disabled-2` đã pha sẵn alpha ⇒ ⛔ đừng thêm `/xx`. */
        /**
         * Chữ dùng `action-disabled-fg` chứ không phải `fg-5`: `fg-5` đo 1.37:1,
         * tức ngày đã chọn BIẾN MẤT khi ô bị khoá và người dùng không còn biết
         * mình đã chọn gì. WCAG miễn trừ control bị khoá, nhưng miễn trừ không
         * có nghĩa là được phép giấu thông tin.
         */
        disabled: { field: 'border-disabled-2 bg-disabled-1', value: 'text-action-disabled-fg' },
      },
      /** Chưa có giá trị ⇒ chữ là placeholder, mờ hơn màu chữ chính. */
      empty: { true: { value: 'text-fg-3' } },
    },
    defaultVariants: { empty: false, state: 'default' },
  },
  { twMergeConfig },
);

export type CalendarDayVariants = VariantProps<typeof calendarDayStyles>;

/** Trạng thái hình thức của một ô ngày — suy ra trong `Calendar`, không phải prop. */
export type CalendarDayState = NonNullable<CalendarDayVariants['state']>;
export type CalendarRangePosition = NonNullable<CalendarDayVariants['rangePosition']>;

/** Trạng thái hình thức của một ô trong lưới Năm/Tháng. */
export type CalendarUnitState = NonNullable<VariantProps<typeof calendarUnitStyles>['state']>;
