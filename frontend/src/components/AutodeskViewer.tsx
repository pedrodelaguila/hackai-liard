import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

declare global {
  const Autodesk: any;
}

interface DwgViewRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface HighlightElement {
  type: 'rectangle';
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  color?: string;
}

interface DwgViewData {
  type: 'dwg_view';
  region: DwgViewRegion;
  highlight?: HighlightElement[];
}

interface AutodeskViewerProps {
  urn: string | null;
  viewData: DwgViewData | null;
}

const AutodeskViewer: React.FC<AutodeskViewerProps> = ({ urn, viewData }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<any>(null);
  const [translationStatus, setTranslationStatus] = useState<string | null>(null);
  const [translationProgress, setTranslationProgress] = useState<string | null>(null);

  const getFreshToken = async () => {
    const res = await fetch('/api/aps/token');
    const token = await res.json();
    return token.access_token;
  };

  const checkTranslationStatus = async (urn: string): Promise<{ status: string; progress: string }> => {
    const res = await fetch(`/api/aps/status/${urn}`);
    const statusData = await res.json();
    return statusData;
  };

  const waitForTranslationComplete = async (urn: string): Promise<boolean> => {
    const maxAttempts = 60; // 5 minutes max (60 * 5 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const { status, progress } = await checkTranslationStatus(urn);
        console.log(`[AutodeskViewer] Translation status: ${status}, progress: ${progress}`);
        
        setTranslationStatus(status);
        setTranslationProgress(progress);

        if (status === 'success') {
          console.log('[AutodeskViewer] Translation completed successfully!');
          return true;
        } else if (status === 'failed') {
          console.error('[AutodeskViewer] Translation failed');
          return false;
        }
        
        // Still in progress, wait and try again
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
      } catch (error) {
        console.error('[AutodeskViewer] Error checking translation status:', error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.error('[AutodeskViewer] Translation timeout');
    return false;
  };

  useEffect(() => {
    if (!urn) {
      console.log('[AutodeskViewer] No URN provided');
      return;
    }

    console.log('[AutodeskViewer] Initializing with URN:', urn);

    // Check if Autodesk Viewer scripts are loaded
    if (typeof Autodesk === 'undefined') {
      console.error('[AutodeskViewer] Autodesk Viewer scripts not loaded');
      return;
    }

    const initializeViewer = async () => {
      // First, wait for translation to complete
      console.log('[AutodeskViewer] Checking translation status...');
      const translationComplete = await waitForTranslationComplete(urn);
      
      if (!translationComplete) {
        console.error('[AutodeskViewer] Translation failed or timed out');
        setTranslationStatus('failed');
        return;
      }

      // Translation is complete, proceed with viewer initialization
      const options = {
        env: 'AutodeskProduction',
        getAccessToken: (onSuccess: (token: string, expires: number) => void) => {
          console.log('[AutodeskViewer] Fetching access token...');
          getFreshToken()
            .then(token => {
              console.log('[AutodeskViewer] Token obtained successfully');
              onSuccess(token, 3600);
            })
            .catch(error => {
              console.error('[AutodeskViewer] Failed to get token:', error);
            });
        },
      };

      console.log('[AutodeskViewer] Starting Autodesk.Viewing.Initializer...');
      Autodesk.Viewing.Initializer(options, () => {
        console.log('[AutodeskViewer] Initializer callback called');
        const div = viewerRef.current;
        if (!div) {
          console.error('[AutodeskViewer] Viewer div ref is null');
          return;
        }

        console.log('[AutodeskViewer] Creating GuiViewer3D instance...');
        const viewerInstance = new Autodesk.Viewing.GuiViewer3D(div);
        setViewer(viewerInstance);
        
        console.log('[AutodeskViewer] Starting viewer...');
        viewerInstance.start();
        
        const documentId = `urn:${urn}`;
        console.log('[AutodeskViewer] Loading document:', documentId);
        Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

        function onDocumentLoadSuccess(doc: any) {
          console.log('[AutodeskViewer] Document loaded successfully');
          const viewables = doc.getRoot().getDefaultGeometry();
          if (viewables) {
            console.log('[AutodeskViewer] Loading document node...');
            viewerInstance.loadDocumentNode(doc, viewables);
          } else {
            console.error('[AutodeskViewer] No viewables found in document');
          }
        }

        function onDocumentLoadFailure(viewerErrorCode: any) {
          console.error('[AutodeskViewer] Document load failed - errorCode:', viewerErrorCode);
        }
      }, (error: any) => {
        console.error('[AutodeskViewer] Initializer failed:', error);
      });
    };

    initializeViewer();

    return () => {
      if (viewer) {
        console.log('[AutodeskViewer] Cleaning up viewer');
        viewer.finish();
      }
    };
  }, [urn]);
  
  useEffect(() => {
    if (viewer && viewData) {
      console.log('[AutodeskViewer] Applying view data:', viewData);
      const { region } = viewData;

      const boundingBox = new THREE.Box3(
        new THREE.Vector3(region.minX, region.minY, -10),
        new THREE.Vector3(region.maxX, region.maxY, 10)
      );
      
      viewer.navigation.fitBounds(true, boundingBox);
    }
  }, [viewer, viewData]);

  return (
    <div className="w-full h-full relative">
      <div ref={viewerRef} className="w-full h-full" />
      
      {/* Translation status overlay */}
      {translationStatus && translationStatus !== 'success' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
          <div className="text-center p-6 bg-white rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Processing DWG File
            </h3>
            <p className="text-gray-600 mb-2">
              Status: <span className="font-medium">{translationStatus}</span>
            </p>
            {translationProgress && (
              <p className="text-gray-600">
                Progress: <span className="font-medium">{translationProgress}</span>
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              This may take a few minutes...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutodeskViewer;
