import type { IconName } from '@/shared/ui/icon';

/** Công cụ của thanh công cụ P0 (app.md §3). `select` là công cụ mặc định; viewer CHỈ có pan/zoom nên không có công cụ nào. */
export type WhiteboardTool =
  'arrow' | 'ellipse' | 'eraser' | 'line' | 'pen' | 'rect' | 'select' | 'sticky' | 'text';

export interface ToolDef {
  icon: IconName;
  id: WhiteboardTool;
  label: string;
}

/**
 * Bộ icon của repo (xuất từ Figma) KHÔNG có icon riêng cho công cụ vẽ — dùng tên gần nhất, và luôn kèm CHỮ dưới icon nên người dùng không phải
 * đoán nghĩa từ hình (cũng là yêu cầu trợ năng: công cụ đang chọn có viền + `accessibilityState.selected`, không chỉ màu).
 */
export const TOOLS: readonly ToolDef[] = [
  { icon: 'navigation-map', id: 'select', label: 'Chọn' },
  { icon: 'edit', id: 'pen', label: 'Bút' },
  { icon: 'add-square', id: 'rect', label: 'Chữ nhật' },
  { icon: 'add-circle', id: 'ellipse', label: 'Elip' },
  { icon: 'minus', id: 'line', label: 'Đường' },
  { icon: 'arrow-right', id: 'arrow', label: 'Mũi tên' },
  { icon: 'keyboard', id: 'text', label: 'Chữ' },
  { icon: 'file-2', id: 'sticky', label: 'Giấy nhớ' },
  { icon: 'clear-rectangle', id: 'eraser', label: 'Tẩy' },
];

/** Công cụ tạo phần tử bằng KÉO (hình/đường/mũi tên). */
export const SHAPE_TOOLS = ['rect', 'ellipse', 'line', 'arrow'] as const;
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export const isShapeTool = (tool: WhiteboardTool): tool is ShapeTool =>
  (SHAPE_TOOLS as readonly WhiteboardTool[]).includes(tool);
