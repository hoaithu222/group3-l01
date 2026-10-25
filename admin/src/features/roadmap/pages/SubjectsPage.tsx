import { memo } from 'react';

import { PageBody, PageShell } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

import SubjectsTable from '../components/SubjectsTable';

/** `/roadmap` — danh sách lộ trình (admin.md §2, route `roadmap:view`). Tiêu đề nằm trên THANH HEADER. */
const SubjectsPage = memo(function SubjectsPage() {
  return (
    <PageShell>
      <PageHeader title="Lộ trình học" tone="teal" />
      <PageBody overflow="scroll">
        <SubjectsTable />
      </PageBody>
    </PageShell>
  );
});

export default SubjectsPage;
