/**
 * Test viewpoint riêng tư của tab `wallet` (p6-04 admin.md §4): admin KHÔNG có
 * API/màn xem khoản chi, số dư từng người, settlement hay tài khoản ngân hàng —
 * chỉ số liệu tổng hợp ẩn danh. Hai lớp chặn:
 *
 *  1. DOM — cho BE "lỡ" trả thừa cả dữ liệu tài chính chi tiết; giao diện chỉ được
 *     in các trường trong hợp đồng, không số tiền chính xác, không danh tính.
 *  2. Mã nguồn — các file ví không được khai trường/hành động nào chạm dữ liệu đó
 *     (không `userId`/`amount`/`balance`, không bảng, không lệnh ghi).
 */
import { screen } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import WorkspaceWalletTab from '@/features/workspace/components/tabs/WorkspaceWalletTab';

import { okBody, renderWithQuery, WALLET_STATS } from './wallet-tab-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Response "vi phạm hợp đồng": kèm đủ thứ mà admin tuyệt đối không được thấy. */
const LEAKY_RESPONSE = {
  ...WALLET_STATS,
  last30d: { ...WALLET_STATS.last30d, totalSpend: 3456789, totalAmount: 3456789 },
  balances: [{ userId: 'u-7f3a', name: 'Nguyễn Văn An', amount: 987654, direction: 'OWES' }],
  expenses: [{ id: 'e-1', amount: 1234567, description: 'Tiệc cuối năm', paidBy: 'u-7f3a' }],
  settlements: [{ id: 's-1', fromId: 'u-1', toId: 'u-2', amount: 456789 }],
  paymentProfile: { bankBin: '970436', accountNumber: '0123456789012', holderName: 'NGUYEN VAN AN' },
};

/** Số tiền dạng đọc được: có dấu phân cách nghìn hoặc kèm đơn vị tiền. */
const EXACT_MONEY = /\d{1,3}(?:[.,]\d{3})+|\d[\d.,]{3,}\s*(?:₫|đ|vnd)/i;

describe('tab wallet — DOM không lộ dữ liệu tài chính chi tiết', () => {
  it('BE lỡ trả thừa số tiền/danh tính ⇒ không chữ nào trong số đó lên màn hình', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(LEAKY_RESPONSE)));
    renderWithQuery(<WorkspaceWalletTab workspaceId="ws-1" />);
    await screen.findByText('Khoảng giá trị');

    const text = document.body.textContent ?? '';
    for (const leaked of [
      'Nguyễn Văn An',
      'NGUYEN VAN AN',
      'Tiệc cuối năm',
      'u-7f3a',
      '0123456789012',
      '970436',
      '987654',
      '987.654',
      '1234567',
      '1.234.567',
      '3456789',
      '3.456.789',
      '456789',
      '456.789',
      'OWES',
    ]) {
      expect(text, `không được in "${leaked}"`).not.toContain(leaked);
    }
    expect(text).not.toMatch(EXACT_MONEY);
  });

  it('không có cột/bảng/danh sách theo người nào', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(LEAKY_RESPONSE)));
    renderWithQuery(<WorkspaceWalletTab workspaceId="ws-1" />);
    await screen.findByText('Khoảng giá trị');

    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.queryAllByRole('list')).toHaveLength(0);
  });

  it('response đúng hợp đồng: chỉ có số đếm nhỏ và nhãn dải, không số tiền chính xác', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderWithQuery(<WorkspaceWalletTab workspaceId="ws-1" />);
    await screen.findByText('Khoảng giá trị');

    expect(screen.getByText('2 – 10 triệu ₫')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(EXACT_MONEY);
  });
});

// Đọc mã nguồn ở dạng chuỗi (không dùng `fs`: tsconfig.app không nạp type của Node).
const WALLET_SOURCES = import.meta.glob('../../../src/features/workspace/**/*[Ww]allet*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const entries = Object.entries(WALLET_SOURCES).map(([path, raw]) => [path, stripComments(raw)] as const);
const inFile = (suffix: string) => entries.filter(([path]) => path.endsWith(suffix));

describe('tab wallet — mã nguồn không chạm dữ liệu tài chính chi tiết', () => {
  it('quét được đủ các file ví (không quét rỗng)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(9);
  });

  it('không file ví nào khai trường về người dùng/số tiền/số dư/tài khoản ngân hàng', () => {
    const forbidden =
      /\b(userId|userIds|payerId|paidBy|amount|amountMinor|balance|balances|totalSpend|totalAmount|bankAccount|accountNumber|bankBin)\b/;
    const offenders = entries.filter(([, code]) => forbidden.test(code)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('không dùng bảng để liệt kê dữ liệu ví', () => {
    const offenders = entries.filter(([, code]) => /\bTable\b/.test(code)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('các khối hiển thị (panel) không nhập nút/ô nhập/công tắc/hộp thoại nào', () => {
    const panels = [
      ...inFile('WalletStatusPanel.tsx'),
      ...inFile('WalletMetricsPanel.tsx'),
      ...inFile('WalletSpendBandPanel.tsx'),
    ];
    expect(panels).toHaveLength(3);
    const action = /\b(Button|Toggle|Input|Dropdown|Menu|Modal|ConfirmDialog|ConfirmWithReasonModal)\b/;
    expect(panels.filter(([, code]) => action.test(code)).map(([path]) => path)).toEqual([]);
  });

  it('service ví chỉ đọc (GET), không có lệnh ghi', () => {
    const service = inFile('workspace-wallet.service.ts');
    expect(service).toHaveLength(1);
    expect(service[0][1]).toMatch(/apiClient\.get\b/);
    expect(service[0][1]).not.toMatch(/apiClient\.(post|put|patch|delete)\b/);
  });
});
