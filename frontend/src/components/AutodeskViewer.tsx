import React, { useEffect, useRef, useState } from 'react';

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

  const getFreshToken = async () => {
    const res = await fetch('/api/aps/token');
    const token = await res.json();
    return token.access_token;
  };

  useEffect(() => {
    if (!urn) return;

    const options = {
      env: 'AutodeskProduction',
      getAccessToken: (onSuccess: (token: string, C: number) => void) => {
        getFreshToken().then(token => {
          onSuccess(token, 3600);
        });
      },
    };

    Autodesk.Viewing.Initializer(options, () => {
      const div = viewerRef.current;
      if (!div) return;

      const viewerInstance = new Autodesk.Viewing.GuiViewer3D(div);
      setViewer(viewerInstance);
      viewerInstance.start();
      
      const documentId = `urn:${urn}`;
      Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

      function onDocumentLoadSuccess(doc: any) {
        const viewables = doc.getRoot().getDefaultGeometry();
        viewerInstance.loadDocumentNode(doc, viewables);
      }

      function onDocumentLoadFailure(viewerErrorCode: any) {
        console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
      }
    });

    return () => {
      if (viewer) {
        viewer.finish();
      }
    };
  }, [urn]);
  
  useEffect(() => {
    if (viewer && viewData) {
      const { region } = viewData;

      const boundingBox = new THREE.Box3(
        new THREE.Vector3(region.minX, region.minY, -10),
        new THREE.Vector3(region.maxX, region.maxY, 10)
      );
      
      viewer.navigation.fitBounds(true, boundingBox);
      
    }
  }, [viewer, viewData]);

  return <div ref={viewerRef} className="w-full h-full" />;
};

export default AutodeskViewer;
