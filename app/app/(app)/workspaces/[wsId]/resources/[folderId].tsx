import { FileExplorerScreen } from '@/features/resources/screens/FileExplorerScreen';

/** Thư mục con — cùng màn với gốc, `FileExplorerScreen` đọc `folderId` từ tham số. */
export default function ResourcesFolderRoute() {
  return <FileExplorerScreen />;
}
