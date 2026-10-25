import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { pickDocuments, pickImages, takePhoto } from '../pick-media';

/**
 * `size` PHẢI là số dương và MIME phải đúng dạng BE nhận, nếu không `POST /assets` trả `400 VAL_001` — nhưng `expo-image-picker`
 * (`fileSize`) và `expo-document-picker` (`size`) đều để `undefined` trên nhiều máy/nguồn (ảnh chụp, tệp từ Drive…) và hay báo
 * MIME lạ (`image/jpg`, `application/octet-stream`). Kiểm ở biên chọn tệp, mock đúng các module native.
 */
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('../permissions', () => ({
  ensureCameraPermission: jest.fn(async () => 'granted'),
  ensureMediaLibraryPermission: jest.fn(async () => 'granted'),
}));

const mockedLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<typeof ImagePicker.launchImageLibraryAsync>;
const mockedCamera = ImagePicker.launchCameraAsync as jest.MockedFunction<typeof ImagePicker.launchCameraAsync>;
const mockedDocuments = DocumentPicker.getDocumentAsync as jest.MockedFunction<typeof DocumentPicker.getDocumentAsync>;
const mockedInfo = FileSystem.getInfoAsync as jest.MockedFunction<typeof FileSystem.getInfoAsync>;

function measured(size: number): Awaited<ReturnType<typeof FileSystem.getInfoAsync>> {
  return { exists: true, uri: 'file:///x', size, isDirectory: false, modificationTime: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pickImages / takePhoto', () => {
  it('picker KHÔNG báo fileSize ⇒ đo lại dung lượng thật; MIME `image/jpg` ⇒ `image/jpeg`', async () => {
    mockedLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpg', width: 10, height: 10, type: 'image' }],
    } as never);
    mockedInfo.mockResolvedValue(measured(4321));

    const [file] = await pickImages();

    expect(file).toMatchObject({ kind: 'IMAGE', mime: 'image/jpeg', size: 4321, name: 'a.jpg' });
    expect(mockedInfo).toHaveBeenCalledWith('file:///a.jpg');
  });

  it('picker đã báo fileSize ⇒ dùng luôn, không đọc đĩa thêm', async () => {
    mockedCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///c.jpg', fileName: 'c.jpg', mimeType: 'image/jpeg', fileSize: 999, width: 1, height: 1, type: 'image' }],
    } as never);

    const file = await takePhoto();

    expect(file?.size).toBe(999);
    expect(mockedInfo).not.toHaveBeenCalled();
  });

  it('không đo được (lỗi đọc đĩa) ⇒ size 0 để lớp kiểm hợp lệ báo "không đọc được tệp", không ném lỗi', async () => {
    mockedLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg', width: 1, height: 1, type: 'image' }],
    } as never);
    mockedInfo.mockRejectedValue(new Error('EACCES'));

    const [file] = await pickImages();

    expect(file?.size).toBe(0);
  });
});

describe('pickDocuments', () => {
  it('tệp Drive chỉ báo `application/octet-stream` ⇒ suy MIME + kind từ đuôi; `size` thiếu ⇒ đo lại', async () => {
    mockedDocuments.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///bc.pdf', name: 'Bao-cao.PDF', mimeType: 'application/octet-stream' },
        { uri: 'file:///ga.m4a', name: 'ghi-am.m4a', mimeType: undefined, size: 2048 },
      ],
    } as never);
    mockedInfo.mockResolvedValue(measured(777));

    const files = await pickDocuments();

    expect(files[0]).toMatchObject({ mime: 'application/pdf', kind: 'FILE', size: 777 });
    expect(files[1]).toMatchObject({ mime: 'audio/mp4', kind: 'AUDIO', size: 2048 });
  });
});
