import type { PickedFile } from '@/core/uploads/upload.types';

import { normalizePickedMime, planUploads } from '../utils/upload-plan';

function picked(overrides: Partial<PickedFile> = {}): PickedFile {
  return {
    kind: 'FILE',
    mime: 'application/pdf',
    name: 'a.pdf',
    size: 1000,
    uri: 'file:///a.pdf',
    ...overrides,
  };
}

describe('normalizePickedMime — mã nguồn khai sai MIME', () => {
  it('đuôi thuộc danh sách mã + MIME lạ ⇒ text/plain', () => {
    expect(normalizePickedMime('app.ts', 'video/mp2t')).toBe('text/plain');
    expect(normalizePickedMime('run.sh', 'application/x-sh')).toBe('text/plain');
    expect(normalizePickedMime('main.py', 'application/octet-stream')).toBe('text/plain');
  });

  it('giữ nguyên MIME BE nhận sẵn và mọi đuôi ngoài danh sách', () => {
    expect(normalizePickedMime('a.json', 'application/json')).toBe('application/json');
    expect(normalizePickedMime('a.md', 'text/markdown')).toBe('text/markdown');
    expect(normalizePickedMime('a.exe', 'application/octet-stream')).toBe(
      'application/octet-stream',
    );
    expect(normalizePickedMime('a.pdf', 'application/pdf')).toBe('application/pdf');
  });
});

describe('planUploads', () => {
  it('bỏ tệp rỗng, chuẩn hoá MIME, đổi kind khi MIME đổi', () => {
    const plan = planUploads([
      picked({ name: 'empty.pdf', size: 0 }),
      picked({ mime: 'video/mp2t', name: 'code.ts' }),
      picked({ kind: 'IMAGE', mime: 'image/jpeg', name: 'p.jpg' }),
    ]);
    expect(plan.rejected.map((r) => r.name)).toEqual(['empty.pdf']);
    expect(plan.accepted.map((f) => [f.name, f.mime, f.kind])).toEqual([
      ['code.ts', 'text/plain', 'FILE'],
      ['p.jpg', 'image/jpeg', 'IMAGE'],
    ]);
  });

  it('có ngân sách dung lượng: tệp làm tràn bị loại với câu RSC_007, tệp nhỏ hơn vẫn nhận', () => {
    const plan = planUploads(
      [
        picked({ name: 'big.pdf', size: 900 }),
        picked({ name: 'huge.pdf', size: 900 }),
        picked({ name: 'small.pdf', size: 50 }),
      ],
      1000,
    );
    expect(plan.accepted.map((f) => f.name)).toEqual(['big.pdf', 'small.pdf']);
    expect(plan.rejected).toEqual([
      { name: 'huge.pdf', reason: 'Kho tài liệu của nhóm đã đầy dung lượng' },
    ]);
  });

  it('không biết ngân sách (MEMBER) ⇒ không chặn theo dung lượng, BE quyết', () => {
    expect(planUploads([picked({ size: 10 ** 12 })]).accepted).toHaveLength(1);
  });
});
