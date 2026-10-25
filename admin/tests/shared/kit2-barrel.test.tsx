/**
 * Kiểm barrel kit2 sau khi gom component theo nhóm chức năng.
 *
 * Mục đích KHÔNG phải test hành vi từng component — mà bắt lỗi barrel trỏ sai
 * đường sau mỗi lần đổi cấu trúc thư mục. Đây đúng là lỗi đã xảy ra khi tách
 * base: 12 barrel nhóm sinh tự động, vài cái trỏ nhầm file.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Badge,
  Button,
  Callout,
  CopyableText,
  Heading,
  HudCorners,
  Input,
  MODAL_OVERLAY_CLASS,
  modalStyles,
  POPUP_ITEM_CLASS,
  POPUP_ITEM_ICON_CLASS,
  Spinner,
  Text,
} from '@/shared/ui';

describe('barrel @/shared/ui', () => {
  it('xuất được component của mọi nhóm chính', () => {
    for (const C of [Button, Text, Heading, Badge, Input, Spinner, Callout]) {
      expect(C).toBeDefined();
    }
  });

  it('Button render ra nút bấm được', () => {
    render(<Button variant="primary">Lưu</Button>);
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
  });

  it('Text nhận token cỡ chữ của hệ thống', () => {
    render(<Text size="small">nội dung</Text>);
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });

  it('xuất HudCorners và CopyableText — hai thứ feature từng phải import sâu / chép tay', () => {
    expect(HudCorners).toBeDefined();
    expect(CopyableText).toBeDefined();
  });

  it('xuất token bề mặt nổi cho widget (CommandPalette mượn qua barrel, không import sâu)', () => {
    expect(MODAL_OVERLAY_CLASS).toBeTruthy();
    expect(POPUP_ITEM_CLASS).toBeTruthy();
    expect(POPUP_ITEM_ICON_CLASS).toBeTruthy();
    // `texture` là slot trang trí mà CommandPalette mượn — phải ra chuỗi class thật.
    expect(modalStyles({ frame: 'default' }).texture({ frame: 'default' })).toEqual(
      expect.any(String),
    );
  });

  it('Badge render nhãn trạng thái', () => {
    render(<Badge color="success">Hoạt động</Badge>);
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
  });
});
