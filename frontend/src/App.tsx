import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { TopNavbar } from './components/TopNavbar';
import { MessageBubble } from './components/MessageBubble';
import { LoadingMessage } from './components/LoadingMessage';
import { InputContainer } from './components/InputContainer';
import { AppLayout } from './components/AppLayout';
import { UploadPrompt } from './components/UploadPrompt';
import type { ChatMessage, StreamUpdate } from './types';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useAppPhases } from './hooks/useAppPhases';
import { useTranslationPolling } from './hooks/useTranslationPolling';
import { useDwgUpload } from './hooks/useDwgUpload';

const BACKEND_URL = 'http://localhost:4000';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [dwgFile, setDwgFile] = useState<File | null>(null);
  const [dwgId, setDwgId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [urn, setUrn] = useState<string | null>(null);
  const [dwgViewData, setDwgViewData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { appPhase, viewerReady, moveToProcessing, moveToReady, isUploadPhase } = useAppPhases();
  const { pollTranslationStatus } = useTranslationPolling(moveToReady);

  const handleDwgUploadComplete = (dwgId: string, urn?: string) => {
    setDwgId(dwgId);
    moveToProcessing(); // Move to processing phase immediately after upload

    if (urn) {
      setUrn(urn);
      console.log('Starting translation polling for URN:', urn);
      pollTranslationStatus(urn); // This will call moveToReady() when translation completes
    } else {
      console.log('No URN returned, viewer will not be available');
    }
  };

  const { uploadDwg } = useDwgUpload(handleDwgUploadComplete);
  
  // Auto-scroll functionality
  const { containerRef, scrollToBottom } = useAutoScroll({
    dependency: messages.length + (streamingMessage ? 1 : 0),
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

  const sendMessage = async () => {
    if (isUploadPhase && !dwgFile) return;
    if (!isUploadPhase && !currentMessage.trim() && !dwgFile) return;

    // Only add user message if we're not in upload phase (where we just upload without message)
    if (!isUploadPhase) {
      const userMessage: ChatMessage = {
        role: 'user',
        content: currentMessage || (dwgFile ? `Uploaded file: ${dwgFile.name}` : ''),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
    }
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

      // Only append message if we have one and we're not in upload phase
      if (!isUploadPhase && currentMessage.trim()) {
        formData.append('message', currentMessage);
      } else if (isUploadPhase) {
        // Default message for upload phase
        formData.append('message', 'Archivo DWG subido. ¿Qué información necesitas sobre este dibujo?');
      }

      if (dwgFile) {
        formData.append('dwg', dwgFile);
      } else if (dwgId) {
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

      setCurrentMessage('');
      setDwgFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Lo siento, hubo un error procesando tu solicitud. Por favor inténtalo de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamingMessage(null);
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
        setMessages([{
          role: 'assistant',
          content: 'DWG uploaded! Preparing viewer... You can ask questions now.',
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
        
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.text,
          roundInfo: {
            round: update.data.round,
            status: update.data.toolCount > 0 ? 'executing' as const : 'completed' as const,
            toolInfo: update.data.toolCount > 0 ? `Preparando ${update.data.toolCount} ${update.data.toolCount === 1 ? 'consulta' : 'consultas'}` : undefined
          }
        } : null);
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
        setMessages(prev => [...prev, finalMessage]);
        setStreamingMessage(null);

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
          content: `Error: ${update.data.error}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setStreamingMessage(null);
        break;
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // Auto-scroll cuando el usuario empiece a escribir
  useEffect(() => {
    if (currentMessage.trim()) {
      scrollToBottom();
    }
  }, [currentMessage, scrollToBottom]);

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      <TopNavbar dwgId={dwgId} sessionId={sessionId} />
      <AppLayout
        appPhase={appPhase}
        viewerReady={viewerReady}
        urn={urn}
        dwgViewData={dwgViewData}
      >
        <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
          {isUploadPhase ? (
            <UploadPrompt
              onFileUpload={handleFileUpload}
              fileInputRef={fileInputRef}
              dwgFile={dwgFile}
              onUploadAndStart={handleUploadAndStart}
              isUploading={isLoading}
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
        {!isUploadPhase && (
          <InputContainer
            currentMessage={currentMessage}
            setCurrentMessage={setCurrentMessage}
            dwgFile={dwgFile}
            dwgId={dwgId}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onKeyDown={handleKeyDown}
            onFileUpload={handleFileUpload}
            fileInputRef={fileInputRef}
            disabled={false}
          />
        )}
      </AppLayout>
    </div>
  );
}

export default App;
