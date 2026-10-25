/**
 * @file drop.utils.ts
 * @description Đọc nội dung kéo-thả qua FileSystemEntry API để phân biệt
 * thư mục vs tệp (dataTransfer.files không phân biệt được) + đọc đệ quy file
 * trong thư mục, gắn `webkitRelativePath` theo fullPath để dựng cây.
 */

const fileFromEntry = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject));

const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    // readEntries trả theo batch → lặp tới khi rỗng.
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });

/** Bỏ dấu "/" đầu của `fullPath` để khớp dạng `webkitRelativePath`. */
const toRelativePath = (fullPath: string): string => fullPath.replace(/^\//, '');

/**
 * Đệ quy gom File + đường dẫn THƯ MỤC trong 1 entry.
 *
 * Ghi lại cả thư mục (không chỉ file) vì thư mục RỖNG không sinh ra File nào —
 * chỉ dựa vào `webkitRelativePath` của file thì nó biến mất hoàn toàn khỏi cây,
 * người dùng kéo lên mà không thấy đâu.
 */
const collectEntries = async (
  entry: FileSystemEntry,
  files: File[],
  folderPaths: string[],
): Promise<void> => {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    Object.defineProperty(file, 'webkitRelativePath', {
      value: toRelativePath(entry.fullPath),
      configurable: true,
    });
    files.push(file);
    return;
  }

  if (!entry.isDirectory) return;

  folderPaths.push(toRelativePath(entry.fullPath));
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries = await readAllEntries(reader);
  for (const child of entries) await collectEntries(child, files, folderPaths);
};

export interface DropReadResult {
  /** Mọi file (đã gắn webkitRelativePath) bên trong các thư mục được thả. */
  files: File[];
  /**
   * Đường dẫn MỌI thư mục gặp phải, KỂ CẢ thư mục rỗng và thư mục chỉ chứa
   * thư mục con. Dùng để dựng cây đầy đủ thay vì suy ngược từ đường dẫn file.
   */
  folderPaths: string[];
  /** Có item cấp gốc là FILE (không phải thư mục) không. */
  hasRootFile: boolean;
}

/**
 * Đọc DataTransfer khi drop. PHẢI trích entry NGAY (đồng bộ) trước mọi await vì
 * DataTransferItemList hết hiệu lực sau event. Trả files bên trong thư mục +
 * cờ có file lẻ ở cấp gốc (để caller chặn kéo-thả tệp).
 */
export const readDirectoryDrop = async (dt: DataTransfer): Promise<DropReadResult> => {
  const entries = Array.from(dt.items)
    .map((it) => it.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => !!e);

  const hasRootFile = entries.some((e) => e.isFile);
  const files: File[] = [];
  const folderPaths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) await collectEntries(entry, files, folderPaths);
  }
  return { files, folderPaths, hasRootFile };
};
