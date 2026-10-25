import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Form, FormActions, PageBody, PageShell, useZodForm } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

import SubjectFormFields from '../components/SubjectFormFields';
import { subjectFormSchema, type SubjectFormValues } from '../schemas/subject.schema';
import { newRoadmapIdempotencyKey } from '../service/roadmap.service';
import { useCreateSubject } from '../service/roadmap.queries';
import { emptySubjectValues, toCreateSubjectPayload } from '../utils/subject-form.utils';

/** `/roadmap/subjects/new` (admin.md §2, route `roadmap:create`) — trang riêng, KHÔNG phải modal. */
const SubjectCreatePage = memo(function SubjectCreatePage() {
  const navigate = useNavigate();
  const form = useZodForm<SubjectFormValues>(subjectFormSchema, { defaultValues: emptySubjectValues() });
  const create = useCreateSubject();
  // Trang mount MỚI mỗi lần vào route này → khoá idempotency đủ ổn định qua các lần thử lại trong 1 lượt tạo.
  const [idempotencyKey] = useState(newRoadmapIdempotencyKey);

  const handleSubmit = async (values: SubjectFormValues) => {
    const res = await create.mutateAsync(toCreateSubjectPayload(values, idempotencyKey));
    navigate(`/roadmap/subjects/${res.data.id}`);
  };

  return (
    <PageShell>
      <PageHeader
        backHref="/roadmap"
        backLabel="Về danh sách lộ trình"
        title="Tạo lộ trình"
        tone="teal"
        onBack={() => navigate('/roadmap')}
      />
      <PageBody overflow="scroll">
        <div className="mx-auto w-full max-w-2xl">
          <Form dirtyGuard form={form} onSubmit={handleSubmit}>
            <SubjectFormFields isEditing={false} />
            <FormActions>
              <Button loading={create.isPending} type="submit" variant="primary">
                Tạo lộ trình
              </Button>
            </FormActions>
          </Form>
        </div>
      </PageBody>
    </PageShell>
  );
});

export default SubjectCreatePage;
