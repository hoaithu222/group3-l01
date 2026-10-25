import { screen } from '@testing-library/react-native';

import { PdfPreview } from '../components/preview/PdfPreview';
import { useDownloadedFile } from '../hooks/useDownloadedFile';
import { loadPdfComponent } from '../utils/load-pdf-module';
import { makeResource } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Nhánh có native module: tải về cache tạm (hiện tiến độ) rồi vẽ `Pdf` với
 * `file://`. Module native được thay bằng component giả — ST-02 (≤ 3 s) là kịch
 * bản THIẾT BỊ, CHƯA XÁC MINH.
 */

jest.mock('react-native-pdf', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ source }: { source: { uri: string } }) =>
      React.createElement(View, { accessibilityLabel: source.uri, testID: 'pdf-view' }),
  };
});
jest.mock('../hooks/useDownloadedFile', () => ({ useDownloadedFile: jest.fn() }));

const mockedFile = jest.mocked(useDownloadedFile);
const props = { onDownload: jest.fn(), onOpenExternal: jest.fn(), variant: 'original' as const };

beforeEach(() => jest.clearAllMocks());

describe('PdfPreview — có native module', () => {
  it('loadPdfComponent trả component  của module', () => {
    expect(loadPdfComponent()).toEqual(expect.any(Function));
  });

  it('đang tải ⇒ hiện tiến độ %; chưa vẽ Pdf', async () => {
    mockedFile.mockReturnValue({ progress: 0.4, retry: jest.fn(), status: 'downloading' });
    await renderWithProviders(<PdfPreview {...props} resource={makeResource()} />);

    expect(await screen.findByText('Đang tải tệp… 40%')).toBeOnTheScreen();
    expect(screen.queryByTestId('pdf-view')).toBeNull();
  });

  it('tải xong ⇒ vẽ Pdf với đúng file cục bộ', async () => {
    mockedFile.mockReturnValue({
      retry: jest.fn(),
      status: 'ready',
      uri: 'file:///cache/resources/a.pdf',
    });
    await renderWithProviders(<PdfPreview {...props} resource={makeResource()} />);

    const pdf = await screen.findByTestId('pdf-view');
    expect(pdf.props.accessibilityLabel).toBe('file:///cache/resources/a.pdf');
  });

  it('tải lỗi ⇒ có "Thử lại" và đường lui mở ngoài', async () => {
    const retry = jest.fn();
    mockedFile.mockReturnValue({ error: new Error('x'), retry, status: 'error' });
    await renderWithProviders(<PdfPreview {...props} resource={makeResource()} />);

    expect(await screen.findByText('Không mở được tệp')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
    expect(screen.getByText('Mở bằng ứng dụng khác')).toBeOnTheScreen();
  });
});
