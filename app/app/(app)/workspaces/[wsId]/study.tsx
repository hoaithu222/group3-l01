import { WorkspaceStudyScreen } from '@/features/study/screens/WorkspaceStudyScreen';

/** "Học" của nhóm (p4-01): bộ WORKSPACE của nhóm + tạo bộ cho nhóm. Nằm trong `[wsId]/` nên `_layout` lo mất quyền. */
export default function WorkspaceStudyRoute() {
  return <WorkspaceStudyScreen />;
}
