import React from 'react';
import MarkdownWithExport from './MarkdownWithExport';
import { MaterialsList } from './MaterialsList';
import { useTypewriter } from '../hooks/useTypewriter';

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

// Función para filtrar mensajes internos del AI que no deberían mostrarse al usuario
const filterInternalMessages = (content: string): string => {
  // Filtrar JSON de dwg_view completo
  let filtered = content.replace(/\{[\s\S]*?"type":\s*"dwg_view"[\s\S]*?\}/g, '');
  
  // Filtrar errores técnicos y reemplazar con mensaje amigable
  if (filtered.toLowerCase().includes('error:') || filtered.toLowerCase().includes('failed:') || filtered.toLowerCase().includes('400') || filtered.toLowerCase().includes('500')) {
    // Si contiene información de error técnico, mostrar mensaje amigable
    if (filtered.toLowerCase().includes('prompt is too long') || filtered.toLowerCase().includes('invalid_request_error')) {
      return 'Ha ocurrido un error, intenta nuevamente.';
    }
    // Para otros errores, también mostrar mensaje genérico amigable
    return 'Ha ocurrido un error, intenta nuevamente.';
  }
  
  // Filtrar queries JQ y reemplazar con mensajes amigables
  const jqPatterns = [
    { pattern: /Query execution error[\s\S]*?jq:[\s\S]*?/gi, replacement: '' },
    { pattern: /jq:[\s\S]*?error[\s\S]*?Cannot index[\s\S]*?/gi, replacement: '' },
    { pattern: /Executing query:[\s\S]*?/gi, replacement: 'Buscando información en el dibujo...' },
    { pattern: /Query:[\s\S]*?\./gi, replacement: 'Analizando componentes del tablero...' },
    { pattern: /Query \d+\/\d+[\s\S]*?/gi, replacement: 'Consultando información...' },
    { pattern: /Running query[\s\S]*?/gi, replacement: 'Consultando datos del DWG...' },
    { pattern: /\$\.[\s\S]*?\[[\s\S]*?\][\s\S]*?/gi, replacement: 'Procesando información del tablero...' },
    { pattern: /Consulta \d+ de \d+[\s\S]*?/gi, replacement: 'Analizando datos del archivo...' },
    { pattern: /\[\]$/gm, replacement: '' }, // Remove empty array results
    // Remove any remaining JSON objects that contain materials or items
    { pattern: /\{[\s\S]*?"(type|title|items|category|description|quantity)"[\s\S]*?\}/gi, replacement: '' },
    // Remove JSON arrays 
    { pattern: /\[[\s\S]*?\{[\s\S]*?"(category|description|quantity)"[\s\S]*?\][\s\S]*/gi, replacement: '' }
  ];
  
  jqPatterns.forEach(({ pattern, replacement }) => {
    filtered = filtered.replace(pattern, replacement);
  });
  
  // Filtrar mensajes de pensamiento interno comunes
  const internalPatterns = [
    /Simplificaré la consulta para evitar errores:?/gi,
    /Ahora voy a buscar también elementos.*?:/gi,
    /Ahora voy a analizar también las dimensiones.*?:/gi,
    /Voy a realizar una búsqueda.*?:/gi,
    /Let me.*?:/gi,
    /I'll.*?:/gi,
    /I will.*?:/gi,
    /Ahora procederé a.*?:/gi,
    /Procedemos a.*?:/gi,
    /A continuación.*?:/gi,
    /Primero.*?:/gi
  ];
  
  internalPatterns.forEach(pattern => {
    filtered = filtered.replace(pattern, '');
  });
  
  // Limpiar líneas vacías múltiples y espacios extra
  filtered = filtered
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Múltiples saltos de línea
    .replace(/^\s+|\s+$/gm, '') // Espacios al inicio/final de líneas
    .trim();
    
  return filtered;
};

// Componente para texto con efecto typewriter
const TypewriterText: React.FC<{ content: string; role: string }> = ({ content, role }) => {
  const { displayedText, isTyping } = useTypewriter({
    text: content,
    speed: 25, // Velocidad de escritura en ms
    enabled: true
  });

  return (
    <div className={`prose prose-sm max-w-none ${
      role === 'user' 
        ? 'prose-invert text-white prose-headings:text-white prose-strong:text-white prose-code:text-white prose-pre:bg-white/10 prose-pre:text-white prose-table:border-white/20' 
        : 'text-gray-100 prose-headings:text-gray-200 prose-strong:text-gray-200 prose-code:bg-gray-700 prose-code:text-gray-200 prose-pre:bg-gray-700 prose-pre:text-gray-200 prose-table:border-gray-600'
    }`}>
      <MarkdownWithExport content={displayedText} />
      {isTyping && role === 'assistant' && (
        <span className="inline-block w-1 h-4 bg-blue-400 typewriter-cursor ml-1"></span>
      )}
    </div>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming = false }) => {
  // Log para debug - más detallado
  console.log('🔍 MessageBubble: Rendering message', {
    role: message.role,
    contentLength: message.content?.length,
    hasMaterialsData: !!message.materialsData,
    isStreaming,
    materialsDataStructure: message.materialsData ? {
      type: message.materialsData.type,
      title: message.materialsData.title,
      itemsCount: message.materialsData.items?.length,
      firstItem: message.materialsData.items?.[0]
    } : null
  });
  
  if (message.materialsData) {
    console.log('🎯 MessageBubble: FULL materials data:', JSON.stringify(message.materialsData, null, 2));
  }
  
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
          {(() => {
            // Check if content contains materials JSON that should be extracted
            let extractedMaterialsData = null;
            
            try {
              // First clean up the content to remove malformed fragments
              const cleanContent = message.content
                .replace(/"\s*highlight"\s*:\s*\[\s*\]\s*\}/g, '') // Remove malformed highlight fragments
                .replace(/\{\s*,/g, '{') // Fix malformed JSON starting with comma
                .replace(/,\s*\}/g, '}'); // Fix trailing commas
              
              // Look for materials_list JSON in content - most specific patterns first
              let materialsMatch = cleanContent.match(/\{\s*"type":\s*"materials_list"[\s\S]*?\}/);
              
              // Try to find JSON at the end of the content
              if (!materialsMatch) {
                materialsMatch = cleanContent.match(/\{\s*"type":\s*"materials_list"[\s\S]*?\}\s*$/);
              }
              
              // Look for any JSON with items array and materials structure
              if (!materialsMatch) {
                materialsMatch = cleanContent.match(/\{[\s\S]*?"items":\s*\[\s*\{[\s\S]*?"category"[\s\S]*?\}\s*\][\s\S]*?\}/);
              }
              
              // Try parsing line by line from the end (for cases where JSON is split across lines)
              if (!materialsMatch) {
                const lines = cleanContent.split('\n');
                let jsonStr = '';
                let braceCount = 0;
                let foundStart = false;
                
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i];
                  if (line.includes('"type"') && line.includes('"materials_list"')) {
                    foundStart = true;
                  }
                  if (foundStart) {
                    jsonStr = line + '\n' + jsonStr;
                    for (const char of line) {
                      if (char === '{') braceCount++;
                      if (char === '}') braceCount--;
                    }
                    if (braceCount === 0 && jsonStr.includes('"type"')) {
                      materialsMatch = [jsonStr.trim()];
                      break;
                    }
                  }
                }
              }
              
              if (materialsMatch) {
                let jsonStr = materialsMatch[0].trim();
                
                // Additional cleanup
                jsonStr = jsonStr
                  .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                  .replace(/}\s*{/g, '},{'); // Fix missing commas between objects
                  
                console.log('🔍 Raw materials match found:', jsonStr.substring(0, 200) + '...');
                
                const materialsJSON = JSON.parse(jsonStr);
                console.log('🔍 Parsed materials JSON:', materialsJSON);
                
                // Validate the structure
                if (materialsJSON && 
                    (materialsJSON.type === 'materials_list' || materialsJSON.items) && 
                    Array.isArray(materialsJSON.items) &&
                    materialsJSON.items.length > 0) {
                  
                  // Normalize and validate the structure
                  extractedMaterialsData = {
                    type: 'materials_list' as const,
                    title: materialsJSON.title || 'Lista de Materiales',
                    items: materialsJSON.items.filter((item: MaterialItem) => 
                      item.category && item.description && typeof item.quantity === 'number'
                    )
                  };
                  
                  // Only use if we have valid items
                  if (extractedMaterialsData.items.length > 0) {
                    console.log('🎯 Extracted and normalized materials data:', extractedMaterialsData);
                  } else {
                    extractedMaterialsData = null;
                    console.log('❌ No valid items found in materials data');
                  }
                }
              }
            } catch (error) {
              console.log('❌ Error parsing materials JSON:', error);
              console.log('Content being parsed:', message.content.substring(0, 500) + '...');
            }
            
            // Use materialsData prop or extracted from content
            const materialDataToUse = message.materialsData || extractedMaterialsData;
            
            if (materialDataToUse) {
              console.log('📋 MessageBubble: Rendering with materials data:', materialDataToUse);
              return (
                <>
                  <div className="mb-4">
                    {(() => {
                      let filtered = message.content;
                      
                      // Remove various patterns of materials JSON
                      filtered = filtered
                        .replace(/\{[\s\S]*?"type":\s*"materials_list"[\s\S]*?\}/g, '')
                        .replace(/\{[\s\S]*?"type":\s*"dwg_view"[\s\S]*?\}/g, '')
                        .replace(/\{[\s\S]*?"title":\s*"Materials[\s\S]*?\}/g, '')
                        .replace(/\{[\s\S]*?"items":\s*\[[\s\S]*?"category"[\s\S]*?\]/g, '')
                        .replace(/^\s*\{[\s\S]*?\}\s*$/gm, '') // Remove any standalone JSON objects
                        .trim();
                      
                      const cleanContent = filterInternalMessages(filtered);
                      
                      // Only show content if it has meaningful text after cleaning
                      return cleanContent.length > 20 ? cleanContent : '';
                    })()}
                  </div>
                  <MaterialsList materialsData={materialDataToUse} />
                </>
              );
            }
            
            return (
              // Usar efecto typewriter solo para respuestas del asistente que NO están en streaming
              message.role === 'assistant' && !isStreaming ? (
                <TypewriterText content={filterInternalMessages(message.content)} role={message.role} />
              ) : (
                <div className={`prose prose-sm max-w-none ${
                  message.role === 'user' 
                    ? 'prose-invert text-white prose-headings:text-white prose-strong:text-white prose-code:text-white prose-pre:bg-white/10 prose-pre:text-white prose-table:border-white/20' 
                    : 'text-gray-100 prose-headings:text-gray-200 prose-strong:text-gray-200 prose-code:bg-gray-700 prose-code:text-gray-200 prose-pre:bg-gray-700 prose-pre:text-gray-200 prose-table:border-gray-600'
                }`}>
                  <MarkdownWithExport content={filterInternalMessages(message.content)} />
                </div>
              )
            );
          })()}
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