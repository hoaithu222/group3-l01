import { render, userEvent } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/shell/providers/ErrorBoundary';

/**
 * ⛔ Màn hình lỗi dựng bằng `Screen`, mà `Screen` gọi `useSafeAreaInsets()` —
 * hook đó NÉM LỖI khi không có `SafeAreaProvider` bọc ngoài. `initialMetrics`
 * là bắt buộc: trong Jest không có tầng native nào đo được, thiếu nó thì
 * provider chờ `onLayout` mãi mãi và cây con không bao giờ vẽ.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const BOOM_MESSAGE = 'Không đọc được số dư của tài khoản 0011…';
const HEALTHY_TEXT = 'Nội dung bình thường';
const ERROR_TITLE = 'Đã có lỗi xảy ra';
const RETRY_LABEL = 'Thử lại';

function renderInSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

/** Con ném lỗi NGAY LÚC RENDER — đúng loại lỗi mà ranh giới bắt được. */
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error(BOOM_MESSAGE);
  return <Text>{HEALTHY_TEXT}</Text>;
}

/**
 * `__DEV__` là biến toàn cục THẬT trong Jest nên đổi được lúc chạy.
 *
 * ⚠️ Trên máy thì không: Metro thay thẳng `__DEV__` bằng `true`/`false` lúc
 * đóng gói. Đây là lý do duy nhất kiểm được nhánh "bản phát hành" ở đây, và
 * cũng là lý do phải khôi phục giá trị cũ sau mỗi ca — để lại `false` thì mọi
 * suite chạy sau đó im lặng đổi hành vi.
 */
function setDev(value: boolean) {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let originalDev: boolean;

  beforeEach(() => {
    /**
     * ⛔ Chặn `console.error` TẠI CHỖ rồi trả lại, không tắt toàn cục.
     *
     * Mỗi ca ở đây làm React in cả một khối "The above error occurred in…" cộng
     * với dòng log của chính `componentDidCatch`. Tắt toàn cục thì mọi suite
     * khác cũng mất luôn cảnh báo thật (`Icon` báo thiếu icon, RN báo key trùng)
     * — nghĩa là mất một lớp phát hiện lỗi để đổi lấy một khung log sạch.
     */
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    originalDev = __DEV__;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    setDev(originalDev);
  });

  it('bắt lỗi render của con và hiện màn lỗi có đường ra', async () => {
    const screen = await renderInSafeArea(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText(ERROR_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(RETRY_LABEL)).toBeOnTheScreen();
    // Cây con đã bị gỡ — nếu còn thì lỗi vẫn đang treo ở đó.
    expect(screen.queryByText(HEALTHY_TEXT)).not.toBeOnTheScreen();
    // Dấu vết cho bộ phận hỗ trợ: không có nó thì lỗi biến mất không để lại gì.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ErrorBoundary] lỗi render:',
      expect.any(Error),
      expect.anything(),
    );
  });

  /**
   * ⛔ Ca này chặn một lỗ RÒ RỈ, không phải lỗi hiển thị.
   *
   * `error.message` của app ngân hàng hay kèm đường dẫn nội bộ, tên endpoint,
   * đôi khi cả mảnh dữ liệu phiên — mà màn hình lỗi lại đúng là thứ người dùng
   * chụp lại rồi gửi cho người lạ để hỏi.
   */
  it('bản PHÁT HÀNH không hiện nội dung lỗi thật', async () => {
    setDev(false);
    const screen = await renderInSafeArea(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(BOOM_MESSAGE)).not.toBeOnTheScreen();
    expect(screen.getByText(ERROR_TITLE)).toBeOnTheScreen();
  });

  /**
   * ⛔ Tách khỏi ca trên, ĐỪNG gộp lại thành một `it` hai lượt render.
   *
   * Gọi `render()` lần thứ hai trong CÙNG một `it` (RNTL 14) làm cây thứ hai
   * không truy vấn được, và — nặng hơn — mọi ca CHẠY SAU trong file cũng render
   * ra rỗng. Triệu chứng là "Unable to find an element" ở những ca không liên
   * quan gì, nên rất tốn thời gian để lần ra. Đã xảy ra thật khi viết file này.
   */
  it('bản DEV hiện thông điệp lỗi thật để lập trình viên còn lần ra', async () => {
    setDev(true);
    const screen = await renderInSafeArea(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    // Ranh giới lỗi NUỐT mất màn đỏ của React: không hiện thông điệp thật ở đây
    // thì lập trình viên mất hẳn dấu vết và phải gỡ `ErrorBoundary` ra mới soi được.
    expect(screen.getByText(BOOM_MESSAGE)).toBeOnTheScreen();
  });

  it('bấm "Thử lại" thì gọi `onReset` rồi dựng lại cây con', async () => {
    const onReset = jest.fn();
    const screen = await renderInSafeArea(
      <ErrorBoundary onReset={onReset}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(ERROR_TITLE)).toBeOnTheScreen();

    /* Nguồn lỗi đã được sửa (dữ liệu mới về, cache đã xoá) — nhưng ranh giới
       VẪN hiện màn lỗi cho tới khi người dùng bấm, đó mới là hành vi đúng. */
    await screen.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ErrorBoundary onReset={onReset}>
          <Boom shouldThrow={false} />
        </ErrorBoundary>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText(HEALTHY_TEXT)).not.toBeOnTheScreen();

    await userEvent.press(screen.getByText(RETRY_LABEL));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText(HEALTHY_TEXT)).toBeOnTheScreen();
    expect(screen.queryByText(ERROR_TITLE)).not.toBeOnTheScreen();
  });

  it('`fallback` thay hoàn toàn giao diện lỗi mặc định', async () => {
    const screen = await renderInSafeArea(
      <ErrorBoundary fallback={<Text>Khối này tạm thời không dùng được</Text>}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Khối này tạm thời không dùng được')).toBeOnTheScreen();
    expect(screen.queryByText(ERROR_TITLE)).not.toBeOnTheScreen();
    expect(screen.queryByText(RETRY_LABEL)).not.toBeOnTheScreen();
  });

  it('con không ném lỗi thì vẽ nguyên cây con, không xen gì thêm', async () => {
    const screen = await renderInSafeArea(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(HEALTHY_TEXT)).toBeOnTheScreen();
    expect(screen.queryByText(ERROR_TITLE)).not.toBeOnTheScreen();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
