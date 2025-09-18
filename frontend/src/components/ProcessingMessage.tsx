import React from 'react';

interface ProcessingMessageProps {
  isProcessing: boolean;
  isLargeFile: boolean;
  isViewerReadyButHidden: boolean;
}

// Subcomponent for processing state
const ProcessingViewer: React.FC = () => (
  <div className="flex items-center gap-3">
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
    <div className="text-sm">
      <span className="text-blue-300 font-medium">
        Estamos procesando tu archivo para visualizarlo
      </span>
      <br />
      <span className="text-blue-400/80">
        Mientras tanto, podés empezar a preguntar
      </span>
    </div>
  </div>
);

// Subcomponent for viewer ready but hidden state
const ViewerReady: React.FC = () => (
  <div className="flex items-center gap-3">
    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
    <div className="text-sm">
      <span className="text-green-300 font-medium">
        Tu visualización está lista
      </span>
      <br />
      <span className="text-green-400/80">
        La mostraremos junto a tu primera consulta
      </span>
    </div>
  </div>
);

// Subcomponent for large file notification
const LargeFileNotification: React.FC = () => (
  <div className="flex items-center gap-3">
    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
    <div className="text-sm">
      <span className="text-yellow-300 font-medium">
        Archivo grande detectado
      </span>
      <br />
      <span className="text-yellow-400/80">
        No habrá visualización disponible, pero las consultas funcionan normalmente
      </span>
    </div>
  </div>
);

// Main component
export const ProcessingMessage: React.FC<ProcessingMessageProps> = ({
  isProcessing,
  isLargeFile,
  isViewerReadyButHidden
}) => {
  // Don't show anything if no relevant state is active
  if (!isProcessing && !isViewerReadyButHidden && !isLargeFile) {
    return null;
  }

  return (
    <div className="fixed top-20 left-0 right-0 z-40 flex justify-center">
      <div className="bg-gray-800/90 border border-gray-600/50 rounded-lg px-4 py-3 mx-4 backdrop-blur-sm shadow-lg">
        {isProcessing && <ProcessingViewer />}
        {isViewerReadyButHidden && !isProcessing && <ViewerReady />}
        {isLargeFile && !isProcessing && !isViewerReadyButHidden && <LargeFileNotification />}
      </div>
    </div>
  );
};