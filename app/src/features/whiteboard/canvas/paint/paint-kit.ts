import { Platform } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';

import { resolveElementColor } from '../../constants/palette';
import type { SkFont, SkPaint, SkiaModule } from '../skia-module';
import { estimateMeasure, type MeasureFn } from './text-layout';

const FONT_FAMILY = Platform.select({ default: 'sans-serif', ios: 'Helvetica' });
type Colors = Readonly<Record<ThemeColorKey, string>>;

/**
 * Bộ đồ vẽ dùng lại cho MỌI phần tử: hai `SkPaint` được cấu hình lại mỗi lần (thay vì `Skia.Paint()` mới cho từng phần tử — 2000 phần tử ×
 * mỗi lần dựng lại cảnh là 2000+ đối tượng native), bộ nhớ đệm màu và font theo cỡ. Tạo MỘT lần cho mỗi (module Skia, theme) — đổi
 * sáng/tối là dựng bộ mới (màu là id token, hex tra lại lúc vẽ).
 * ⚠️ `matchFont` dùng font HỆ THỐNG (`sans-serif`/`Helvetica`): chưa nhúng font của app vào Skia (cần `useFonts` + asset) — chữ tiếng Việt có dấu
 * vẫn hiện đúng vì font hệ thống đủ glyph, chỉ khác kiểu chữ so với phần còn lại của app.
 */
export interface PaintKit {
  colors: Colors;
  /** Tô đặc (nền, chữ, chấm). Cấu hình lại mỗi lần gọi — ⛔ đừng giữ tham chiếu qua lần gọi kế. */
  fill: (colorId: string, role: 'fill' | 'stroke') => SkPaint;
  /** Font theo cỡ (đã làm tròn), hoặc `null` khi không có font (Jest, thiết bị lạ). */
  font: (size: number) => SkFont | null;
  /** Đo bề rộng một dòng ở cỡ chữ đã cho; không có font thì xấp xỉ. */
  measure: (fontSize: number) => MeasureFn;
  skia: SkiaModule;
  /** Nét viền/đường; `hex` cho màu thô của lớp phủ (chọn/con trỏ) đã tra từ theme. */
  stroke: (colorId: string, width: number) => SkPaint;
  /** Nét/tô bằng MÃ HEX thô (lớp phủ chọn, con trỏ người khác) — các màu này là token theme, không phải id màu của phần tử. */
  strokeHex: (hex: string, width: number) => SkPaint;
  fillHex: (hex: string) => SkPaint;
}

export function createPaintKit(skia: SkiaModule, colors: Colors): PaintKit {
  const { Skia, PaintStyle, StrokeCap, StrokeJoin } = skia;
  const strokePaint = Skia.Paint();
  strokePaint.setAntiAlias(true);
  strokePaint.setStyle(PaintStyle.Stroke);
  strokePaint.setStrokeCap(StrokeCap.Round);
  strokePaint.setStrokeJoin(StrokeJoin.Round);
  const fillPaint = Skia.Paint();
  fillPaint.setAntiAlias(true);
  fillPaint.setStyle(PaintStyle.Fill);

  const skColors = new Map<string, ReturnType<typeof Skia.Color>>();
  const color = (hex: string) => {
    let value = skColors.get(hex);
    if (!value) {
      value = Skia.Color(hex);
      skColors.set(hex, value);
    }
    return value;
  };
  const fonts = new Map<number, SkFont | null>();
  const font = (size: number): SkFont | null => {
    const key = Math.max(1, Math.round(size));
    if (!fonts.has(key)) {
      const made = skia.matchFont({ fontFamily: FONT_FAMILY, fontSize: key }) as SkFont | null;
      fonts.set(key, made ?? null);
    }
    return fonts.get(key) ?? null;
  };

  const strokeHex = (hex: string, width: number) => {
    strokePaint.setColor(color(hex));
    strokePaint.setStrokeWidth(width);
    return strokePaint;
  };
  const fillHex = (hex: string) => {
    fillPaint.setColor(color(hex));
    return fillPaint;
  };

  return {
    colors,
    fill: (id, role) => fillHex(resolveElementColor(colors, id, role)),
    fillHex,
    font,
    measure: (fontSize) => {
      const f = font(fontSize);
      return f ? (text) => f.getTextWidth(text) : estimateMeasure(fontSize);
    },
    skia,
    stroke: (id, width) => strokeHex(resolveElementColor(colors, id, 'stroke'), width),
    strokeHex,
  };
}
