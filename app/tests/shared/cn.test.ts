import { cn } from '@/shared/utils/style/cn';

/**
 * Rào chặn cho `cn()` — cụ thể là phần `twMergeConfig`.
 *
 * ── Vì sao đáng có test riêng ────────────────────────────────────────────────
 * Mọi lỗi ở tầng này đều hỏng ÂM THẦM. `tailwind-merge` không ném lỗi khi gặp
 * class nó không hiểu: nó chỉ lặng lẽ coi hai class là hai nhóm khác nhau và
 * GIỮ CẢ HAI. Lúc đó thắng thua do thứ tự Tailwind sinh CSS quyết định, nên
 * triệu chứng là "prop `className` truyền từ ngoài lúc đè được lúc không" —
 * không tái hiện ổn định, và gần như không ai lần ra được nguyên nhân.
 *
 * Ba thang trong repo đều dùng TÊN chứ không dùng số (`text-body-lg`, `p-md`,
 * `rounded-sm`, `border-hairline`), mà `tailwind-merge` nhận diện giá trị bằng
 * "có phải số/độ dài không" — nên KHÔNG thang nào tự chạy đúng. Mỗi lần thêm
 * bậc token mới vào `layout.json` / `typography.json` mà quên khai vào
 * `twMergeConfig` là tái sinh đúng lỗi này.
 */

describe('cn() — thang chữ theo vai trò', () => {
  /**
   * Bẫy gốc: `tailwind-merge` mặc định đoán mọi `text-<gì đó>` lạ là MÀU chữ.
   * Không khai thì `cn('text-header-md', 'text-fg-2')` rụng mất cỡ chữ, tiêu đề tụt
   * về cỡ mặc định mà không có lỗi nào báo.
   */
  it('cỡ chữ và màu chữ KHÔNG đè nhau', () => {
    expect(cn('text-header-md', 'text-fg-2')).toBe('text-header-md text-fg-2');
    expect(cn('text-body-lg', 'text-ink-5')).toBe('text-body-lg text-ink-5');
  });

  it('hai cỡ chữ thì cái sau thắng', () => {
    expect(cn('text-body-lg', 'text-caption-lg')).toBe('text-caption-lg');
    expect(cn('text-label-md', 'text-header-sm')).toBe('text-header-sm');
  });
});

describe('cn() — thang giãn cách đặt tên', () => {
  it('cùng một mặt thì cái sau thắng', () => {
    expect(cn('p-md', 'p-xs')).toBe('p-xs');
    expect(cn('gap-xs', 'gap-md')).toBe('gap-md');
    expect(cn('px-md', 'px-2xs')).toBe('px-2xs');
    expect(cn('mt-sm', 'mt-3xl')).toBe('mt-3xl');
  });

  it('khác mặt thì giữ cả hai', () => {
    expect(cn('px-md', 'py-xs')).toBe('px-md py-xs');
  });

  /**
   * Thang tên và thang số cùng tồn tại (`spacing` được `extend`, không ghi đè).
   * `p-md` và `p-4` là CÙNG 16dp, nên chúng phải đè nhau — nếu không, một
   * component viết theo tên mà nơi gọi đè bằng số sẽ ra hai đệm chồng nhau.
   */
  it('thang tên và thang số đè được lẫn nhau', () => {
    expect(cn('p-md', 'p-4')).toBe('p-4');
    expect(cn('p-4', 'p-md')).toBe('p-md');
  });
});

describe('cn() — chiều cao control', () => {
  it('`h-control-*` đè nhau và đè cả thang giãn cách', () => {
    expect(cn('h-control-md', 'h-control-sm')).toBe('h-control-sm');
    expect(cn('h-control-md', 'h-5xl')).toBe('h-5xl');
    expect(cn('h-xl', 'h-control-lg')).toBe('h-control-lg');
  });

  /**
   * ⚠️ `min-h-control-*` KHÔNG tồn tại: `tailwind.config.js` wire
   * `height: layout.height`, còn `minHeight` thì Tailwind 3.4 lấy từ
   * `theme('spacing')` chứ không kế thừa từ `height`. Test này ghim lại sự thật
   * đó — nếu sau này ai wire thêm `minHeight` thì nó đỏ và nhắc sửa `cn.ts`.
   */
  it('`min-h-*` chỉ nhận tên giãn cách, không nhận `control-*`', () => {
    expect(cn('min-h-5xl', 'min-h-6xl')).toBe('min-h-6xl');
  });
});

describe('cn() — bo góc', () => {
  it('cái sau thắng', () => {
    expect(cn('rounded-sm', 'rounded-md')).toBe('rounded-md');
    expect(cn('rounded-2xs', 'rounded-full')).toBe('rounded-full');
  });

  it('bo góc một phía không đè bo góc toàn phần', () => {
    expect(cn('rounded-md', 'rounded-t-sm')).toBe('rounded-md rounded-t-sm');
  });
});

describe('cn() — bề dày viền vs màu viền', () => {
  /**
   * ⛔ Ca hỏng NẶNG nhất của cả file này.
   *
   * `hairline` không phải một độ dài, nên mặc định `tailwind-merge` xếp
   * `border-hairline` vào nhóm MÀU viền. Recipe `tv()` nào đặt bề dày ở slot
   * gốc và màu ở variant — tức là gần như mọi recipe có viền — sẽ bị nuốt mất
   * bề dày:
   *
   *     'border-hairline' + 'border-primary-4'  →  'border-primary-4'
   *
   * `borderWidth` về 0 ⇒ component KHÔNG còn viền nào trên máy, không lỗi nào báo.
   */
  it('bề dày và màu KHÔNG đè nhau', () => {
    expect(cn('border-hairline', 'border-primary-4')).toBe('border-hairline border-primary-4');
    expect(cn('border-thick', 'border-ink-5')).toBe('border-thick border-ink-5');
    expect(cn('border', 'border-border-1')).toBe('border border-border-1');
  });

  it('hai bề dày thì cái sau thắng', () => {
    expect(cn('border-hairline', 'border-thick')).toBe('border-thick');
    expect(cn('border-2', 'border-hairline')).toBe('border-hairline');
  });

  it('hai màu viền thì cái sau thắng', () => {
    expect(cn('border-border-1', 'border-ink-5')).toBe('border-ink-5');
  });
});

describe('cn() — trần bề rộng theo bậc màn hình', () => {
  /**
   * ⛔ Điểm mù ĐẮT nhất của `tailwind-merge` trong repo này.
   *
   * `max-w-screen-*` được tra tên bậc trong `theme.breakpoint`, mà mặc định khoá
   * đó chỉ nhận cỡ áo (`sm` `md` `lg`…) — thang đã bị GỠ khỏi repo. Không khai
   * `phone`/`tablet`/`tablet-lg` vào đó thì `screen-tablet` rơi ra ngoài mọi
   * nhóm và cả hai class cùng sống. Đo được trước khi sửa:
   *
   *     cn('tablet:max-w-screen-tablet', 'tablet:max-w-none')
   *       → 'tablet:max-w-screen-tablet tablet:max-w-none'   ❌
   *
   * Hậu quả (thời trần dùng chung còn là `max-w-screen-tablet`): trần của `Screen` ·
   * `BottomSheet` · `TooltipSheet` · `AppBar` · `BottomActionBar` KHÔNG nơi gọi nào
   * đè được, và màn cần tràn hết bề ngang (bảng biểu, lưới ảnh, bản đồ) im lặng vẫn
   * bị kẹp. Trần nay là `max-w-content` — xem nhóm test kế bên.
   */
  it('`max-w-screen-<bậc>` bị class `max-w` sau đè', () => {
    expect(cn('max-w-screen-tablet', 'max-w-none')).toBe('max-w-none');
    expect(cn('max-w-screen-tablet', 'max-w-[400px]')).toBe('max-w-[400px]');
    expect(cn('max-w-screen-tablet', 'max-w-full')).toBe('max-w-full');
  });

  it('hai bậc màn hình thì cái sau thắng', () => {
    expect(cn('max-w-screen-phone', 'max-w-screen-tablet')).toBe('max-w-screen-tablet');
    expect(cn('max-w-screen-tablet', 'max-w-screen-tablet-lg')).toBe('max-w-screen-tablet-lg');
  });

  /**
   * ⚠️ Tiền tố bậc là một MODIFIER: `tailwind-merge` chỉ gộp khi modifier trùng
   * nhau.
   */
  it('có tiền tố bậc thì vẫn đè được, và không đụng class không tiền tố', () => {
    expect(cn('tablet:max-w-screen-tablet', 'tablet:max-w-none')).toBe('tablet:max-w-none');
    expect(cn('max-w-screen-tablet', 'tablet:max-w-none')).toBe(
      'max-w-screen-tablet tablet:max-w-none',
    );
  });

  /** Trần theo bậc và trần theo TÊN GIÃN CÁCH cùng một nhóm ⇒ phải đè nhau. */
  it('bậc màn hình và tên giãn cách đè được lẫn nhau', () => {
    expect(cn('max-w-screen-tablet', 'max-w-6xl')).toBe('max-w-6xl');
    expect(cn('max-w-6xl', 'max-w-screen-tablet')).toBe('max-w-screen-tablet');
  });
});

describe('cn() — trần cột nội dung `max-w-content` (layout.json nhóm `container`)', () => {
  /**
   * ⛔ Cùng điểm mù với `max-w-screen-*`: `content` không phải tên giãn cách, không phải độ
   * dài, nên nếu `twMergeConfig` không khai thì `tailwind-merge` coi nó là class lạ và GIỮ
   * CẢ HAI. Đây là dạng viết thật trong `screen.styles.ts`, `app-bar.styles.ts`,
   * `BottomActionBar.tsx`: `contentClassName="tablet:max-w-none"` (Kanban, Mock, form họp)
   * phải đè được trần 720dp, không thì thanh đáy/tiêu đề kẹt giữa màn trong khi nội dung tràn.
   */
  it('`tablet:max-w-content` bị `tablet:max-w-none` / số đo thô truyền sau đè', () => {
    expect(cn('tablet:max-w-content', 'tablet:max-w-none')).toBe('tablet:max-w-none');
    expect(cn('tablet:max-w-content', 'tablet:max-w-[480px]')).toBe('tablet:max-w-[480px]');
    expect(cn('max-w-content', 'max-w-full')).toBe('max-w-full');
  });

  it('đè ngược lại được, và cùng nhóm với trần theo bậc màn hình', () => {
    expect(cn('tablet:max-w-[560px]', 'tablet:max-w-content')).toBe('tablet:max-w-content');
    expect(cn('max-w-screen-tablet', 'max-w-content')).toBe('max-w-content');
  });

  it('không đụng class khác tiền tố bậc', () => {
    expect(cn('tablet:max-w-content', 'max-w-none')).toBe('tablet:max-w-content max-w-none');
  });
});
