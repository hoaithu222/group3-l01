import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Progress, ProgressStep, type ProgressStepItem } from '@/shared/ui/progress';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). Màu chấm theo trạng thái (`done`/`current`/
 * `pending`/`error`) nằm trọn trong `className` nên không kiểm được ở đây —
 * nhưng chính vì thế mà nhãn trạng thái ĐỌC THÀNH LỜI mới là thứ phải kiểm:
 * người khiếm thị không thấy màu, với họ mọi bước giống hệt nhau nếu chỉ đọc
 * tiêu đề.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */

/**
 * Node của cây `toJSON()`. Khai tối thiểu để dò cấu trúc cột trái — không kiểm
 * `className`, chỉ đếm xem dưới chấm có mọc thêm đoạn kẻ nối hay không.
 */
interface JsonNode {
  children: (JsonNode | string)[] | null;
  props: Record<string, unknown>;
  type: string;
}

/**
 * Cột trái của mỗi bước (chấm + đoạn nối) là khối DUY NHẤT bị giấu khỏi trợ
 * năng, nên cờ đó cũng là cách nhận ra nó mà không phải đụng tới `className`.
 */
function collectRails(node: unknown, found: JsonNode[] = []): JsonNode[] {
  if (node == null || typeof node !== 'object') return found;

  if (Array.isArray(node)) {
    node.forEach((child) => collectRails(child, found));
    return found;
  }

  const candidate = node as JsonNode;
  if (candidate.props?.importantForAccessibility === 'no-hide-descendants') {
    found.push(candidate);
  }
  collectRails(candidate.children, found);

  return found;
}

/** Số con của cột trái: 1 = chỉ có chấm, 2 = chấm + đoạn kẻ nối xuống bước sau. */
function railChildCounts(node: unknown): number[] {
  return collectRails(node).map((rail) => rail.children?.length ?? 0);
}

const STEPS: ProgressStepItem[] = [
  { id: 'dang-ky', status: 'done', title: 'Đăng ký' },
  {
    description: 'Bộ phận tiếp nhận xử lý hồ sơ',
    id: 'tham-dinh',
    status: 'current',
    title: 'Thẩm định',
  },
  { id: 'giai-ngan', status: 'pending', title: 'Giải ngân' },
];

describe('Progress', () => {
  it('vẽ đủ tiêu đề của mọi bước', async () => {
    const screen = await render(<Progress steps={STEPS} />);

    expect(screen.getByText('Đăng ký')).toBeOnTheScreen();
    expect(screen.getByText('Thẩm định')).toBeOnTheScreen();
    expect(screen.getByText('Giải ngân')).toBeOnTheScreen();
  });

  it('danh sách rỗng vẫn dựng được, không nổ', async () => {
    const screen = await render(<Progress steps={[]} />);

    expect(screen.toJSON()).not.toBeNull();
  });

  /**
   * ⚠️ Không tra được bằng `getByRole('list')`: RNTL chỉ tìm phần tử có cờ
   * `accessible`, mà cờ đó cố ý KHÔNG đặt cho khung ngoài — đặt vào là nó nuốt
   * cả các bước con thành một mẩu duy nhất. Vai `list` vẫn phải khai để trình
   * đọc màn hình xướng "danh sách, 3 mục" trước khi đọc từng bước, nên kiểm
   * thẳng trên node gốc.
   */
  it('gắn vai `list` cho khung ngoài', async () => {
    const screen = await render(<Progress steps={STEPS} />);
    const root = screen.toJSON();

    expect(root).not.toBeNull();
    expect(Array.isArray(root) ? root[0]?.props : root?.props).toMatchObject({
      accessibilityRole: 'list',
    });
  });

  it('đánh số bước và đọc trạng thái thành lời', async () => {
    const screen = await render(<Progress steps={STEPS} />);

    expect(screen.getByLabelText('Bước 1, đã xong: Đăng ký')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Bước 2, đang xử lý: Thẩm định. Bộ phận tiếp nhận xử lý hồ sơ'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Bước 3, chưa thực hiện: Giải ngân')).toBeOnTheScreen();
  });

  /**
   * ⛔ Bước CUỐI không được vẽ đoạn nối — vẽ thừa thì dưới chấm cuối lòi ra một
   * đoạn kẻ cụt lửng, trông như dữ liệu bị cắt mất giữa chừng.
   *
   * `Progress` tự nhận ra bước cuối; test này là hàng rào cho việc đó.
   */
  it('bước CUỐI không vẽ đoạn nối, các bước trước thì có', async () => {
    const screen = await render(<Progress steps={STEPS} />);

    expect(railChildCounts(screen.toJSON())).toEqual([2, 2, 1]);
  });

  it('chỉ một bước thì không có đoạn nối nào', async () => {
    const screen = await render(<Progress steps={[{ id: 'chi-mot', title: 'Hoàn tất' }]} />);

    expect(railChildCounts(screen.toJSON())).toEqual([1]);
  });
});

describe('ProgressStep', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<ProgressStep title="Thẩm định" />);

    expect(screen.getByText('Thẩm định')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <ProgressStep
        className="mt-md"
        description="Bộ phận tiếp nhận xử lý hồ sơ"
        index={2}
        isLast
        meta="08/09/2026 10:30"
        status="current"
        title="Thẩm định"
      />,
    );

    expect(screen.getByText('Bộ phận tiếp nhận xử lý hồ sơ')).toBeOnTheScreen();
    expect(screen.getByText('08/09/2026 10:30')).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        'Bước 2, đang xử lý: Thẩm định. Bộ phận tiếp nhận xử lý hồ sơ. 08/09/2026 10:30',
      ),
    ).toBeOnTheScreen();
  });

  /** Không truyền `index` (dựng tay, ngoài `Progress`) thì câu đọc bỏ phần "Bước n". */
  it('không có số thứ tự thì câu đọc bắt đầu bằng trạng thái', async () => {
    const screen = await render(<ProgressStep status="error" title="Giải ngân" />);

    expect(screen.getByLabelText('không thành công: Giải ngân')).toBeOnTheScreen();
  });

  it('trạng thái mặc định là "chưa thực hiện"', async () => {
    const screen = await render(<ProgressStep title="Giải ngân" />);

    expect(screen.getByLabelText('chưa thực hiện: Giải ngân')).toBeOnTheScreen();
  });

  /**
   * ⚠️ `description`/`meta` nhận `ReactNode` để nhấn mạnh giữa câu, nhưng nhãn
   * trợ năng phải là chuỗi PHẲNG — nên phần tử React cố ý bị bỏ khỏi nhãn. Nơi
   * gọi cần nó đọc lên thì phải truyền chuỗi.
   */
  it('mô tả dạng phần tử vẫn hiện nhưng KHÔNG vào câu đọc', async () => {
    const screen = await render(
      <ProgressStep description={<Text>Còn 2 ngày</Text>} index={1} title="Thẩm định" />,
    );

    expect(screen.getByText('Còn 2 ngày')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bước 1, chưa thực hiện: Thẩm định')).toBeOnTheScreen();
  });

  /**
   * ⛔ Dựng `ProgressStep` rời thì mặc định VẪN vẽ đoạn nối — phải tự bật
   * `isLast` cho bước cuối. Test này khoá đúng cái mặc định đó lại, vì đổi nó
   * là mọi chỗ đang dùng `ProgressStep` rời sẽ mất đoạn nối mà không ai báo.
   */
  it('mặc định VẪN vẽ đoạn nối; bật isLast thì không', async () => {
    const middle = await render(<ProgressStep title="Thẩm định" />);
    expect(railChildCounts(middle.toJSON())).toEqual([2]);

    const last = await render(<ProgressStep isLast title="Giải ngân" />);
    expect(railChildCounts(last.toJSON())).toEqual([1]);
  });

  /**
   * Chấm và đoạn kẻ là trang trí thuần — trạng thái đã nằm trong nhãn của cả
   * hàng. ⚠️ Phải khai CẢ HAI prop: `accessibilityElementsHidden` chỉ iOS nghe,
   * `importantForAccessibility` chỉ Android nghe.
   */
  it('giấu cột chấm khỏi trình đọc màn hình trên cả hai nền tảng', async () => {
    const screen = await render(<ProgressStep title="Thẩm định" />);
    const [rail] = collectRails(screen.toJSON());

    expect(rail?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});
