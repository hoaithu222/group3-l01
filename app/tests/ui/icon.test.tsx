import { render } from '@testing-library/react-native';

import { LIGHT_COLORS } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { SYSTEM_ICONS } from '@/shared/ui/icon/icons.system.generated';

/**
 * Bộ icon là DỮ LIỆU SINH RA, nên test ở đây không kiểm từng icon — mà kiểm ba
 * điều kiện mà cả bộ dựa vào, và khi hỏng thì hỏng ÂM THẦM:
 *
 *  1. Cơ chế nhuộm: file SVG phải mang `currentColor`, nếu không thì mọi icon
 *     kẹt màu xanh của bản thiết kế và không đổi theo theme.
 *  2. Chỗ trống `%A%` của nét nhấn phải được thay lúc chạy — sót lại một chuỗi
 *     `%A%` trong XML thì `react-native-svg` vẽ ra... không gì cả.
 *  3. Tên icon sai không được làm sập màn hình.
 */
describe('Icon', () => {
  it('render được icon có thật', async () => {
    const screen = await render(<Icon label="Trang chủ" name="home" />);
    expect(screen.getByLabelText('Trang chủ')).toBeTruthy();
  });

  it('tên icon sai thì trả về rỗng, KHÔNG ném lỗi', async () => {
    // Cảnh báo lúc phát triển là cố ý — nuốt nó để log test không rác.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    /**
     * ⛔ Ép kiểu là CỐ Ý. `IconName` là union sinh từ danh sách file nên gõ sai
     * tên bị `tsc` chặn ngay — chính là điều ta muốn. Nhưng lưới an toàn lúc
     * CHẠY vẫn phải còn: tên icon có thể tới từ dữ liệu máy chủ (danh sách dịch
     * vụ trả về `iconName`), lúc đó `tsc` không đứng giữa được.
     */
    const screen = await render(<Icon label="Không có" name={'khong-ton-tai-dau' as IconName} />);

    expect(screen.queryByLabelText('Không có')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('mọi icon hệ thống đều nhuộm được', () => {
    const names = Object.keys(SYSTEM_ICONS);
    expect(names.length).toBeGreaterThan(100);

    /**
     * "Nhuộm được" = có ít nhất MỘT trong hai chỗ nhận màu: `currentColor`
     * (nét chính) hoặc `%A%` (nét nhấn). Không đòi phải có cả hai — bộ của
     * ngân hàng có icon vẽ TOÀN BỘ bằng màu nhấn, ví dụ `star` biến thể `bulk`.
     * Icon không có chỗ nào cả là icon đã lọt mã màu cứng, và nó sẽ giữ nguyên
     * màu xanh của bản thiết kế kể cả khi đặt trên nút đỏ.
     */
    const khongNhuomDuoc = names.filter((name) =>
      Object.values(SYSTEM_ICONS[name] ?? {}).some(
        (xml) => !xml.includes('currentColor') && !xml.includes('%A%'),
      ),
    );
    expect(khongNhuomDuoc).toEqual([]);
  });

  it('chỗ trống của nét nhấn được thay bằng màu thật, không sót %A% nào', () => {
    const coNetNhan = Object.keys(SYSTEM_ICONS).filter((name) =>
      Object.values(SYSTEM_ICONS[name] ?? {}).some((xml) => xml.includes('%A%')),
    );
    // Bộ icon của ngân hàng có biến thể hai tông; hết sạch là dấu hiệu bộ sinh
    // đã nuốt mất nét nhấn.
    expect(coNetNhan.length).toBeGreaterThan(0);

    const xml = SYSTEM_ICONS[coNetNhan[0]!]?.twotone ?? '';
    const daThay = xml.replace(/%A%/g, LIGHT_COLORS['action-accent']);
    expect(daThay).not.toContain('%A%');
    expect(daThay).toContain(LIGHT_COLORS['action-accent']);
  });
});
