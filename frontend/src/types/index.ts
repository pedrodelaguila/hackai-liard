export interface MaterialItem {
  category: string;
  description: string;
  quantity: number;
}

export interface MaterialsData {
  type: 'materials_list';
  title: string;
  items: MaterialItem[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  materialsData?: MaterialsData;
  timestamp: Date;
  isStreaming?: boolean;
  roundInfo?: {
    round: number;
    totalRounds?: number;
    status: 'thinking' | 'executing' | 'completed';
    toolInfo?: string;
  };
}

export interface StreamUpdate {
  type: string;
  data: any;
}