import { newObjectId } from "../../../core/utils/object-id";
import type { Label, LabelCreateInput, LabelPatch } from "../entities/label.interface";
import type { ILabelRepository } from "./label.repository.interface";

export class InMemoryLabelRepository implements ILabelRepository {
  readonly labels = new Map<string, Label>();

  private nameTaken(boardId: string, normalizedName: string, exceptId?: string): boolean {
    return [...this.labels.values()].some((l) => l.boardId === boardId && l.normalizedName === normalizedName && l.id !== exceptId);
  }

  async findById(id: string): Promise<Label | null> {
    const l = this.labels.get(id);
    return l ? { ...l } : null;
  }

  async listByBoard(boardId: string): Promise<Label[]> {
    return [...this.labels.values()].filter((l) => l.boardId === boardId).map((l) => ({ ...l }));
  }

  async findByBoardAndIds(boardId: string, ids: string[]): Promise<Label[]> {
    return ids.flatMap((id) => {
      const l = this.labels.get(id);
      return l && l.boardId === boardId ? [{ ...l }] : [];
    });
  }

  async countByBoard(boardId: string): Promise<number> {
    return [...this.labels.values()].filter((l) => l.boardId === boardId).length;
  }

  async findByName(boardId: string, normalizedName: string): Promise<Label | null> {
    const l = [...this.labels.values()].find((x) => x.boardId === boardId && x.normalizedName === normalizedName);
    return l ? { ...l } : null;
  }

  async create(input: LabelCreateInput): Promise<Label | null> {
    if (this.nameTaken(input.boardId, input.normalizedName)) return null;
    const label: Label = { id: newObjectId(), ...input, createdAt: new Date() };
    this.labels.set(label.id, label);
    return { ...label };
  }

  async update(id: string, patch: LabelPatch): Promise<Label | null> {
    const l = this.labels.get(id);
    if (!l) return null;
    if (patch.normalizedName !== undefined && this.nameTaken(l.boardId, patch.normalizedName, id)) return null;
    Object.assign(l, {
      ...(patch.name !== undefined && { name: patch.name, normalizedName: patch.normalizedName }),
      ...(patch.color !== undefined && { color: patch.color }),
    });
    return { ...l };
  }

  async delete(id: string): Promise<boolean> {
    return this.labels.delete(id);
  }
}
