import React from 'react';
import AutodeskViewer from './AutodeskViewer';
import type { AppPhase } from '../hooks/useAppPhases';

interface AppLayoutProps {
  appPhase: AppPhase;
  viewerReady: boolean;
  urn: string | null;
  dwgViewData: any;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  appPhase,
  viewerReady,
  urn,
  dwgViewData,
  children
}) => {
  const showViewer = appPhase === 'ready' && viewerReady && urn;

  return (
    <div className={`flex-1 flex transition-all duration-1000 ${showViewer ? 'gap-4' : ''}`}>
      <div className={`flex flex-col transition-all duration-1000 ${showViewer ? 'w-1/2' : 'w-full'}`}>
        {children}
      </div>

      {showViewer && (
        <div className="w-1/2 bg-gray-800 rounded-lg overflow-hidden animate-slide-in">
          <AutodeskViewer urn={urn} viewData={dwgViewData} />
        </div>
      )}
    </div>
  );
};