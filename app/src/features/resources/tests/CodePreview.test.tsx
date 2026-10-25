import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { resourcesService } from '../api/resources.service';
import { CodePreview } from '../components/preview/CodePreview';
import { makeResource } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * `CodePreview` (README p3-01 §2, app.md §8): quá 500 KB hoặc 2.000 dòng ⇒ "Tệp
 * quá lớn để xem trước" + Tải về; KHÔNG kéo nội dung khi đã biết quá dung lượng.
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: { url: jest.fn() },
}));

const mockedUrl = jest.mocked(resourcesService.url);
const originalFetch = globalThis.fetch;
const onDownload = jest.fn();
const onOpenExternal = jest.fn();

function code(overrides: Parameters<typeof makeResource>[0] = {}) {
  return makeResource({
    extension: 'ts',
    language: 'typescript',
    mime: 'text/plain',
    name: 'app.ts',
    size: 100,
    type: 'CODE',
    ...overrides,
  });
}

function mockFile(text: string) {
  mockedUrl.mockResolvedValue({
    disposition: 'inline',
    expiresAt: 'x',
    mime: 'text/plain',
    url: 'https://s/file',
  });
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => text,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const render = (resource: ReturnType<typeof code>) =>
  renderWithProviders(
    <CodePreview
      resource={resource}
      variant="original"
      onDownload={onDownload}
      onOpenExternal={onOpenExternal}
    />,
  );

describe('CodePreview', () => {
  it('tệp > 500 KB ⇒ "Tệp quá lớn để xem trước" + Tải về, KHÔNG xin URL/tải nội dung', async () => {
    await render(code({ size: 512 * 1024 + 1 }));

    expect(await screen.findByText('Tệp quá lớn để xem trước')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tải về'));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(mockedUrl).not.toHaveBeenCalled();
  });

  it('nội dung > 2.000 dòng ⇒ cũng "Tệp quá lớn" dù dung lượng nhỏ', async () => {
    mockFile(Array.from({ length: 2001 }, (_, i) => `line ${i}`).join('\n'));
    await render(code());

    expect(await screen.findByText('Tệp quá lớn để xem trước')).toBeOnTheScreen();
  });

  it('mã hợp lệ ⇒ hiện số dòng, nội dung, và "Sao chép" chép ĐÚNG toàn bộ nội dung', async () => {
    const source = 'const a = 1;\nconsole.log(a);';
    mockFile(source);
    await render(code());

    expect(await screen.findByText('2 dòng · typescript')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Sao chép'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(source));
  });

  it('lỗi tải nội dung ⇒ có "Thử lại" và "Mở bằng ứng dụng khác"', async () => {
    mockedUrl.mockRejectedValue(new Error('mạng'));
    await render(code());

    // `useResourceText` thử lại 1 lần (retryDelay 1 s) trước khi báo lỗi — chờ lâu hơn mặc định.
    expect(await screen.findByText('Thử lại', {}, { timeout: 3000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Mở bằng ứng dụng khác'));
    expect(onOpenExternal).toHaveBeenCalledTimes(1);
  });
});
