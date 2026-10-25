import { coinErrorCode, coinErrorMessage, shortfallOf } from '../utils/coin-errors';
import { formatCoinDelta, formatCoins, transactionLabel } from '../utils/coin-format';
import { emojisOf, frameOf, themeOf } from '../utils/shop-data';
import { apiError } from './coins.harness';

/**
 * Chỗ SAI THÌ IM LẶNG của feature (2/2): đọc `data` vật phẩm do admin nhập (hỏng thì bỏ phần hỏng, không sập), câu lỗi `COIN_*` (kể cả số "còn thiếu"), định dạng xu.
 * (Sự kiện socket + vá cache: `coins-cache.test.ts`.)
 */

describe('shop-data — đọc data vật phẩm phòng thủ', () => {
  it('frameOf: màu hợp lệ + độ dày kẹp 1–8, mặc định 3; màu hỏng ⇒ null', () => {
    expect(frameOf({ color: '#D4A017', width: 5 })).toEqual({ color: '#D4A017', width: 5 });
    expect(frameOf({ color: '#D4A017' })?.width).toBe(3);
    expect(frameOf({ color: '#D4A017', width: 99 })?.width).toBe(8);
    expect(frameOf({ color: '#D4A017', width: -2 })?.width).toBe(1);
    expect(frameOf({ color: 'red' })).toBeNull();
    expect(frameOf(null)).toBeNull();
  });

  it('themeOf: cần đủ hai màu hợp lệ', () => {
    expect(themeOf({ accent: '#112233', primary: '#445566' })).toEqual({
      accent: '#112233',
      primary: '#445566',
    });
    expect(themeOf({ primary: '#445566' })).toBeNull();
  });

  it('emojisOf: bỏ phần tử không phải chuỗi, cắt theo giới hạn', () => {
    expect(emojisOf({ emojis: ['😀', 3, '', '😎', '🎉'] }, 2)).toEqual(['😀', '😎']);
    expect(emojisOf({ emojis: 'x' })).toEqual([]);
    expect(emojisOf(null)).toEqual([]);
  });
});

describe('câu lỗi COIN_*', () => {
  it('COIN_001 kèm details ⇒ "còn thiếu N xu" (tính từ số của server)', () => {
    const error = apiError(400, 'COIN_001', { balance: 100, required: 300 });
    expect(shortfallOf(error)).toEqual({ balance: 100, missing: 200, required: 300 });
    expect(coinErrorMessage(error)).toBe('Bạn còn thiếu 200 xu');
  });

  it('COIN_001 thiếu details ⇒ câu chung, không ném lỗi', () => {
    const error = apiError(400, 'COIN_001');
    expect(shortfallOf(error)).toBeNull();
    expect(coinErrorMessage(error)).toBe('Bạn không đủ xu');
  });

  it('các mã còn lại có câu riêng của feature (không dùng câu của server)', () => {
    expect(coinErrorMessage(apiError(409, 'COIN_002'))).toBe('Bạn đã sở hữu vật phẩm này');
    expect(coinErrorMessage(apiError(404, 'COIN_003'))).toBe('Vật phẩm không còn được bán');
    expect(coinErrorMessage(apiError(409, 'COIN_004'))).toBe(
      'Phần thưởng nhiệm vụ này đã được nhận',
    );
    expect(coinErrorMessage(apiError(400, 'COIN_005'))).toBe('Nhiệm vụ chưa hoàn thành');
    expect(coinErrorMessage(apiError(400, 'COIN_009'))).toBe('Số dư xu vượt mức tối đa cho phép');
    expect(coinErrorCode(apiError(409, 'COIN_002'))).toBe('COIN_002');
    expect(coinErrorCode(new Error('x'))).toBeNull();
  });
});

describe('định dạng xu', () => {
  it('luôn kèm chữ "xu", dấu chấm ngăn nghìn; chưa có số ⇒ rỗng (không bịa "0 xu")', () => {
    expect(formatCoins(1250)).toBe('1.250 xu');
    expect(formatCoins(0)).toBe('0 xu');
    expect(formatCoins(undefined)).toBe('');
    expect(formatCoinDelta(20)).toBe('+20 xu');
    expect(formatCoinDelta(-1500)).toBe('-1.500 xu');
  });

  it('nhãn dòng lịch sử: EARN_EVENT theo nguồn XP, nguồn lạ rơi về nhãn chung', () => {
    expect(transactionLabel({ refId: 'TASK_ON_TIME:abc', type: 'EARN_EVENT' })).toBe(
      'Hoàn thành công việc đúng hạn',
    );
    expect(transactionLabel({ refId: 'NEW_SOURCE:1', type: 'EARN_EVENT' })).toBe(
      'Thưởng hoạt động',
    );
    expect(transactionLabel({ refId: 'q:2026-09-27', type: 'EARN_QUEST' })).toBe(
      'Thưởng nhiệm vụ ngày',
    );
    expect(transactionLabel({ refId: 'x', type: 'SPEND_SHOP' })).toBe('Mua vật phẩm ở cửa hàng');
  });
});
