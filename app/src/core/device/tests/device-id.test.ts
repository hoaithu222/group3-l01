import { __resetDeviceIdCacheForTests, getDeviceId } from '../device-id';
import { readSecure } from '@/core/storage/secure-storage';

/**
 * `deviceId` phải ỔN ĐỊNH giữa các lượt gọi, không đổi giữa các lần "mở app"
 * (mô phỏng bằng việc xoá cache trong bộ nhớ rồi gọi lại), và nằm trong kho
 * khoá hệ điều hành (`AGENTS.md` điều 5) — nó là một phần khoá xác thực sinh
 * trắc học và định danh registry kết nối realtime, không phải dữ liệu thường.
 */
describe('getDeviceId', () => {
  beforeEach(() => {
    __resetDeviceIdCacheForTests();
  });

  it('trả về một chuỗi khác rỗng', async () => {
    const id = await getDeviceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThanOrEqual(8);
  });

  it('gọi nhiều lần liên tiếp ⇒ CÙNG một giá trị', async () => {
    const a = await getDeviceId();
    const b = await getDeviceId();
    expect(a).toBe(b);
  });

  it('5 lượt gọi ĐỒNG THỜI lúc chưa có cache ⇒ vẫn ra CÙNG một giá trị (không đua nhau tạo id khác nhau)', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => getDeviceId()));
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('"mở app" LẦN SAU (mất cache trong bộ nhớ, còn kho khoá) ⇒ đọc lại ĐÚNG id cũ', async () => {
    const first = await getDeviceId();

    // Mô phỏng khởi động lại app: cache trong bộ nhớ mất, SecureStore còn nguyên.
    __resetDeviceIdCacheForTests();

    const second = await getDeviceId();
    expect(second).toBe(first);
  });

  it('ghi id xuống SecureStore (kho khoá), không phải AsyncStorage', async () => {
    const id = await getDeviceId();
    await expect(readSecure('device.id.v1')).resolves.toBe(id);
  });
});
