import React from 'react';
import MarkdownWithExport from './MarkdownWithExport';
import { MaterialsList } from './MaterialsList';

interface MaterialItem {
  category: string;
  description: string;
  quantity: number;
}

interface MaterialsData {
  type: 'materials_list';
  title: string;
  items: MaterialItem[];
}

interface ChatMessage {
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

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming = false }) => {
  return (
    <div className={`flex gap-3 animate-fadeIn ${
      message.role === 'user' ? 'justify-end' : 'justify-start'
    }`}>
      {message.role === 'assistant' && (
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
          {isStreaming ? (
            <svg className="w-4 h-4 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          )}
        </div>
      )}
      <div className={`max-w-3xl ${
        message.role === 'user'
          ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
          : `bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md border ${
              isStreaming ? 'border-blue-500/30' : 'border-gray-700'
            }`
      } px-4 py-3 shadow-lg`}>
        <div className="flex justify-between items-center text-xs opacity-75 mb-2">
          <span className="font-medium">
            {message.role === 'user' ? 'Tú' : 'Asistente'}
          </span>
          <span>
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>

        {message.roundInfo && isStreaming && (
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs">
              {message.roundInfo.status === 'thinking' && '🤔 Pensando'}
              {message.roundInfo.status === 'executing' && '⚡ Consultando'}
              {message.roundInfo.status === 'completed' && '✅ Completado'}
              {message.roundInfo.round > 0 && ` - Round ${message.roundInfo.round}`}
              {message.roundInfo.totalRounds && `/${message.roundInfo.totalRounds}`}
            </span>
          </div>
        )}

        {message.roundInfo?.toolInfo && isStreaming && (
          <div className="bg-blue-600 p-2 rounded text-sm mb-3 text-white">
            🔍 {message.roundInfo.toolInfo}
          </div>
        )}

        <div className="leading-relaxed">
          {message.materialsData ? (
            <>
              <div className="mb-4">
                {message.content.replace(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/, '').trim()}
              </div>
              <MaterialsList materialsData={message.materialsData} />
            </>
          ) : (
            <div className={`prose prose-sm max-w-none ${
              message.role === 'user' 
                ? 'prose-invert text-white prose-headings:text-white prose-strong:text-white prose-code:text-white prose-pre:bg-white/10 prose-pre:text-white prose-table:border-white/20' 
                : 'text-gray-100 prose-headings:text-gray-200 prose-strong:text-gray-200 prose-code:bg-gray-700 prose-code:text-gray-200 prose-pre:bg-gray-700 prose-pre:text-gray-200 prose-table:border-gray-600'
            }`}>
              <MarkdownWithExport content={message.content} />
            </div>
          )}
        </div>

        {isStreaming && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-500/30">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-xs text-blue-300">DWGAssistant está analizando...</span>
          </div>
        )}
      </div>
      {message.role === 'user' && (
        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
    </div>
  );
};