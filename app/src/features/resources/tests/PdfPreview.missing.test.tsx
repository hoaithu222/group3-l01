import { fireEvent, screen } from '@testing-library/react-native';

import { resourcesService } from '../api/resources.service';
import { PdfPreview } from '../components/preview/PdfPreview';
import { loadPdfComponent } from '../utils/load-pdf-module';
import { makeResource } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * ⛔ Đường lui QUAN TRỌNG của spike `react-native-pdf`: dev-client hiện tại CHƯA
 * biên dịch native module. Import ném lỗi ⇒ `PdfPreview` phải rơi về "Mở bằng ứng
 * dụng khác" chứ KHÔNG crash, và KHÔNG tải tệp 20 MB vô ích.
 */

jest.mock('react-native-pdf', () => {
  throw new Error('ReactNativeBlobUtil could not be found (native module missing)');
});
jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: { url: jest.fn() },
}));

const onDownload = jest.fn();
const onOpenExternal = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('PdfPreview — thiếu native module', () => {
  it('loadPdfComponent bắt lỗi import và trả null (không ném)', () => {
    expect(loadPdfComponent()).toBeNull();
  });

  it('rơi về giao diện "Mở bằng ứng dụng khác" + Tải về, không crash, không tải tệp', async () => {
    await renderWithProviders(
      <PdfPreview
        resource={makeResource()}
        variant="original"
        onDownload={onDownload}
        onOpenExternal={onOpenExternal}
      />,
    );

    expect(await screen.findByText('Không xem PDF trong ứng dụng được')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Mở bằng ứng dụng khác'));
    expect(onOpenExternal).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Tải về'));
    expect(onDownload).toHaveBeenCalledTimes(1);

    expect(jest.mocked(resourcesService.url)).not.toHaveBeenCalled();
  });
});
