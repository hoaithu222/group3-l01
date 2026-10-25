import { prisma } from "../../../infrastructure/database";
import type { IConversationRepository } from "./conversation.repository.interface";
import type { Conversation } from "../entities/conversation.interface";

export class PrismaConversationRepository implements IConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    const row = await prisma.conversation.findUnique({ where: { id } });
    return row as unknown as Conversation | null;
  }

  async findByDirectKey(directKey: string): Promise<Conversation | null> {
    const row = await prisma.conversation.findUnique({ where: { directKey } });
    return row as unknown as Conversation | null;
  }

  async findByMeetingKey(meetingKey: string): Promise<Conversation | null> {
    const row = await prisma.conversation.findUnique({ where: { meetingKey } });
    return row as unknown as Conversation | null;
  }
}
