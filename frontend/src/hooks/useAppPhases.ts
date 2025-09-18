import { useState, useCallback } from 'react';

export type AppPhase = 'upload' | 'processing' | 'ready';

export const useAppPhases = () => {
  const [appPhase, setAppPhase] = useState<AppPhase>('upload');
  const [viewerReady, setViewerReady] = useState(false);

  const moveToProcessing = useCallback(() => {
    setAppPhase('processing');
  }, []);

  const moveToReady = useCallback(() => {
    setAppPhase('ready');
    setViewerReady(true);
  }, []);

  return {
    appPhase,
    viewerReady,
    moveToProcessing,
    moveToReady,
    isUploadPhase: appPhase === 'upload',
    isProcessingPhase: appPhase === 'processing',
    isReadyPhase: appPhase === 'ready'
  };
};