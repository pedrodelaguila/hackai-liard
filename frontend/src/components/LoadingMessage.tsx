import React from 'react';

export const LoadingMessage: React.FC = () => {
  return (
    <div className="flex gap-3 animate-fadeIn justify-start">
      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
        <svg className="w-4 h-4 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
      <div className="max-w-3xl bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md border border-gray-700 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-smoothPulse"></div>
          <span className="font-medium">Pensando</span>
          <span className="loading-dots"></span>
        </div>
      </div>
    </div>
  );
};