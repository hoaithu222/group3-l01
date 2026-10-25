import { readScoped, writeScoped } from '@/core/storage';

import { STROKE_WIDTHS, WB_PALETTE } from '../constants/palette';
import { parseCamera, type Camera } from '../engine';
import { DEFAULT_STYLE, type ToolStyle } from './whiteboard-ui.store';

/**
 * Tuỳ chọn cá nhân lưu cục bộ — qua kho `AsyncStorage` THEO NGƯỜI DÙNG (`u:<userId>:…`, `core/storage/session-scoped-storage.ts`): đăng xuất/đổi
 * tài khoản thì `wipeUserData()` xoá sạch bằng `removeAllForUser`, feature này KHÔNG phải tự dọn (và không ghi `AsyncStorage` trực tiếp nên không
 * phải khai thêm vào `PERSISTENCE_POLICY`). Không có server: viewport cá nhân không cần đồng bộ (README §2 "Viewport cá nhân").
 */
const STYLE_NAME = 'wb.style';
const viewportName = (wbId: string): string => `wb.viewport.${wbId}`;

const isWidth = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 12;

/** Đọc kiểu vẽ gần nhất; dữ liệu hỏng/lạ (id màu không có trong bảng màu…) rơi về mặc định TỪNG TRƯỜNG, không ném. */
export function parseStyle(raw: unknown): ToolStyle {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_STYLE;
  const { fill, fontSize, stroke, width } = raw as Record<string, unknown>;
  const known = (id: unknown): id is string => WB_PALETTE.some((entry) => entry.id === id);
  return {
    fill: fill === null || known(fill) ? (fill ?? null) : DEFAULT_STYLE.fill,
    fontSize:
      typeof fontSize === 'number' && fontSize >= 12 && fontSize <= 96
        ? fontSize
        : DEFAULT_STYLE.fontSize,
    stroke: known(stroke) ? stroke : DEFAULT_STYLE.stroke,
    width: isWidth(width) ? width : (STROKE_WIDTHS[0] ?? DEFAULT_STYLE.width),
  };
}

export async function loadStyle(userId: string | undefined): Promise<ToolStyle> {
  return parseStyle(await readScoped<unknown>(userId, STYLE_NAME));
}

export function saveStyle(userId: string | undefined, style: ToolStyle): void {
  void writeScoped(userId, STYLE_NAME, style);
}

/** Camera đã lưu của bảng này, hoặc `null` (chưa có/hỏng — `parseCamera` của engine kiểm hữu hạn và kẹp zoom). */
export async function loadViewport(
  userId: string | undefined,
  wbId: string,
): Promise<Camera | null> {
  return parseCamera(await readScoped<unknown>(userId, viewportName(wbId)));
}

export function saveViewport(userId: string | undefined, wbId: string, camera: Camera): void {
  void writeScoped(userId, viewportName(wbId), camera);
}
