import React, { useState, useRef, useCallback } from 'react';
import './App.css';
import { TopNavbar } from './components/TopNavbar';
import { MessageBubble } from './components/MessageBubble';
import { LoadingMessage } from './components/LoadingMessage';
import { AppLayout } from './components/AppLayout';
import { UploadPrompt } from './components/UploadPrompt';
import { ActionButtons } from './components/ActionButtons';
import { ProcessingMessage } from './components/ProcessingMessage';
import type { ChatMessage, StreamUpdate } from './types';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAppPhases } from './hooks/useAppPhases';
import { useTranslationPolling } from './hooks/useTranslationPolling';
import { useDwgUpload } from './hooks/useDwgUpload';

const BACKEND_URL = 'http://localhost:4000';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dwgFile, setDwgFile] = useState<File | null>(null);
  const [dwgId, setDwgId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [urn, setUrn] = useState<string | null>(null);
  const [dwgViewData, setDwgViewData] = useState<any>(null);
  const [savedBoardName, setSavedBoardName] = useState<string>('');
  const [isProcessingViewer, setIsProcessingViewer] = useState<boolean>(false);
  const [isLargeFile, setIsLargeFile] = useState<boolean>(false);
  const [fileCharacteristics, setFileCharacteristics] = useState<{isLarge: boolean, hasUrn: boolean}>({isLarge: false, hasUrn: false});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { appPhase, viewerReady, moveToProcessing, moveToReady, isUploadPhase, isProcessingPhase } = useAppPhases();
  const handleViewerReady = useCallback(() => {
    setIsProcessingViewer(false);
    moveToReady();
  }, [moveToReady]);

  const { pollTranslationStatus } = useTranslationPolling(handleViewerReady);

  const handleDwgUploadComplete = (dwgId: string, urn?: string) => {
    setDwgId(dwgId);
    moveToProcessing(); // Move to processing phase immediately after upload

    if (urn) {
      setUrn(urn);
      setFileCharacteristics({isLarge: false, hasUrn: true});
      console.log('Starting translation polling for URN:', urn);
      pollTranslationStatus(urn); // This will call moveToReady() when translation completes
    } else {
      console.log('No URN returned, viewer will not be available');
      setFileCharacteristics({isLarge: true, hasUrn: false});
    }
  };

  const { uploadDwg } = useDwgUpload(handleDwgUploadComplete);

  const handleFileUploadFromActions = async (file: File) => {
    // Clear current state when uploading new file
    setMessages([]);
    setStreamingMessage(null);
    setDwgId(null);
    setSessionId(null);
    setUrn(null);
    setDwgViewData(null);
    setSavedBoardName(''); // Reset saved board name

    // Reset processing states
    setIsProcessingViewer(false);
    setIsLargeFile(false);
    setFileCharacteristics({isLarge: false, hasUrn: false});

    await uploadDwg(file);
  };

  const handleBoardNameAccepted = (boardName: string) => {
    // Save the board name
    setSavedBoardName(boardName);

    // Now that user has accepted board name, show appropriate processing messages
    if (fileCharacteristics.isLarge) {
      setIsLargeFile(true);
    } else if (urn && !viewerReady) {
      setIsProcessingViewer(true);
    }
  };

  const handleActionSelect = async (prompt: string, boardName?: string) => {
    // Save board name if provided (from first use or update existing)
    if (boardName) {
      setSavedBoardName(boardName);
    }

    // Add user message immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Force scroll to bottom after adding user message
    setTimeout(() => scrollToBottom(true), 100);
    
    // Send the message
    setIsLoading(true);

    // Initialize streaming message
    const initialStreamingMessage: ChatMessage = {
      role: 'assistant',
      content: 'Inicializando análisis...',
      timestamp: new Date(),
      isStreaming: true,
      roundInfo: { round: 0, status: 'thinking' as const }
    };
    setStreamingMessage(initialStreamingMessage);

    try {
      const formData = new FormData();
      formData.append('message', prompt);
      
      if (dwgId) {
        formData.append('dwgId', dwgId);
      }

      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      // Use the streaming endpoint
      const response = await fetch(`${BACKEND_URL}/chat/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle Server-Sent Events
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const update: StreamUpdate = JSON.parse(line.slice(6));
                handleStreamUpdate(update);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (e) {
                console.warn('Error al procesar actualización:', line);
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Ha ocurrido un error, intenta nuevamente.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
      setStreamingMessage(null);
    }
  };
  
  // Auto-scroll functionality
  const { containerRef, scrollToBottom } = useAutoScroll({
    dependency: messages.length + (streamingMessage ? 1 : 0) + (streamingMessage?.content?.length || 0),
    enabled: true,
    smooth: true
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.dwg')) {
      alert('Por favor selecciona un archivo DWG válido');
      return;
    }

    setDwgFile(file);
  };

  const handleUploadAndStart = async () => {
    if (dwgFile) {
      setIsLoading(true);
      try {
        await uploadDwg(dwgFile);
        setDwgFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Upload failed:', error);
        alert('Error al subir el archivo. Por favor intenta de nuevo.');
      } finally {
        setIsLoading(false);
      }
    }
  };


  const handleStreamUpdate = (update: StreamUpdate) => {
    console.log('Stream update:', update.type, update.data);

    switch (update.type) {
      case 'status':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.message,
          roundInfo: { round: 0, status: 'thinking' as const }
        } : null);
        break;

      case 'dwg_uploaded':
        setDwgId(update.data.dwgId);
        moveToProcessing();

        // Store file characteristics but don't show processing messages yet
        if (update.data.message && update.data.message.includes('large') && update.data.message.includes('MB')) {
          setFileCharacteristics({isLarge: true, hasUrn: false});
        } else {
          setFileCharacteristics({isLarge: false, hasUrn: !!urn});
        }

        setMessages([{
          role: 'assistant',
          content: 'DWG cargado exitosamente. ¿Qué análisis te gustaría realizar?',
          timestamp: new Date()
        }]);
        setStreamingMessage(null);
        break;

      case 'dwg_translation_started':
        setUrn(update.data.urn);
        pollTranslationStatus(update.data.urn);
        break;

      case 'analysis_started':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.message,
        } : null);
        break;

      case 'conversation_started':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.message,
        } : null);
        if (update.data.sessionId) {
          setSessionId(update.data.sessionId);
        }
        break;

      case 'round_started':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: `Ronda ${update.data.round}: DWGAssistant está pensando...`,
          roundInfo: {
            round: update.data.round,
            status: 'thinking' as const
          }
        } : null);
        break;

      case 'round_response':
        // Check if the response content is a dwg_view JSON
        try {
          const contentData = JSON.parse(update.data.text);
          if (contentData.type === 'dwg_view') {
            setDwgViewData(contentData);
            // Don't show the JSON in the chat, just a confirmation
            setStreamingMessage(prev => prev ? {
              ...prev,
              content: (prev.content || '') + '\n\n*Displaying visual context in the viewer.*',
            } : null);
            return;
          }
        } catch (e) {
          // Not a JSON object, treat as regular text
        }
        
        // Filter out internal thinking messages and any remaining JSON
        let filteredText = update.data.text;
        
        // Remove any JSON objects that might have slipped through
        filteredText = filteredText.replace(/\{[\s\S]*?"type":\s*"[^"]*"[\s\S]*?\}/g, '');
        
        // Filter technical errors and replace with user-friendly messages
        if (filteredText.toLowerCase().includes('error:') || filteredText.toLowerCase().includes('failed:') || filteredText.toLowerCase().includes('400') || filteredText.toLowerCase().includes('500')) {
          filteredText = 'Ha ocurrido un error, intenta nuevamente.';
        } else {
          // Filter JQ queries and replace with user-friendly messages
          const jqPatterns = [
            { pattern: /Query execution error[\s\S]*?jq:[\s\S]*?/gi, replacement: '' },
            { pattern: /jq:[\s\S]*?error[\s\S]*?Cannot index[\s\S]*?/gi, replacement: '' },
            { pattern: /Executing query:[\s\S]*?/gi, replacement: 'Buscando información en el dibujo...' },
            { pattern: /Query:[\s\S]*?\./gi, replacement: 'Analizando componentes del tablero...' },
            { pattern: /Query \d+\/\d+[\s\S]*?/gi, replacement: 'Consultando información...' },
            { pattern: /Running query[\s\S]*?/gi, replacement: 'Consultando datos del DWG...' },
            { pattern: /\$\.[\s\S]*?\[[\s\S]*?\][\s\S]*?/gi, replacement: 'Procesando información del tablero...' },
            { pattern: /Consulta \d+ de \d+[\s\S]*?/gi, replacement: 'Analizando datos del archivo...' },
            { pattern: /\[\]$/gm, replacement: '' } // Remove empty array results
          ];
          
          jqPatterns.forEach(({ pattern, replacement }) => {
            filteredText = filteredText.replace(pattern, replacement);
          });
          
          // Filter internal thinking messages
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
            filteredText = filteredText.replace(pattern, '');
          });
        }
        
        // Clean up extra whitespace
        filteredText = filteredText
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .replace(/^\s+|\s+$/gm, '')
          .trim();
        
        // Only update if there's meaningful content after filtering
        if (filteredText) {
          setStreamingMessage(prev => prev ? {
            ...prev,
            content: filteredText,
            roundInfo: {
              round: update.data.round,
              status: update.data.toolCount > 0 ? 'executing' as const : 'completed' as const,
              toolInfo: update.data.toolCount > 0 ? `Preparando ${update.data.toolCount} ${update.data.toolCount === 1 ? 'consulta' : 'consultas'}` : undefined
            }
          } : null);
        }
        break;

      case 'tools_executing':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: prev.content + '\n\n🔍 ' + update.data.message,
          roundInfo: {
            round: update.data.round,
            status: 'executing' as const,
            toolInfo: update.data.message
          }
        } : null);
        break;

      case 'tool_executing':
        setStreamingMessage(prev => prev ? {
          ...prev,
          roundInfo: {
            round: update.data.round,
            status: 'executing' as const,
            toolInfo: update.data.message
          }
        } : null);
        break;

      case 'tool_completed':
        // Just update the tool info, don't change content
        setStreamingMessage(prev => prev ? {
          ...prev,
          roundInfo: {
            round: update.data.round,
            status: 'executing' as const,
            toolInfo: `Consulta ${update.data.toolIndex} completada`
          }
        } : null);
        break;

      case 'round_completed':
        setStreamingMessage(prev => prev ? {
          ...prev,
          roundInfo: {
            round: update.data.round,
            status: 'thinking' as const,
            toolInfo: 'Preparando siguiente ronda...'
          }
        } : null);
        break;

      case 'conversation_finished':
        setStreamingMessage(prev => prev ? {
          ...prev,
          roundInfo: {
            round: update.data.totalRounds,
            status: 'completed' as const,
            totalRounds: update.data.totalRounds,
            toolInfo: `Análisis completado en ${update.data.totalRounds} rondas`
          }
        } : null);
        break;

      case 'materials_extracted':
        console.log('📋 Materials extracted event received:', update.data.materialsData);
        setStreamingMessage(prev => prev ? {
          ...prev,
          materialsData: update.data.materialsData
        } : null);
        break;

      case 'analysis_complete': {
        // Finalize the streaming message and add it to messages
        const finalMessage: ChatMessage = {
          role: 'assistant',
          content: update.data.response,
          materialsData: update.data.materialsData,
          dwgViewData: dwgViewData || undefined,
          timestamp: new Date(),
          isStreaming: false
        };

        console.log('DEBUG: Final budget message content:', finalMessage.content);
        setMessages(prev => [...prev, finalMessage]);
        setStreamingMessage(null);
        setIsLoading(false); // Enable buttons when analysis is complete
        
        // Force scroll to bottom after completing analysis
        setTimeout(() => scrollToBottom(true), 300);

        if (update.data.dwgId) {
          setDwgId(update.data.dwgId);
        }
        if (update.data.sessionId) {
          setSessionId(update.data.sessionId);
        }
        break;
      }

      case 'error': {
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: 'Ha ocurrido un error, intenta nuevamente.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setStreamingMessage(null);
        setIsLoading(false); // Enable buttons on error
        break;
      }
    }
  };



  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Fixed Top Navbar */}
      <div className="flex-shrink-0 z-50">
        <TopNavbar dwgId={dwgId} sessionId={sessionId} />
      </div>

      {/* Processing Message */}
      <ProcessingMessage
        isProcessing={isProcessingViewer}
        isLargeFile={isLargeFile}
      />

      {/* Main content area */}
      <div className="flex-1 min-h-0">
        <AppLayout
          appPhase={appPhase}
          viewerReady={viewerReady}
          urn={urn}
          dwgViewData={dwgViewData}
        >
          <div className="h-full flex flex-col">
            <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {isUploadPhase ? (
                <UploadPrompt
                  onFileUpload={handleFileUpload}
                  fileInputRef={fileInputRef}
                  dwgFile={dwgFile}
                  onUploadAndStart={handleUploadAndStart}
                  isUploading={isLoading}
                />
              ) : !isUploadPhase && messages.length === 0 ? (
                <ActionButtons
                  onActionSelect={handleActionSelect}
                  onFileUpload={handleFileUploadFromActions}
                  onBoardNameAccepted={handleBoardNameAccepted}
                  isLoading={isLoading}
                  dwgId={dwgId}
                  isCompact={false}
                  savedBoardName={savedBoardName}
                />
              ) : (
                <>
                  {messages.map((message, index) => (
                    <MessageBubble key={index} message={message} />
                  ))}
                  {streamingMessage && (
                    <MessageBubble message={streamingMessage} isStreaming />
                  )}
                  {isLoading && <LoadingMessage />}
                </>
              )}
            </div>
          </div>
        </AppLayout>
      </div>

      {/* Fixed Bottom Action Bar - only show if we have a saved board name */}
      {!isUploadPhase && dwgId && !(isProcessingPhase && messages.length === 0) && savedBoardName && (
        <div className="flex-shrink-0 z-50">
          <ActionButtons
            onActionSelect={handleActionSelect}
            onFileUpload={handleFileUploadFromActions}
            isLoading={isLoading}
            dwgId={dwgId}
            isCompact={true}
            savedBoardName={savedBoardName}
          />
        </div>
      )}
    </div>
  );
}

export default App;
