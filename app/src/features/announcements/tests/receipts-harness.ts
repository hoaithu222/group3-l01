import { announcementsService } from '../api/announcements.service';
import type { ReceiptStatus } from '../api/announcements.types';
import { makeReceipt, receiptsPage } from './fixtures';

/**
 * Dữ liệu + hàm "server giả" chung cho các test của `AnnouncementReceiptsScreen` (tách hai file để mỗi file dưới trần 200
 * dòng). Dùng ĐÚNG khi file test đã `jest.mock('../api/announcements.service', …)` với `listReceipts`.
 */
export const CONFIRMED = [
  makeReceipt('An', { confirmedAt: '2026-09-25T03:30:00.000Z' }),
  makeReceipt('Bình', { confirmedAt: '2026-09-25T04:00:00.000Z' }),
];
export const PENDING = [makeReceipt('Chi'), makeReceipt('Dũng', { name: null })];

export const mockedReceipts = () => jest.mocked(announcementsService.listReceipts);

/** Mỗi tab một trang cố định; tab không khai báo → ném lỗi (test gọi nhầm tab thì đỏ ngay). */
export function serveReceipts(
  pages: Partial<Record<ReceiptStatus, ReturnType<typeof receiptsPage>>>,
) {
  mockedReceipts().mockImplementation(async (_messageId, params) => {
    const page = pages[params.status];
    if (!page) throw new Error(`không có dữ liệu cho tab ${params.status}`);
    return page;
  });
}

/** Mặc định: 12/40 đã xác nhận — tab "đã xác nhận" có An, Bình; tab "chưa xác nhận" có Chi, Dũng. */
export const serveDefaultReceipts = () =>
  serveReceipts({ confirmed: receiptsPage(CONFIRMED), pending: receiptsPage(PENDING) });
