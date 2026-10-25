import { render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import {
  Skeleton,
  SkeletonBottomBarItem,
  SkeletonParagraph,
  SkeletonParagraphWithIcon,
  SkeletonText,
} from '@/shared/ui/skeleton';

/**
 * ⛔ MỌI test ở đây truyền `animated={false}`.
 *
 * Nhịp thở chạy `withRepeat(…, -1)` — lặp VÔ HẠN. Để bật thì bộ đếm của Jest
 * lúc nào cũng còn việc và suite không bao giờ kết thúc; đó cũng chính là lý do
 * prop `animated` tồn tại (xem ghi chú trong `Skeleton`).
 *
 * ⚠️ Chỉ test HÀNH VI. Màu và bo góc đi qua `className` nên KHÔNG có trong Jest
 * (`docs/rules/testing.md`).
 *
 * ⚠️ Ngoại lệ có kiểm chứng: `style` đọc ở đây KHÔNG phải style của NativeWind
 * mà là object nội tuyến do chính component dựng (`useMemo` trong `Skeleton`).
 * Nó có thật trong cây render — đã đối chiếu — nên đọc nó không phải là kiểm
 * hình thức, mà là kiểm đúng cái luật "chỉ đưa vào khoá THẬT SỰ được truyền".
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */

/** Node của cây `toJSON()`, khai tối thiểu để đếm khối con. */
interface JsonNode {
  children: (JsonNode | string)[] | null;
  props: Record<string, unknown>;
  type: string;
}

function rootOf(json: unknown): JsonNode {
  return (Array.isArray(json) ? json[0] : json) as JsonNode;
}

function childrenOf(node: JsonNode | undefined): JsonNode[] {
  return (node?.children ?? []).filter((child): child is JsonNode => typeof child !== 'string');
}

function flatStyle(node: JsonNode | undefined): ViewStyle {
  return StyleSheet.flatten(node?.props.style as StyleProp<ViewStyle>) ?? {};
}

describe('Skeleton', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<Skeleton animated={false} />);

    expect(screen.toJSON()).not.toBeNull();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <Skeleton
        animated={false}
        className="mt-md"
        height={24}
        radius={8}
        variant="rect"
        width={120}
      />,
    );

    expect(screen.toJSON()).not.toBeNull();
  });

  it('vẽ được mọi biến thể', async () => {
    const screen = await render(
      <>
        <Skeleton animated={false} variant="text" />
        <Skeleton animated={false} variant="circle" />
        <Skeleton animated={false} variant="rect" />
        <Skeleton animated={false} variant="card" />
      </>,
    );

    expect(screen.toJSON()).not.toBeNull();
  });

  /**
   * ⛔ Khung xương là hình trang trí thuần. Thiếu hai prop này thì
   * VoiceOver/TalkBack đọc ra hàng chục ô trống vô nghĩa và người dùng khiếm
   * thị phải vuốt hết chúng mới tới được nội dung thật.
   *
   * ⚠️ Phải khai CẢ HAI: `accessibilityElementsHidden` chỉ iOS nghe,
   * `importantForAccessibility` chỉ Android nghe. Thiếu một là hở một nền.
   */
  it('giấu khỏi trình đọc màn hình trên cả hai nền tảng', async () => {
    const screen = await render(<Skeleton animated={false} />);

    expect(rootOf(screen.toJSON()).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  /**
   * ⛔ Đây là cái bẫy đã được ghi thẳng trong component.
   *
   * NativeWind gộp style của `className` với prop `style`, và prop `style`
   * THẮNG. Nên một khoá mang giá trị `undefined` không phải là "không đè" — nó
   * XOÁ giá trị mà class vừa đặt. Viết thẳng `{ width, height, borderRadius }`
   * là khối mất luôn kích thước của biến thể ngay khi nơi gọi không truyền gì,
   * và không có lỗi nào báo.
   */
  it('không truyền kích thước thì KHÔNG chèn khoá rỗng vào style', async () => {
    const screen = await render(<Skeleton animated={false} variant="rect" />);
    const style = flatStyle(rootOf(screen.toJSON()));

    expect(style).not.toHaveProperty('width');
    expect(style).not.toHaveProperty('height');
    expect(style).not.toHaveProperty('borderRadius');
  });

  it('truyền kích thước thì đè đúng ba khoá đó', async () => {
    const screen = await render(
      <Skeleton animated={false} height={24} radius={8} variant="rect" width={120} />,
    );
    const style = flatStyle(rootOf(screen.toJSON()));

    expect(style.width).toBe(120);
    expect(style.height).toBe(24);
    expect(style.borderRadius).toBe(8);
  });

  it('nhận chiều rộng dạng phần trăm', async () => {
    const screen = await render(<Skeleton animated={false} width="50%" />);

    expect(flatStyle(rootOf(screen.toJSON())).width).toBe('50%');
  });
});

describe('SkeletonText', () => {
  it('vẽ đúng số dòng được yêu cầu', async () => {
    const screen = await render(<SkeletonText animated={false} lines={4} />);

    expect(childrenOf(rootOf(screen.toJSON()))).toHaveLength(4);
  });

  it('mặc định ba dòng', async () => {
    const screen = await render(<SkeletonText animated={false} />);

    expect(childrenOf(rootOf(screen.toJSON()))).toHaveLength(3);
  });

  /** Số dòng 0 hoặc âm thì không vẽ dòng nào — và KHÔNG nổ. */
  it('số dòng bằng 0 hoặc âm thì không vẽ dòng nào', async () => {
    const zero = await render(<SkeletonText animated={false} lines={0} />);
    expect(childrenOf(rootOf(zero.toJSON()))).toHaveLength(0);

    const negative = await render(<SkeletonText animated={false} lines={-3} />);
    expect(childrenOf(rootOf(negative.toJSON()))).toHaveLength(0);
  });

  /**
   * Dòng cuối ngắn hơn là thứ làm khung xương trông giống đoạn văn thay vì
   * giống bảng — đoạn văn thật hiếm khi kết thúc đúng mép phải.
   */
  it('từ hai dòng trở lên thì dòng cuối ngắn lại', async () => {
    const screen = await render(<SkeletonText animated={false} lastLineWidth="60%" lines={3} />);
    const lines = childrenOf(rootOf(screen.toJSON())).map((line) => flatStyle(line).width);

    expect(lines).toEqual(['100%', '100%', '60%']);
  });

  /**
   * ⛔ Ngoại lệ một dòng. Khung một dòng (nhãn, tiêu đề ngắn) mà tự co còn 60%
   * thì trông như đang thiếu nội dung chứ không như đang tải.
   */
  it('một dòng thì KHÔNG co ngắn', async () => {
    const screen = await render(<SkeletonText animated={false} lastLineWidth="60%" lines={1} />);
    const [line] = childrenOf(rootOf(screen.toJSON()));

    expect(flatStyle(line).width).toBe('100%');
  });

  it('giấu cả khối khỏi trình đọc màn hình', async () => {
    const screen = await render(<SkeletonText animated={false} />);

    expect(rootOf(screen.toJSON()).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('Khối skeleton ghép sẵn', () => {
  /** Figma `Block → Paragraph`: hai dòng, dòng cuối rộng ĐÚNG 104dp (số đo, không phải tỉ lệ). */
  it('SkeletonParagraph: hai dòng, dòng cuối 104dp', async () => {
    const screen = await render(<SkeletonParagraph animated={false} />);
    const lines = childrenOf(rootOf(screen.toJSON())).map((line) => flatStyle(line).width);

    expect(lines).toEqual(['100%', 104]);
  });

  /** Figma `Block → Paragraph + Icon`: khối tròn đứng trước cột hai dòng chữ. */
  it('SkeletonParagraphWithIcon: một khối tròn và hai dòng chữ', async () => {
    const screen = await render(<SkeletonParagraphWithIcon animated={false} />);
    const [icon, textColumn] = childrenOf(rootOf(screen.toJSON()));

    expect(icon).toBeDefined();
    expect(childrenOf(textColumn)).toHaveLength(2);
  });

  /** Figma `Block → Bottom bar item`: khối tròn, dưới là thanh nhãn rộng 64dp. */
  it('SkeletonBottomBarItem: khối tròn và thanh nhãn 64dp', async () => {
    const screen = await render(<SkeletonBottomBarItem animated={false} />);
    const [icon, label] = childrenOf(rootOf(screen.toJSON()));

    expect(icon).toBeDefined();
    expect(flatStyle(label).width).toBe(64);
  });

  it('mọi khối ghép sẵn đều bị giấu khỏi trình đọc màn hình', async () => {
    const paragraph = await render(<SkeletonParagraph animated={false} />);
    const withIcon = await render(<SkeletonParagraphWithIcon animated={false} />);
    const bottomBar = await render(<SkeletonBottomBarItem animated={false} />);

    for (const screen of [paragraph, withIcon, bottomBar]) {
      expect(rootOf(screen.toJSON()).props).toMatchObject({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      });
    }
  });
});
