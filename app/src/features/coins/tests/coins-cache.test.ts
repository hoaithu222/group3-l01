import { coinsKeys } from '../queries/coins.keys';
import { markQuestClaimed, patchWallet, setEquipped, setShopEquipped } from '../utils/coins-cache';
import { applyCoinsEvent, coinsChangeOf } from '../utils/coins-events';
import { entry, makeClient, quest, shopItem, wallet } from './coins.harness';

/**
 * Chỗ SAI THÌ IM LẶNG của feature (1/2): phân biệt `gamification:updated` dạng coins với dạng XP, áp sự kiện vào cache ví, vá cache sau nhận thưởng/trang bị.
 * (Đọc `data` vật phẩm, câu lỗi `COIN_*`, định dạng xu: `coins-data.test.ts`.)
 */

describe('coinsChangeOf — chỉ nhận sự kiện đổi số dư hợp lệ', () => {
  it('có coins hợp lệ ⇒ trả đủ ba trường', () => {
    expect(coinsChangeOf({ coins: { balance: 120, delta: 20, reason: 'EARN_EVENT' } })).toEqual({
      balance: 120,
      delta: 20,
      reason: 'EARN_EVENT',
    });
  });

  it('dạng XP/cấp/huy hiệu (không có coins) ⇒ null — việc của host XP', () => {
    expect(coinsChangeOf({ level: 3, newBadges: [], streak: 1, xp: 500 })).toBeNull();
  });

  it.each([
    ['payload null', null],
    ['không phải object', 'coins'],
    ['coins null', { coins: null }],
    ['balance sai kiểu', { coins: { balance: '120', delta: 20, reason: 'QUEST' } }],
    ['balance NaN', { coins: { balance: Number.NaN, delta: 1, reason: 'QUEST' } }],
    ['delta thiếu', { coins: { balance: 5, reason: 'QUEST' } }],
    ['lý do lạ', { coins: { balance: 5, delta: 1, reason: 'HACK' } }],
  ])('%s ⇒ null (không vá "NaN xu" lên màn)', (_name, payload) => {
    expect(coinsChangeOf(payload)).toBeNull();
  });
});

describe('applyCoinsEvent', () => {
  function clientWith(balance: number) {
    const client = makeClient();
    client.setQueryData(coinsKeys.wallet(), wallet({ balance }));
    return client;
  }

  it('vá số dư vào ví và đánh dấu ví/lịch sử/nhiệm vụ là cũ', () => {
    const client = clientWith(100);
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    applyCoinsEvent(client, { balance: 130, delta: 30, reason: 'EARN_EVENT' });

    expect(client.getQueryData<{ balance: number }>(coinsKeys.wallet())?.balance).toBe(130);
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual([coinsKeys.wallet(), coinsKeys.transactionsAll(), coinsKeys.quests()]);
  });

  it('SHOP (mua ở thiết bị khác) làm mới thêm cửa hàng + kho đồ', () => {
    const client = clientWith(500);
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    applyCoinsEvent(client, { balance: 200, delta: -300, reason: 'SHOP' });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(coinsKeys.shop());
    expect(keys).toContainEqual(coinsKeys.inventory());
  });

  it('số dư trong sự kiện ĐÃ trùng cache (thao tác vừa xong ở chính máy này) ⇒ không tải lại thừa', () => {
    const client = clientWith(200);
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    applyCoinsEvent(client, { balance: 200, delta: -300, reason: 'SHOP' });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('vá cache', () => {
  it('patchWallet: đổi số dư và cộng dồn bộ đếm trọn đời; chưa có ví ⇒ giữ nguyên', () => {
    expect(patchWallet(wallet(), { balance: 950, spent: 300 })).toMatchObject({
      balance: 950,
      lifetimeEarned: 2000,
      lifetimeSpent: 1050,
    });
    expect(patchWallet(wallet(), { balance: 1270, earned: 20 })).toMatchObject({
      lifetimeEarned: 2020,
      lifetimeSpent: 750,
    });
    expect(patchWallet(undefined, { balance: 5 })).toBeUndefined();
  });

  it('markQuestClaimed: chỉ nhiệm vụ đó đổi, hết "claimable"', () => {
    const out = markQuestClaimed(
      [quest('a', { claimable: true }), quest('b', { claimable: true })],
      'a',
    );
    expect(out?.[0]).toMatchObject({ claimable: false });
    expect(out?.[0]?.claimedAt).not.toBeNull();
    expect(out?.[1]).toMatchObject({ claimable: true, claimedAt: null });
  });

  it('setEquipped: trang bị món mới thì tháo món CÙNG LOẠI, không đụng loại khác', () => {
    const list = [
      entry('f1', { equipped: true }),
      entry('f2'),
      entry('t1', { equipped: true, kind: 'PROFILE_THEME' }),
    ];
    const out = setEquipped(list, { id: 'f2', kind: 'AVATAR_FRAME' }, true);
    expect(out?.map((e) => e.equipped)).toEqual([false, true, true]);
  });

  it('setEquipped: tháo chỉ tháo đúng món đó', () => {
    const list = [
      entry('f1', { equipped: true }),
      entry('t1', { equipped: true, kind: 'PROFILE_THEME' }),
    ];
    expect(
      setEquipped(list, { id: 'f1', kind: 'AVATAR_FRAME' }, false)?.map((e) => e.equipped),
    ).toEqual([false, true]);
  });

  it('setShopEquipped: nhận diện bằng inventoryId, cùng luật một-món-mỗi-loại', () => {
    const items = [
      shopItem('s1', { equipped: true, inventoryId: 'inv1', owned: true }),
      shopItem('s2', { inventoryId: 'inv2', owned: true }),
    ];
    expect(
      setShopEquipped(items, { id: 'inv2', kind: 'AVATAR_FRAME' }, true)?.map((i) => i.equipped),
    ).toEqual([false, true]);
  });
});
