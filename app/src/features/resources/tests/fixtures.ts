import type { FolderDto, ResourceDto } from '../api';

/** Dữ liệu giả dùng chung cho test của feature `resources`. */
export function makeResource(overrides: Partial<ResourceDto> = {}): ResourceDto {
  return {
    id: 'res-1',
    workspaceId: 'ws-1',
    folderId: null,
    name: 'Slide tuần 1.pdf',
    extension: 'pdf',
    type: 'PDF',
    language: null,
    mime: 'application/pdf',
    size: 2048,
    description: null,
    tags: [],
    previewStatus: 'NATIVE',
    thumbnailUrl: null,
    uploadedBy: { id: 'user-1', name: 'Nguyễn An', avatarUrl: null },
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    version: 1,
    deletedAt: null,
    canModify: true,
    ...overrides,
  };
}

export function makeFolder(overrides: Partial<FolderDto> = {}): FolderDto {
  return {
    id: 'fld-1',
    workspaceId: 'ws-1',
    parentId: null,
    name: 'Giáo trình',
    depth: 1,
    createdBy: 'user-1',
    createdAt: '2026-09-09T08:00:00.000Z',
    updatedAt: '2026-09-09T08:00:00.000Z',
    version: 1,
    deletedAt: null,
    canModify: true,
    ...overrides,
  };
}
