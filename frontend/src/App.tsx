import React, { useState, useRef } from 'react';
import './App.css';

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

interface StreamUpdate {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
 }

const BACKEND_URL = 'http://localhost:4000';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [dwgFile, setDwgFile] = useState<File | null>(null);
  const [dwgId, setDwgId] = useState<string | null>(null);
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

      case 'analysis_complete':
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
        break;

      case 'error':
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Error: ${update.data.error}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setStreamingMessage(null);
        break;
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const renderMaterialsList = (materialsData: MaterialsData) => {
    const categories = materialsData.items.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, MaterialItem[]>);

    return (
      <div className="bg-white border-2 border-red-500 rounded-lg p-6 mt-4 shadow-lg">
        <h3 className="text-red-600 text-xl font-bold mb-4 pb-2 border-b-2 border-red-500">
          {materialsData.title}
        </h3>

        {Object.entries(categories).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h4 className="text-slate-700 text-lg font-semibold mb-3 bg-gray-100 px-3 py-2 rounded">
              {category}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 font-semibold text-gray-700 border-b border-gray-200">
                      Descripción
                    </th>
                    <th className="text-left p-3 font-semibold text-gray-700 border-b border-gray-200">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 border-b border-gray-100">{item.description}</td>
                      <td className="p-3 border-b border-gray-100 font-medium">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="bg-red-500 text-white p-3 rounded text-center font-bold">
          Total items: {materialsData.items.reduce((sum, item) => sum + item.quantity, 0)}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-md px-8 py-4 flex justify-between items-center shadow-lg">
        <h1 className="text-white text-2xl font-semibold flex items-center gap-2">
          <img src="/cad_icon.png" alt="CAD Icon" className="w-8 h-8 inline-block align-middle" />
          DWG Analysis Assistant
        </h1>
        {dwgId && (
          <div className="bg-white/20 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
            <span className="text-lg">📋</span>
            DWG Loaded (ID: {dwgId.substring(0, 8)}...)
          </div>
        )}
      </div>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col p-8 gap-8 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4 bg-white/90 rounded-2xl shadow-xl">
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <h2 className="text-gray-800 text-xl mb-4">Welcome to the DWG Analysis Assistant!</h2>
              <p className="mb-4">Upload a DWG file and ask me questions about it. I can help you:</p>
              <ul className="text-left max-w-md mx-auto space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                  Extract materials lists from electrical panels
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Analyze drawing components
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                  Query specific elements
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                  Identify circuits and specifications
                </li>
              </ul>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`flex flex-col gap-2 p-4 rounded-xl max-w-4xl animate-fadeIn ${
              message.role === 'user'
                ? 'self-end bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                : 'self-start bg-gray-50 border text-gray-800'
            }`}>
              <div className="flex justify-between items-center text-sm opacity-75">
                <span className="font-medium">
                  {message.role === 'user' ? '👤 You' : '🤖 Assistant'}
                </span>
                <span className="text-xs">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="leading-relaxed">
                {message.materialsData ? (
                  <>
                    <div className="mb-4">
                      {message.content.replace(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/, '').trim()}
                    </div>
                    {renderMaterialsList(message.materialsData)}
                  </>
                ) : (
                  <div>
                    {message.content.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {streamingMessage && (
            <div className="self-start bg-blue-50 border-2 border-blue-200 text-gray-800 p-4 rounded-xl max-w-4xl">
              <div className="flex justify-between items-center text-sm opacity-75 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">🤖 Assistant</span>
                  {streamingMessage.roundInfo && (
                    <span className="bg-blue-100 px-2 py-1 rounded-full text-xs">
                      {streamingMessage.roundInfo.status === 'thinking' && '🤔 Thinking'}
                      {streamingMessage.roundInfo.status === 'executing' && '⚡ Querying'}
                      {streamingMessage.roundInfo.status === 'completed' && '✅ Complete'}
                      {streamingMessage.roundInfo.round > 0 && ` - Round ${streamingMessage.roundInfo.round}`}
                      {streamingMessage.roundInfo.totalRounds && `/${streamingMessage.roundInfo.totalRounds}`}
                    </span>
                  )}
                </div>
                <span className="text-xs">
                  {streamingMessage.timestamp.toLocaleTimeString()}
                </span>
              </div>
              
              {streamingMessage.roundInfo?.toolInfo && (
                <div className="bg-blue-100 p-2 rounded text-sm mb-3 text-blue-800">
                  🔍 {streamingMessage.roundInfo.toolInfo}
                </div>
              )}
              
              <div className="leading-relaxed">
                {streamingMessage.materialsData ? (
                  <>
                    <div className="mb-4">
                      {streamingMessage.content.replace(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/, '').trim()}
                    </div>
                    {renderMaterialsList(streamingMessage.materialsData)}
                  </>
                ) : (
                  <div>
                    {streamingMessage.content.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">{line}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-600">Claude is analyzing...</span>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="self-start bg-gray-50 border text-gray-800 p-4 rounded-xl max-w-4xl">
              <div className="flex justify-between items-center text-sm opacity-75 mb-2">
                <span className="font-medium">🤖 Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Thinking</span>
                <span className="loading-dots"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Container */}
        <div className="bg-white/90 rounded-2xl p-6 shadow-xl">
          <div className="mb-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".dwg"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {dwgFile && (
              <span className="text-gray-600 text-sm font-medium mt-2 inline-block">
                📎 {dwgFile.name}
              </span>
            )}
          </div>

          <div className="flex gap-4 items-end">
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                dwgId
                  ? "Ask me about your DWG file..."
                  : "Upload a DWG file and ask me questions about it..."
              }
              disabled={isLoading}
              className="flex-1 p-4 border-2 border-gray-200 rounded-xl resize-none min-h-[60px] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || (!currentMessage.trim() && !dwgFile)}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-8 py-4 rounded-xl font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
