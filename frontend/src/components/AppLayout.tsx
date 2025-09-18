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
    <div className="h-full flex">
      {/* Chat side - scrollable */}
      <div className={`flex flex-col transition-all duration-1000 ${showViewer ? 'w-1/2' : 'w-full'}`}>
        {children}
      </div>

      {/* Viewer side - fixed, no scroll */}
      {showViewer && (
        <div className="w-1/2 h-full bg-gray-800 animate-slide-in flex-shrink-0 ml-4 mr-4 mb-4 mt-4 rounded-lg overflow-hidden">
          <div className="w-full h-full">
            <AutodeskViewer urn={urn} viewData={dwgViewData} />
          </div>
        </div>
      )}
    </div>
  );
};