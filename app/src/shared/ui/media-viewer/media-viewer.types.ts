/** Một tệp trong `MediaViewer`. */
export interface MediaViewerItem {
  /** Nhãn cho trình đọc màn hình ("Ảnh sơ đồ tầng 3"). Bỏ trống ⇒ "Ảnh N/M" / "Video N/M". */
  accessibilityLabel?: string;
  /** Chiều cao gốc (px) — chưa dùng để dựng bố cục (contain tự tính), giữ để nơi gọi truyền sẵn cho lần tối ưu sau. */
  height?: number;
  type: 'image' | 'video';
  /** URL đọc được ngay (đã ký nếu cần) — ⛔ không lưu URL ký ở đâu lâu dài, chúng hết hạn. */
  uri: string;
  width?: number;
}
