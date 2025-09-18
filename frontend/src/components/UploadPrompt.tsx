import React from 'react';

interface UploadPromptProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dwgFile: File | null;
  onUploadAndStart: () => void;
  isUploading?: boolean;
}

export const UploadPrompt: React.FC<UploadPromptProps> = ({
  onFileUpload,
  fileInputRef,
  dwgFile,
  onUploadAndStart,
  isUploading = false
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full shadow-lg border border-gray-700">
        <div className="mb-6">
          <svg className="w-16 h-16 text-blue-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-xl font-semibold text-white mb-2">Bienvenido al Asistente DWG</h2>
          <p className="text-gray-400 text-sm">Para comenzar a chatear, primero sube un archivo DWG</p>
        </div>

        <div className="space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileUpload}
            accept=".dwg"
            className="hidden"
            id="dwg-file-input"
          />
          <label
            htmlFor="dwg-file-input"
            className="block w-full p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors duration-200 font-medium"
          >
            {dwgFile ? 'Archivo Seleccionado' : 'Seleccionar Archivo DWG'}
          </label>

          {dwgFile && (
            <div className="bg-green-900/30 border border-green-600 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-400">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-sm">Archivo seleccionado:</span>
              </div>
              <p className="text-green-300 text-sm mt-1">{dwgFile.name}</p>
              <button
                onClick={onUploadAndStart}
                disabled={isUploading}
                className="w-full mt-3 p-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200"
              >
                {isUploading ? 'Subiendo...' : 'Subir e iniciar consultas'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};