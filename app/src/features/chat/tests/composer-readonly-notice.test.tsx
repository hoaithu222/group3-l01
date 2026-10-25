import { render } from '@testing-library/react-native';

import { Composer } from '../components/composer/Composer';

/**
 * Phòng chỉ-đọc: `Composer` vẽ thanh chung "Bạn không thể gửi tin ở đây." — TRỪ khi màn cha khai `hideReadOnlyNotice` (vì nó tự
 * vẽ thanh có lý do cụ thể ngay dưới `ChatRoom`). Bản cũ luôn vẽ ⇒ hai thanh khoá xếp chồng. Chỉ test HÀNH VI (có/không có
 * dòng chữ); vị trí/kiểu dáng là NativeWind, Jest không thấy.
 */
let mockConnection = 'connected';
jest.mock('@/core/socket', () => ({
  scopeKeyOf: (type: string, id: string) => `${type}:${id}`,
  useConnectionState: () => mockConnection,
}));
jest.mock('../components/composer/ComposerBody', () => ({ ComposerBody: () => null }));

const scope = { scopeType: 'CHANNEL', scopeId: 'ch-1' } as const;

beforeEach(() => {
  mockConnection = 'connected';
});

describe('Composer — thanh chỉ-đọc', () => {
  it('canWrite=false, không khai gì thêm ⇒ vẫn có thanh chung (luồng, khung chat phòng họp không có thanh riêng)', async () => {
    const screen = await render(
      <Composer capabilities={{ canWrite: false }} findMessage={() => undefined} scope={scope} />,
    );

    expect(screen.getByText('Bạn không thể gửi tin ở đây.')).toBeOnTheScreen();
  });

  it('canWrite=false + hideReadOnlyNotice ⇒ KHÔNG vẽ gì (màn cha đã có thanh lý do riêng)', async () => {
    const screen = await render(
      <Composer
        capabilities={{ canWrite: false, hideReadOnlyNotice: true }}
        findMessage={() => undefined}
        scope={scope}
      />,
    );

    expect(screen.queryByText('Bạn không thể gửi tin ở đây.')).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });
});

describe('Composer — mất kết nối', () => {
  it('máy mất mạng ⇒ nói rõ "không có mạng" và nháp còn nguyên', async () => {
    mockConnection = 'offline';
    const screen = await render(<Composer capabilities={{ canWrite: true }} findMessage={() => undefined} scope={scope} />);

    expect(screen.getByText(/Không có mạng/)).toBeOnTheScreen();
    expect(screen.getByText(/Nháp của bạn vẫn được giữ/)).toBeOnTheScreen();
  });

  it('còn mạng nhưng socket đang nối lại ⇒ câu KHÁC (chờ, không phải tự bật mạng)', async () => {
    mockConnection = 'connecting';
    const screen = await render(<Composer capabilities={{ canWrite: true }} findMessage={() => undefined} scope={scope} />);

    expect(screen.getByText(/Đang kết nối lại/)).toBeOnTheScreen();
    expect(screen.queryByText(/Không có mạng/)).toBeNull();
  });
});
