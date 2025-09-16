interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  dwgId?: string;
  toolCalls?: Array<{
    name: string;
    query: string;
    result: string;
  }>;
}

interface ConversationSession {
  sessionId: string;
  dwgId: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage for conversation history
const conversationStore = new Map<string, ConversationSession>();

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new conversation session
export function createConversationSession(dwgId: string): string {
  const sessionId = generateSessionId();
  const session: ConversationSession = {
    sessionId,
    dwgId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  conversationStore.set(sessionId, session);
  console.log(`📝 Created new conversation session: ${sessionId} for DWG: ${dwgId}`);
  return sessionId;
}

// Add a message to conversation history
export function addMessageToHistory(
  sessionId: string, 
  role: 'user' | 'assistant', 
  content: string,
  toolCalls?: Array<{ name: string; query: string; result: string }>
): void {
  const session = conversationStore.get(sessionId);
  if (!session) {
    console.warn(`⚠️  Session ${sessionId} not found, cannot add message`);
    return;
  }

  const message: ConversationMessage = {
    role,
    content,
    timestamp: new Date(),
    dwgId: session.dwgId,
    toolCalls
  };

  session.messages.push(message);
  session.updatedAt = new Date();
  
  console.log(`💬 Added ${role} message to session ${sessionId}: "${content.substring(0, 100)}..."`);
}

// Get conversation history for a session
export function getConversationHistory(sessionId: string): ConversationMessage[] {
  const session = conversationStore.get(sessionId);
  if (!session) {
    console.warn(`⚠️  Session ${sessionId} not found`);
    return [];
  }
  
  return session.messages;
}

// Get conversation session info
export function getConversationSession(sessionId: string): ConversationSession | undefined {
  return conversationStore.get(sessionId);
}

// Get all sessions for a DWG
export function getSessionsForDwg(dwgId: string): ConversationSession[] {
  return Array.from(conversationStore.values()).filter(session => session.dwgId === dwgId);
}

// Build context string from conversation history
export function buildContextFromHistory(sessionId: string, maxMessages: number = 10): string {
  const history = getConversationHistory(sessionId);
  
  if (history.length === 0) {
    return "";
  }

  // Take the most recent messages
  const recentMessages = history.slice(-maxMessages);
  
  let context = "## Conversation History\n\n";
  context += "Here is your previous conversation history with the user about this DWG file:\n\n";
  
  recentMessages.forEach((message, index) => {
    const timeStr = message.timestamp.toLocaleString();
    context += `**${message.role === 'user' ? 'User' : 'Assistant'}** (${timeStr}):\n`;
    context += `${message.content}\n`;
    
    // Add tool calls if present
    if (message.toolCalls && message.toolCalls.length > 0) {
      context += `\n*Tool calls made:*\n`;
      message.toolCalls.forEach(tool => {
        context += `- Query: \`${tool.query}\`\n`;
        context += `  Result: ${tool.result.substring(0, 200)}${tool.result.length > 200 ? '...' : ''}\n`;
      });
    }
    
    context += "\n---\n\n";
  });
  
  context += "Use this context to provide relevant, informed responses that build upon the previous conversation. ";
  context += "Reference previous findings and maintain consistency with earlier analysis.\n\n";
  
  return context;
}

// Clean up old sessions (optional - for memory management)
export function cleanupOldSessions(maxAgeHours: number = 24): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [sessionId, session] of conversationStore.entries()) {
    if (session.updatedAt < cutoff) {
      conversationStore.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} old conversation sessions`);
  }
  
  return cleaned;
}

// Export store for debugging/admin purposes
export function getAllSessions(): ConversationSession[] {
  return Array.from(conversationStore.values());
}

// Get session stats
export function getSessionStats() {
  const sessions = Array.from(conversationStore.values());
  const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
  const activeDwgs = new Set(sessions.map(s => s.dwgId)).size;
  
  return {
    totalSessions: sessions.length,
    totalMessages,
    activeDwgs,
    oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt.getTime())) : null,
    newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.updatedAt.getTime())) : null
  };
}