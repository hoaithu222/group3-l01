import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { compressImage } from '../compress-image';
import { pickDocuments, pickImages, takePhoto } from '../pick-media';

/**
 * BE không giải mã được HEIC (log Railway 2026-09-27: `heif: Decoder plugin generated an error`) — tệp lên được nhưng kẹt `PROCESSING`
 * rồi app báo lỗi sau 30 s. Nên HEIC/HEIF PHẢI thành JPEG ngay ở biên chọn tệp, với MIME/tên/dung lượng của BẢN ĐÃ ĐỔI (không phải bản
 * gốc). Tách khỏi `pick-media.test.ts` (đo size/MIME) để mỗi file test giữ dưới trần 150 dòng.
 */
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('../compress-image', () => ({ compressImage: jest.fn() }));
jest.mock('../permissions', () => ({
  ensureCameraPermission: jest.fn(async () => 'granted'),
  ensureMediaLibraryPermission: jest.fn(async () => 'granted'),
}));

const mockedLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<typeof ImagePicker.launchImageLibraryAsync>;
const mockedCamera = ImagePicker.launchCameraAsync as jest.MockedFunction<typeof ImagePicker.launchCameraAsync>;
const mockedDocuments = DocumentPicker.getDocumentAsync as jest.MockedFunction<typeof DocumentPicker.getDocumentAsync>;
const mockedInfo = FileSystem.getInfoAsync as jest.MockedFunction<typeof FileSystem.getInfoAsync>;
const mockedCompress = compressImage as jest.MockedFunction<typeof compressImage>;

function measured(size: number): Awaited<ReturnType<typeof FileSystem.getInfoAsync>> {
  return { exists: true, uri: 'file:///x', size, isDirectory: false, modificationTime: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HEIC → JPEG ở biên chọn tệp', () => {
  it('ảnh HEIC từ thư viện → JPEG: uri/tên/MIME/kích thước là của bản đã đổi', async () => {
    mockedLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///IMG_0001.HEIC', fileName: 'IMG_0001.HEIC', mimeType: 'image/heic', fileSize: 3_000_000, width: 4032, height: 3024, type: 'image' },
      ],
    } as never);
    mockedCompress.mockResolvedValue({ uri: 'file:///cache/out.jpg', width: 2048, height: 1536 });
    mockedInfo.mockResolvedValue(measured(555_000));

    const [file] = await pickImages();

    expect(mockedCompress).toHaveBeenCalledWith({ uri: 'file:///IMG_0001.HEIC', width: 4032, height: 3024 });
    expect(file).toMatchObject({
      kind: 'IMAGE',
      uri: 'file:///cache/out.jpg',
      name: 'IMG_0001.jpg',
      mime: 'image/jpeg',
      size: 555_000,
      width: 2048,
      height: 1536,
    });
    expect(mockedInfo).toHaveBeenCalledWith('file:///cache/out.jpg');
  });

  it('`image/heif` chụp bằng máy ảnh → cũng đổi sang JPEG', async () => {
    mockedCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///c.heif', fileName: 'c.heif', mimeType: 'image/heif', fileSize: 10, width: 10, height: 10, type: 'image' }],
    } as never);
    mockedCompress.mockResolvedValue({ uri: 'file:///cache/c.jpg', width: 10, height: 10 });
    mockedInfo.mockResolvedValue(measured(9));

    const file = await takePhoto();

    expect(file).toMatchObject({ mime: 'image/jpeg', name: 'c.jpg', uri: 'file:///cache/c.jpg', size: 9 });
  });

  it('HEIC chọn qua trình chọn tệp (Drive báo octet-stream, đuôi .heif) → đổi sang JPEG; không có kích thước thì không ép resize', async () => {
    mockedDocuments.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///d.heif', name: 'anh.heif', mimeType: 'application/octet-stream', size: 2000 }],
    } as never);
    mockedCompress.mockResolvedValue({ uri: 'file:///cache/d.jpg', width: 800, height: 600 });
    mockedInfo.mockResolvedValue(measured(1234));

    const [file] = await pickDocuments();

    expect(mockedCompress).toHaveBeenCalledWith({ uri: 'file:///d.heif', width: 0, height: 0 });
    expect(file).toMatchObject({ kind: 'IMAGE', mime: 'image/jpeg', name: 'anh.jpg', size: 1234 });
  });

  it('JPEG/PNG KHÔNG bị đụng tới (giữ alpha PNG, không mã hoá lại ảnh đã ổn)', async () => {
    mockedLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.png', fileName: 'a.png', mimeType: 'image/png', fileSize: 5, width: 1, height: 1, type: 'image' },
        { uri: 'file:///b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg', fileSize: 5, width: 1, height: 1, type: 'image' },
      ],
    } as never);

    const files = await pickImages();

    expect(mockedCompress).not.toHaveBeenCalled();
    expect(files.map((f) => f.uri)).toEqual(['file:///a.png', 'file:///b.jpg']);
  });

  it('máy không đổi nổi (compressImage ném lỗi) → giữ tệp gốc, không làm hỏng cả lượt chọn', async () => {
    mockedLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///x.heic', fileName: 'x.heic', mimeType: 'image/heic', fileSize: 77, width: 5, height: 5, type: 'image' },
        { uri: 'file:///y.jpg', fileName: 'y.jpg', mimeType: 'image/jpeg', fileSize: 88, width: 5, height: 5, type: 'image' },
      ],
    } as never);
    mockedCompress.mockRejectedValue(new Error('decode failed'));

    const files = await pickImages();

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ uri: 'file:///x.heic', mime: 'image/heic', size: 77 });
    expect(files[1]).toMatchObject({ uri: 'file:///y.jpg', mime: 'image/jpeg' });
  });
});
