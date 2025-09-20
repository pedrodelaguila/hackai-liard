import React from 'react';

interface TopNavbarProps {
  dwgId: string | null;
  sessionId: string | null;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ dwgId, sessionId }) => {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-1 flex justify-between items-center shadow-lg">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center">
          <img src="/liard_logo_png.png" alt="Ícono CAD" className="h-20 w-auto shadow-md rounded-lg" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Planytics</h1>
          <p className="text-sm text-gray-400">Análisis de archivos CAD con IA</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {dwgId && (
          <div className="bg-blue-600/20 border border-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            DWG Cargado
          </div>
        )}
        {sessionId && (
          <div className="bg-green-600/20 border border-green-600/30 text-green-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            Sesión Activa
          </div>
        )}
      </div>
    </div>
  );
};