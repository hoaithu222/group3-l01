/**
 * Cột "Đính kèm" của bảng mục học (p4-01 admin.md §2.1): BE nay ký sẵn THUMBNAIL (≤ 60 s) cho ảnh mặt trước/sau và từng lựa chọn của bộ
 * PUBLIC → admin xem được ảnh. Ảnh chưa có URL (chưa xử lý xong) hoặc không tải được (URL hết hạn) → quay về nhãn "Có ảnh", KHÔNG ô vỡ.
 * Âm thanh chỉ có id → nhãn "Có âm thanh". Mock ở tầng HTTP (MSW).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import StudySetItemsTable from '@/features/moderation/components/targets/StudySetItemsTable';
import type { AdminStudyItem } from '@/features/moderation/types/study-set-moderation.types';
import { studyItemImages } from '@/features/moderation/utils/study-items';

import { okJson, pageMeta, PERM_VIEW, renderRoutes, signIn } from './moderation-fixtures';

const SET_ID = '665f1c2e8a1b2c3d4e5f6b01';
const NOW = '2026-09-21T03:00:00.000Z';

const item = (over: Partial<AdminStudyItem>): AdminStudyItem => ({
  id: 'i-1',
  setId: SET_ID,
  type: 'FLASHCARD',
  prompt: 'Câu hỏi',
  answerText: 'Đáp án',
  options: [],
  correctOptionIds: [],
  acceptedAnswers: [],
  explanation: null,
  frontMediaAssetId: null,
  backMediaAssetId: null,
  audioAssetId: null,
  tags: [],
  order: 0,
  updatedAt: NOW,
  ...over,
});

let items: AdminStudyItem[] = [];
const server = setupServer(
  http.get('*/admin/study-sets/:id/items', () => okJson(items, pageMeta(items.length, 1, 50))),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  items = [];
  signIn(PERM_VIEW);
});

const renderTable = () =>
  renderRoutes([{ path: '/x', element: <StudySetItemsTable setId={SET_ID} /> }], ['/x']);

describe('StudySetItemsTable — thumbnail ảnh', () => {
  it('mặt trước/mặt sau/ảnh lựa chọn có URL ký → hiện <img> với alt nói rõ vị trí', async () => {
    items = [
      item({
        frontMediaAssetId: 'a-front',
        frontMediaThumbUrl: 'https://cdn.test/front.jpg?sig=1',
        backMediaAssetId: 'a-back',
        backMediaThumbUrl: 'https://cdn.test/back.jpg?sig=2',
      }),
      item({
        id: 'i-2',
        order: 1,
        type: 'MULTIPLE_CHOICE',
        prompt: 'Thủ đô của Pháp?',
        answerText: null,
        options: [
          { id: 'o_aaaaaa', text: 'Berlin', mediaAssetId: null, mediaThumbUrl: null },
          { id: 'o_bbbbbb', text: 'Paris', mediaAssetId: 'a-opt', mediaThumbUrl: 'https://cdn.test/paris.jpg?sig=3' },
        ],
        correctOptionIds: ['o_bbbbbb'],
      }),
    ];
    renderTable();

    expect(await screen.findByAltText('Ảnh mặt trước của mục 1')).toHaveAttribute(
      'src',
      'https://cdn.test/front.jpg?sig=1',
    );
    expect(screen.getByAltText('Ảnh mặt sau của mục 1')).toHaveAttribute(
      'src',
      'https://cdn.test/back.jpg?sig=2',
    );
    expect(screen.getByAltText('Ảnh của lựa chọn "Paris" ở mục 2')).toHaveAttribute(
      'src',
      'https://cdn.test/paris.jpg?sig=3',
    );
    // Lựa chọn không có ảnh thì không có ô ảnh nào.
    expect(screen.queryByAltText(/lựa chọn "Berlin"/)).not.toBeInTheDocument();
    expect(screen.queryByText('Có ảnh')).not.toBeInTheDocument();
  });

  it('có asset nhưng chưa có URL (chưa xử lý xong / BE cũ) → nhãn "Có ảnh", không <img>', async () => {
    items = [item({ frontMediaAssetId: 'a-front', frontMediaThumbUrl: null })];
    renderTable();

    expect(await screen.findByText('Có ảnh')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('BE cũ chưa trả trường thumbnail → vẫn hiện nhãn "Có ảnh" (không lỗi)', async () => {
    items = [item({ frontMediaAssetId: 'a-front' })];
    renderTable();

    expect(await screen.findByText('Có ảnh')).toBeInTheDocument();
  });

  it('ảnh không tải được (URL ký hết hạn) → quay về nhãn "Có ảnh"', async () => {
    items = [
      item({ frontMediaAssetId: 'a-front', frontMediaThumbUrl: 'https://cdn.test/expired.jpg?sig=old' }),
    ];
    renderTable();

    fireEvent.error(await screen.findByAltText('Ảnh mặt trước của mục 1'));

    expect(await screen.findByText('Có ảnh')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByAltText('Ảnh mặt trước của mục 1')).not.toBeInTheDocument());
  });

  it('mục không có ảnh/âm thanh → "—"; có âm thanh → nhãn "Có âm thanh"', async () => {
    items = [
      item({ id: 'i-1' }),
      item({ id: 'i-2', order: 1, audioAssetId: 'a-audio', prompt: 'Nghe và chọn' }),
    ];
    renderTable();

    expect(await screen.findByText('Có âm thanh')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('studyItemImages', () => {
  it('chỉ liệt kê chỗ CÓ asset, theo thứ tự trước → sau → lựa chọn', () => {
    const images = studyItemImages(
      item({
        order: 2,
        frontMediaAssetId: 'a1',
        frontMediaThumbUrl: 'u1',
        backMediaAssetId: null,
        options: [
          { id: 'o1', text: 'A', mediaAssetId: 'a2', mediaThumbUrl: 'u2' },
          { id: 'o2', text: 'B', mediaAssetId: null },
        ],
      }),
    );

    expect(images.map((i) => [i.key, i.url])).toEqual([
      ['front', 'u1'],
      ['option-o1', 'u2'],
    ]);
    expect(images[0]!.alt).toBe('Ảnh mặt trước của mục 3');
  });
});
