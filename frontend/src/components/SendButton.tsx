import React from 'react';

interface SendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
  dwgFile?: File | null;
  dwgId?: string | null;
}

export const SendButton: React.FC<SendButtonProps> = ({ onClick, disabled, isLoading, dwgFile, dwgId }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-4 rounded-lg font-medium btn-hover flex items-center justify-center min-w-[60px] self-center"
    >
      {isLoading ? (
        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : dwgFile && !dwgId ? (
        <span className="text-sm font-medium px-2">Subir</span>
      ) : (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      )}
    </button>
  );
};