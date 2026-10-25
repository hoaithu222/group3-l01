export interface Label {
  id: string;
  boardId: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  /** Khoá token màu (`LABEL_COLOR_TOKENS`), không hex tự do. */
  color: string;
  createdAt: Date;
}

export interface LabelCreateInput {
  boardId: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  color: string;
}

export interface LabelPatch {
  name?: string;
  normalizedName?: string;
  color?: string;
}
