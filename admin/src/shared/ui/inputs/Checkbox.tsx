import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { twMergeFontExtend } from '@/shared/utils/style/cn';

/**
 * Checkbox — `<input type="checkbox">` NATIVE, style hoàn toàn bằng CSS.
 *
 * Size mapping:
 *   - `sm` → 14×14 box
 *   - `md` → 16×16 box (default, cân xứng text 14px)
 *   - `lg` → 20×20 box
 *
 * Figma states (node 264:8777 — rev.2):
 *   - type="Default" + states="Default"   → unchecked, border neutral-5
 *   - type="Default" + states="Disable"   → unchecked, border neutral-8 (dim, KHÔNG opacity)
 *   - type="Active"  + states="Default"   → fill primary-6, check neutral-0
 *   - type="Active"  + states="Disable"   → fill primary-6, opacity-50
 *
 * ── Vì sao fill là `primary-6` chứ không phải `secondary-3` (cyan) ───────────
 * Trước đây mỗi control tick/bật một họ màu khác: checkbox fill cyan
 * (`secondary-3`) nhưng ring focus lại xanh lá (`primary-5`), radio nền cyan +
 * chấm xanh lá, toggle `green-6` + ring `green-5`. Một form trộn cả ba đọc
 * thành ba hệ thống rời rạc. Nay TẤT CẢ dùng chung accent brand: nền
 * `primary-6` + dấu `neutral-0` (giống hệt Button primary), ring focus
 * `primary-5/40`. Chọn `primary-6` (#219947) chứ không `primary-5` (#33B351)
 * vì `primary-5` chỉ đạt 2.7:1 với nền trắng — dưới ngưỡng 3:1 cho non-text —
 * còn `primary-6` đạt 3.7:1 ở light và 4.6:1 ở dark.
 *
 * ── Vì sao native thay vì Radix ──────────────────────────────────────────────
 * Bản trước dựng trên `@radix-ui/react-checkbox`. Radix chỉ render `<button
 * role="checkbox">` không style, nên nó KHÔNG phải nguyên nhân mờ/vỡ (thủ phạm
 * là SVG icon đã bỏ). Nhưng native vẫn hơn ở: bớt 1 dependency, tự submit theo
 * form (`name`/`value`), và bấm vào nhãn tự toggle theo chuẩn HTML.
 *
 * API giữ NGUYÊN (`checked` · `onCheckedChange` · `'indeterminate'`) → không
 * call-site nào phải sửa.
 *
 * ── Tick vẽ bằng `::before` + clip-path ──────────────────────────────────────
 * `appearance-none` biến checkbox thành element thường ⇒ render được
 * pseudo-element. Dùng `grid` + `place-content-center` (KHÔNG phải flex) vì đây
 * là cách canh giữa pseudo-element ổn định nhất trên input.
 *
 * Hình dạng (hệ toạ độ chưa xoay của pseudo-element):
 *   - Cột dọc    x 50%→70%, y 0→100%    (nét dài của tick)
 *   - Chân ngang x 20%→50%, y 80%→100%  (nét ngắn)
 *   Xoay 45° ⇒ nét ngắn chúc xuống-trái, nét dài hất lên-phải = ✓
 *
 * Chưa tick: cùng polygon nhưng bóp về bề rộng 0 — GIỮ ĐÚNG 6 đỉnh, vì
 * `clip-path` chỉ nội suy được giữa 2 polygon cùng số đỉnh.
 * Indeterminate: polygon 6 đỉnh dạng thanh ngang + `rotate-0`.
 */
const checkbox = tv(
  {
    slots: {
      root: [
        // `appearance-none` BẮT BUỘC: vừa bỏ giao diện mặc định của OS, vừa là
        // điều kiện để trình duyệt render `::before` trên input.
        // `relative` làm containing block cho tick — xem ghi chú ở slot tick.
        'relative appearance-none m-0 shrink-0 border',
        // Nền + viền chạy CÙNG duration/easing với tick (xem slot tick) để hai
        // chuyển động khớp nhau tuyệt đối. Đổi tốc độ ⇒ sửa `duration-100` ở CẢ
        // HAI chỗ.
        'transition-[background-color,border-color] duration-100 ease-out cursor-pointer',
        // Ring bán trong suốt, KHÔNG `ring-offset`: `--tw-ring-offset-color` mặc
        // định là trắng và project không override nó ⇒ offset vẽ một vành trắng
        // 1px quanh ô ở dark theme. Bỏ offset cũng khớp với `field.theme.ts` và
        // Toggle → mọi control focus giống hệt nhau.
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-5/25',

        // ── Fill / border theo trạng thái ─────────────────────────────────────
        'border-neutral-5 bg-transparent',
        'checked:border-primary-6 checked:bg-primary-6',
        'indeterminate:border-primary-6 indeterminate:bg-primary-6',
        // Disabled + CHƯA tick → viền dịu, KHÔNG giảm opacity (Figma states="Disable").
        'disabled:cursor-not-allowed disabled:border-neutral-8',
        // Disabled + ĐÃ tick → giữ fill, giảm opacity. Đặt `disabled:checked:`
        // (specificity 0,3,0) để luôn thắng `disabled:` (0,2,0) — không phụ thuộc
        // thứ tự khai báo trong stylesheet.
        'disabled:checked:border-primary-6 disabled:checked:bg-primary-6 disabled:checked:opacity-50',
        'disabled:indeterminate:border-primary-6 disabled:indeterminate:bg-primary-6 disabled:indeterminate:opacity-50',

        // ── Tick (::before) ───────────────────────────────────────────────────
        // PHẢI `absolute`. Trước đây tick là grid item trong track cỡ `auto`:
        // `width:70%` tính theo track, track lại tính theo content của item ⇒ phụ
        // thuộc vòng tròn ⇒ trình duyệt giải về `auto` ⇒ pseudo-element rỗng nên
        // ra 0×0 (tick tàng hình). Absolute thì % tính theo padding-box của input.
        //
        // Canh giữa bằng `translate` (KHÔNG phải `transform`): Tailwind v4 sinh
        // riêng property `translate` và `rotate`, nên -50%/-50% và 45° cộng hưởng
        // chứ không đè nhau — và cả hai đều nằm trong danh sách transition.
        //
        // 70% padding-box: ở md (14px) ⇒ 9.8px, nét dày 20% ≈ 2px.
        // Đổi độ dày/kích thước tick ⇒ sửa DUY NHẤT con số này.
        'before:absolute before:left-1/2 before:top-1/2',
        'before:-translate-x-1/2 before:-translate-y-1/2',
        // Dấu tick trắng trên nền brand — cùng cặp màu với Button primary
        // (`bg-primary-6 text-neutral-0`).
        'before:block before:size-[70%] before:bg-neutral-0',
        // Cùng duration + easing với nền ở slot root, KHÔNG delay → hai chuyển
        // động bắt đầu và kết thúc cùng lúc. Tách `transition-[...]` + `duration`
        // (thay vì nhét cả chuỗi vào 1 arbitrary value) để chỉnh tốc độ chỉ phải
        // đổi một con số.
        'before:transition-[clip-path,opacity,rotate,translate] before:duration-100 before:ease-out',
        'before:rotate-45 before:opacity-0',
        'before:[clip-path:polygon(20%_100%,20%_80%,20%_80%,20%_0%,20%_0%,20%_100%)]',
        'checked:before:opacity-100',
        'checked:before:[clip-path:polygon(20%_100%,20%_80%,50%_80%,50%_0%,70%_0%,70%_100%)]',
        'indeterminate:before:rotate-0 indeterminate:before:opacity-100',
        'indeterminate:before:[clip-path:polygon(15%_58%,15%_42%,50%_42%,50%_42%,85%_42%,85%_58%)]',
        'motion-reduce:transition-none motion-reduce:before:transition-none',
      ],
      label: 'text-fg-1',
      error: 'text-error',
    },
    variants: {
      size: {
        sm: { root: 'size-3.5', label: 'text-caption-12', error: 'text-caption-10' },
        md: { root: 'size-4', label: 'text-body-14', error: 'text-caption-12' },
        lg: { root: 'size-5', label: 'text-body-16', error: 'text-caption-12' },
      },
    },
    defaultVariants: { size: 'md' },
  },
  { twMergeConfig: twMergeFontExtend },
);

export type CheckboxSize = NonNullable<VariantProps<typeof checkbox>['size']>;

export interface CheckboxProps extends Omit<
  React.ComponentPropsWithoutRef<'input'>,
  // `size` bị chiếm cho variant (native `size` là số ký tự, vô nghĩa với checkbox).
  'checked' | 'onChange' | 'type' | 'size'
> {
  /** Trạng thái. `'indeterminate'` set qua DOM property, không phải attribute. */
  checked?: boolean | 'indeterminate';
  /** Bắn khi user đổi trạng thái. Nhận `boolean` (native không tự về indeterminate). */
  onCheckedChange?: (checked: boolean) => void;
  /** Optional label rendered next to the box. */
  label?: React.ReactNode;
  /** Optional error message shown below; sets aria-invalid on the root. */
  error?: string;
  /** Box size — `sm` 14px · `md` 16px (default) · `lg` 20px. */
  size?: CheckboxSize;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      error,
      checked,
      onCheckedChange,
      className,
      id,
      size = 'md',
      /**
       * ⛔ RÚT `children` RA KHỎI `...props`. Component này render `<input>` NATIVE —
       * `<input>` là void element, có children là React ném ngay
       * *"input is a void element tag and must neither have `children`…"* và **trắng cả
       * màn** (đã gặp ở khay sửa lịch sử báo cáo, 2026-08-18).
       *
       * Nhãn của Checkbox đi qua prop `label`; ai lỡ viết `<Checkbox>Nhãn</Checkbox>`
       * thì nhận nhãn đó thay vì làm sập trang.
       */
      children,
      ...props
    },
    ref,
  ) => {
    const slots = checkbox({ size });
    const innerRef = useRef<HTMLInputElement | null>(null);

    // `indeterminate` KHÔNG có attribute HTML tương ứng — chỉ là DOM property,
    // nên bắt buộc set qua ref sau mỗi lần render.
    useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = checked === 'indeterminate';
    }, [checked]);

    const mergeRef = useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const box = (
      <input
        ref={mergeRef}
        aria-invalid={error ? true : undefined}
        // DOM chỉ nhận boolean; trạng thái indeterminate do effect ở trên phụ trách.
        checked={checked === 'indeterminate' ? false : checked}
        className={slots.root({ class: className })}
        id={id}
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        {...props}
      />
    );

    /** Viết `<Checkbox>Nhãn</Checkbox>` → dùng luôn children làm nhãn (xem ghi chú trên). */
    const labelNode = label ?? children;

    // No label/error → return raw box (caller composes layout)
    if (!labelNode && !error) return box;

    return (
      <div className="flex flex-col gap-1">
        {/* `<label>` bọc input ⇒ bấm vào chữ cũng toggle (hành vi native). */}
        <label className="inline-flex cursor-pointer select-none items-center gap-2">
          {box}
          {labelNode ? <span className={slots.label()}>{labelNode}</span> : null}
        </label>
        {error && <p className={slots.error()}>{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
