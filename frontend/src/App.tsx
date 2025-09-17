import React, { useState, useRef } from 'react';
import './App.css';
import { TopNavbar } from './components/TopNavbar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageBubble } from './components/MessageBubble';
import { LoadingMessage } from './components/LoadingMessage';
import { InputContainer } from './components/InputContainer';
import type { ChatMessage, StreamUpdate } from './types';

const BACKEND_URL = 'http://localhost:4000';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [dwgFile, setDwgFile] = useState<File | null>(null);
  const [dwgId, setDwgId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.dwg')) {
      setDwgFile(file);
    } else {
      alert('Please select a valid DWG file');
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() && !dwgFile) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: currentMessage || (dwgFile ? `Uploaded file: ${dwgFile.name}` : ''),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Initialize streaming message
    const initialStreamingMessage: ChatMessage = {
      role: 'assistant',
      content: 'Initializing analysis...',
      timestamp: new Date(),
      isStreaming: true,
      roundInfo: { round: 0, status: 'thinking' as const }
    };
    setStreamingMessage(initialStreamingMessage);

    try {
      const formData = new FormData();
      formData.append('message', currentMessage);

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
                console.warn('Failed to parse stream update:', line);
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
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
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
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.message,
        } : null);
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
          content: `Round ${update.data.round}: Claude is thinking...`,
          roundInfo: {
            round: update.data.round,
            status: 'thinking' as const
          }
        } : null);
        break;

      case 'round_response':
        setStreamingMessage(prev => prev ? {
          ...prev,
          content: update.data.text,
          roundInfo: {
            round: update.data.round,
            status: update.data.toolCount > 0 ? 'executing' as const : 'completed' as const,
            toolInfo: update.data.toolCount > 0 ? `Preparing ${update.data.toolCount} ${update.data.toolCount === 1 ? 'query' : 'queries'}` : undefined
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
            toolInfo: `Query ${update.data.toolIndex} completed`
          }
        } : null);
        break;

      case 'round_completed':
        setStreamingMessage(prev => prev ? {
          ...prev,
          roundInfo: {
            round: update.data.round,
            status: 'thinking' as const,
            toolInfo: 'Preparing next round...'
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
            toolInfo: `Analysis completed in ${update.data.totalRounds} rounds`
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

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      <TopNavbar dwgId={dwgId} sessionId={sessionId} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
          {messages.length === 0 && <WelcomeScreen />}
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}
          {streamingMessage && (
            <MessageBubble message={streamingMessage} isStreaming />
          )}
          {isLoading && <LoadingMessage />}
        </div>
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
        />
      </div>
    </div>
  );
}

export default App;
