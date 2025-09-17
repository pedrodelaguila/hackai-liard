import React from 'react';
import { SendButton } from './SendButton';

interface InputContainerProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  dwgFile: File | null;
  dwgId: string | null;
  isLoading: boolean;
  onSendMessage: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  currentMessage,
  setCurrentMessage,
  dwgFile,
  dwgId,
  isLoading,
  onSendMessage,
  onKeyDown,
  onFileUpload,
  fileInputRef
}) => {
  return (
    <div className="border-t border-gray-700 bg-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                dwgId
                  ? "Ask me about your DWG file..."
                  : "Upload a DWG file and ask me questions about it..."
              }
              disabled={isLoading}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg resize-none min-h-[40px] max-h-[120px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-white placeholder-gray-400 pr-4 pb-10"
              rows={1}
            />
            <div className="absolute bottom-2 left-2">
              <label className="block">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileUpload}
                  accept=".dwg"
                  className="hidden"
                />
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded cursor-pointer transition-colors border border-gray-500 max-w-[80px]">
                  <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-gray-300 text-xs truncate">
                    {dwgFile ? dwgFile.name.split('.')[0].substring(0, 8) + '...' : 'Upload'}
                  </span>
                </div>
              </label>
            </div>
          </div>
          <SendButton
            onClick={onSendMessage}
            disabled={isLoading || (!currentMessage.trim() && !dwgFile)}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};