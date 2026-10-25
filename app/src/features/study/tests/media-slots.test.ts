import { newDraftItem } from '../utils/editor-draft';
import {
  coverScopeKey,
  getSlotAsset,
  itemScopePrefix,
  itemSlotScopeKey,
  parseItemSlotScopeKey,
  setSlotAsset,
  type MediaSlot,
} from '../utils/media-slots';

/**
 * "Ô media" của mục: khoá trong hàng đợi upload (để biết tệp READY nào phải ghi vào mục nào) và đọc/ghi asset của từng ô.
 */
describe('scopeKey của ô media', () => {
  const SLOTS: MediaSlot[] = [
    { kind: 'front' },
    { kind: 'back' },
    { kind: 'audio' },
    { kind: 'option', optionKey: 'o_abc123' },
    { kind: 'option', optionKey: 'opt-lx3k-4-9f8e7d6c' },
  ];

  it.each(SLOTS)('khoá rồi parse ngược ra đúng bộ + mục + ô (%o)', (slot) => {
    const key = itemSlotScopeKey('s1', 'item-9', slot);
    expect(key.startsWith(itemScopePrefix('s1'))).toBe(true);
    expect(parseItemSlotScopeKey(key)).toEqual({ itemKey: 'item-9', setId: 's1', slot });
  });

  it('khoá của bộ khác không mang tiền tố của bộ này', () => {
    expect(itemSlotScopeKey('s2', 'i1', { kind: 'front' }).startsWith(itemScopePrefix('s1'))).toBe(false);
  });

  it('khoá lạ (ảnh bìa, thiếu phần, ô không biết) ⇒ null, không đoán mò', () => {
    expect(parseItemSlotScopeKey(undefined)).toBeNull();
    expect(parseItemSlotScopeKey(coverScopeKey('s1'))).toBeNull();
    expect(parseItemSlotScopeKey('study-item:s1:i1')).toBeNull();
    expect(parseItemSlotScopeKey('study-item:s1:i1:video')).toBeNull();
    expect(parseItemSlotScopeKey('study-item:s1:i1:opt.')).toBeNull();
    expect(parseItemSlotScopeKey('message:s1:i1:front')).toBeNull();
  });
});

describe('getSlotAsset / setSlotAsset', () => {
  function choice() {
    const item = newDraftItem('MULTIPLE_CHOICE');
    return { ...item, options: item.options.map((option, i) => ({ ...option, key: `k${i}` })) };
  }

  it('ghi/gỡ ảnh mặt trước, mặt sau và âm thanh độc lập nhau', () => {
    let item = newDraftItem('FLASHCARD');
    item = setSlotAsset(item, { kind: 'front' }, 'a-front');
    item = setSlotAsset(item, { kind: 'back' }, 'a-back');
    item = setSlotAsset(item, { kind: 'audio' }, 'a-audio');
    expect(item).toMatchObject({
      audioAssetId: 'a-audio',
      backMediaAssetId: 'a-back',
      frontMediaAssetId: 'a-front',
    });
    expect(getSlotAsset(item, { kind: 'back' })).toBe('a-back');

    item = setSlotAsset(item, { kind: 'front' }, null);
    expect(item.frontMediaAssetId).toBeNull();
    expect(item.backMediaAssetId).toBe('a-back');
  });

  it('ảnh lựa chọn: chỉ đúng lựa chọn có khoá đó đổi', () => {
    const item = setSlotAsset(choice(), { kind: 'option', optionKey: 'k1' }, 'a-opt');
    expect(item.options.map((option) => option.mediaAssetId)).toEqual([null, 'a-opt']);
    expect(getSlotAsset(item, { kind: 'option', optionKey: 'k1' })).toBe('a-opt');
    expect(getSlotAsset(item, { kind: 'option', optionKey: 'k0' })).toBeNull();
  });

  it('lựa chọn đã bị xoá thì bỏ qua — không tạo lại lựa chọn, không ném lỗi', () => {
    const item = choice();
    const next = setSlotAsset(item, { kind: 'option', optionKey: 'da-xoa' }, 'a-opt');
    expect(next.options).toEqual(item.options);
    expect(getSlotAsset(next, { kind: 'option', optionKey: 'da-xoa' })).toBeNull();
  });
});
