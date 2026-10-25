import { prisma } from "../../../infrastructure/database";
import type { IConversationMemberRepository } from "./conversation-member.repository.interface";
import type { ConversationMember } from "../entities/conversation.interface";

export class PrismaConversationMemberRepository implements IConversationMemberRepository {
  async findByConversationAndUser(conversationId: string, userId: string): Promise<ConversationMember | null> {
    const row = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return row as unknown as ConversationMember | null;
  }

  async listActiveByConversation(conversationId: string): Promise<ConversationMember[]> {
    const rows = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE" },
    });
    return rows as unknown as ConversationMember[];
  }
}
