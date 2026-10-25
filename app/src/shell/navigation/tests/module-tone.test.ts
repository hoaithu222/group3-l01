import { MODULE_REGISTRY } from '../module-registry';
import { moduleTone } from '../module-tone';

describe('moduleTone', () => {
  it('mọi phân hệ của registry có tông, và không phân hệ nào dùng tông `danger` (đỏ dành cho phá huỷ/lỗi)', () => {
    for (const module of MODULE_REGISTRY) {
      expect(moduleTone(module.id)).not.toBe('danger');
    }
  });

  it('hai phân hệ đứng cạnh nhau trong registry không trùng tông (lưới trông như MỘT bộ nhưng vẫn phân biệt được)', () => {
    for (let i = 1; i < MODULE_REGISTRY.length; i += 1) {
      const previous = MODULE_REGISTRY[i - 1];
      const current = MODULE_REGISTRY[i];
      if (previous && current) expect(moduleTone(current.id)).not.toBe(moduleTone(previous.id));
    }
  });

  it('phân hệ mới chưa khai tông rơi về một tông ỔN ĐỊNH (cùng id ⇒ cùng tông)', () => {
    expect(moduleTone('phan-he-moi')).toBe(moduleTone('phan-he-moi'));
    expect(['brand', 'info', 'success', 'warning', 'accent']).toContain(moduleTone('phan-he-moi'));
  });
});
