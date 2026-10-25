import type { ModuleUsageMap } from '@/shell/navigation/module-usage.store';

import {
  MIN_OPENS_TO_PROMOTE,
  pickHeroModules,
  splitHomeModules,
} from '../utils/module-ranking.utils';

const mods = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const ids = (list: readonly { id: string }[]) => list.map((module) => module.id);

describe('pickHeroModules', () => {
  it('chưa ghim + chưa có lượt mở ⇒ hero là các phân hệ đầu theo thứ tự khai báo', () => {
    expect(ids(pickHeroModules(mods, [], {}, 2))).toEqual(['a', 'b']);
  });

  it('phân hệ GHIM đứng trước, giữ đúng thứ tự ghim (không xếp lại theo gì cả)', () => {
    expect(ids(pickHeroModules(mods, ['d', 'b'], {}, 2))).toEqual(['d', 'b']);
  });

  it('ghim ít hơn số ô thì phần còn lại điền theo thứ tự khai báo', () => {
    expect(ids(pickHeroModules(mods, ['d'], {}, 2))).toEqual(['d', 'a']);
  });

  it('ghim của phân hệ không còn được vào (mất quyền / tắt cờ) bị bỏ qua, không chiếm ô', () => {
    expect(ids(pickHeroModules(mods, ['gone', 'c'], {}, 2))).toEqual(['c', 'a']);
  });

  it('nhiều ghim hơn số ô thì cắt theo số ô (ghim trước thắng)', () => {
    expect(ids(pickHeroModules(mods, ['c', 'd', 'e'], {}, 2))).toEqual(['c', 'd']);
  });

  it('lượt mở giảm dần điền ô CHƯA ghim — nhưng chỉ khi đạt ngưỡng', () => {
    const usage: ModuleUsageMap = {
      c: { count: MIN_OPENS_TO_PROMOTE + 4, lastAt: 1 },
      d: { count: MIN_OPENS_TO_PROMOTE, lastAt: 2 },
      e: { count: MIN_OPENS_TO_PROMOTE - 1, lastAt: 99 },
    };
    expect(ids(pickHeroModules(mods, [], usage, 2))).toEqual(['c', 'd']);
  });

  it('mở nhầm một hai lần không đủ đá phân hệ khỏi hero (dưới ngưỡng coi như 0)', () => {
    const usage: ModuleUsageMap = { d: { count: 2, lastAt: 100 } };
    expect(ids(pickHeroModules(mods, [], usage, 2))).toEqual(['a', 'b']);
  });

  it('hoà lượt mở thì lần mở gần nhất thắng, hoà nữa thì thứ tự khai báo', () => {
    const usage: ModuleUsageMap = {
      b: { count: 3, lastAt: 5 },
      c: { count: 3, lastAt: 9 },
      d: { count: 3, lastAt: 9 },
    };
    expect(ids(pickHeroModules(mods, [], usage, 2))).toEqual(['c', 'd']);
  });

  it('ghim thắng lượt mở: phân hệ mở nhiều nhất vẫn nhường ô cho ghim', () => {
    const usage: ModuleUsageMap = { e: { count: 50, lastAt: 1 } };
    expect(ids(pickHeroModules(mods, ['a'], usage, 2))).toEqual(['a', 'e']);
  });

  it('không đụng mảng đầu vào', () => {
    const input = [...mods];
    pickHeroModules(input, ['c'], { d: { count: 9, lastAt: 1 } }, 2);
    expect(input).toEqual(mods);
  });
});

describe('splitHomeModules', () => {
  const options = { minModules: 4, slots: 2 };

  it('MỘT mục = MỘT chỗ: hero bị loại khỏi lưới, lưới giữ thứ tự khai báo', () => {
    const { heroes, rest } = splitHomeModules(mods, ['d'], {}, options);
    expect(ids(heroes)).toEqual(['d', 'a']);
    expect(ids(rest)).toEqual(['b', 'c', 'e']);
  });

  it('lượt mở KHÔNG xếp lại lưới (chỉ chọn hero) — trí nhớ vị trí của lưới còn dùng được', () => {
    const { rest } = splitHomeModules(mods, [], { e: { count: 9, lastAt: 1 } }, options);
    expect(ids(rest)).toEqual(['b', 'c', 'd']);
  });

  it('ít hơn `minModules` thì không tách tầng: tất cả xuống lưới', () => {
    const { heroes, rest } = splitHomeModules(mods.slice(0, 3), ['b'], {}, options);
    expect(heroes).toEqual([]);
    expect(ids(rest)).toEqual(['a', 'b', 'c']);
  });
});
