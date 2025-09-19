import React, { useState, useRef } from 'react';

interface ActionButtonsProps {
  onActionSelect: (prompt: string, boardName?: string) => void;
  onFileUpload: (file: File) => Promise<void>;
  onBoardNameAccepted?: (boardName: string) => void;
  isLoading: boolean;
  dwgId?: string | null;
  isCompact?: boolean;
  savedBoardName?: string;
}

const actions = [
  {
    id: 'materials',
    title: 'Extraer materiales',
    fullTitle: 'Extraer listas de materiales de paneles eléctricos',
    icon: (
      <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    bgColor: 'bg-yellow-600/20',
    hoverColor: 'hover:bg-yellow-600/30',
    borderColor: 'border-yellow-600/30',
    prompt: (board: string) => `Dame la lista de materiales del ${board}.`
  },
  {
    id: 'components',
    title: 'Armar presupuesto',
    fullTitle: 'Crear presupuesto basado en lista de materiales',
    icon: (
      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bgColor: 'bg-green-600/20',
    hoverColor: 'hover:bg-green-600/30',
    borderColor: 'border-green-600/30',
    prompt: (board: string) => `Crea un presupuesto detallado en formato tabla markdown para los materiales del ${board}. Si ya tienes una lista de materiales previa de este tablero, úsala. Si no, extrae primero la lista. Incluye precios en pesos argentinos, subtotales y mano de obra.`
  },
  {
    id: 'specific',
    title: 'Consulta específica',
    fullTitle: 'Hacer consulta personalizada sobre el DWG',
    icon: (
      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    bgColor: 'bg-purple-600/20',
    hoverColor: 'hover:bg-purple-600/30',
    borderColor: 'border-purple-600/30',
    prompt: (board: string, customQuery?: string) => customQuery || `Proporciona información detallada sobre elementos específicos del ${board} en el dibujo DWG. Puedo consultar especificaciones, dimensiones, códigos y cualquier detalle técnico que necesites.`,
    requiresInput: true
  }
];

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onActionSelect,
  onFileUpload,
  onBoardNameAccepted,
  isLoading,
  dwgId,
  isCompact = false,
  savedBoardName = ''
}) => {
  const [boardName, setBoardName] = useState('');
  const [isAccepted, setIsAccepted] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAcceptBoardName = () => {
    if (boardName.trim()) {
      setIsAccepted(true);
      // Notify parent component that board name was accepted
      onBoardNameAccepted?.(boardName.trim());
    }
  };

  const handleActionClick = (action: typeof actions[0]) => {
    // In compact mode, use savedBoardName or prompt for it
    const boardToUse = isCompact ? savedBoardName : boardName;

    if (!isCompact && (!isAccepted || !boardName.trim())) return;
    if (isCompact && !boardToUse.trim()) {
      alert('Por favor especifica primero el nombre del tablero usando el modo completo.');
      return;
    }
    
    // Handle custom input requirement
    if (action.requiresInput) {
      setShowCustomInput(true);
      return;
    }
    
    const prompt = action.prompt(boardToUse);
    // Always pass boardToUse so it gets saved, except when in compact mode and we already have a saved name
    onActionSelect(prompt, !isCompact ? boardToUse : undefined);
  };

  const handleCustomSubmit = () => {
    if (!customQuery.trim()) return;
    
    const boardToUse = isCompact ? savedBoardName : boardName;
    const specificAction = actions.find(a => a.id === 'specific');
    if (specificAction) {
      const prompt = specificAction.prompt(boardToUse, customQuery);
      onActionSelect(prompt, !isCompact ? boardToUse : undefined);
    }
    setShowCustomInput(false);
    setCustomQuery('');
  };

  const handleHelpToggle = () => {
    setShowHelp(!showHelp);
  };

  const handleFileUploadClick = () => {
    if (dwgId) {
      setShowReplaceConfirm(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.dwg')) {
      alert('Por favor selecciona un archivo DWG válido');
      return;
    }

    setIsUploading(true);
    try {
      await onFileUpload(file);
      setShowReplaceConfirm(false);
      // Reset board name and acceptance when uploading new file
      setBoardName('');
      setIsAccepted(false);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Error al subir el archivo. Por favor intenta de nuevo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const confirmReplace = () => {
    fileInputRef.current?.click();
  };

  const cancelReplace = () => {
    setShowReplaceConfirm(false);
  };

  if (isCompact) {
    return (
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        {savedBoardName && (
          <div className="text-center mb-3">
            <span className="text-xs text-gray-400">Consultando: </span>
            <span className="text-sm text-blue-400 font-medium">{savedBoardName}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 justify-center max-w-4xl mx-auto">
          <button
            onClick={handleHelpToggle}
            disabled={isLoading || isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-gray-300">Ayuda</span>
          </button>

          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              disabled={isLoading || isUploading}
              className={`flex items-center gap-2 px-4 py-2 ${action.bgColor} ${action.hoverColor} border ${action.borderColor} rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm`}
            >
              {action.icon}
              <span className="text-gray-300">{action.title}</span>
            </button>
          ))}
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".dwg"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <button
            onClick={handleFileUploadClick}
            disabled={isLoading || isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-600/30 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-gray-300">{isUploading ? 'Subiendo...' : 'Nuevo DWG'}</span>
          </button>
        </div>

        {/* Replace confirmation modal */}
        {showReplaceConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Reemplazar archivo DWG</h3>
              <p className="text-gray-300 mb-6">¿Estás seguro que quieres subir un nuevo archivo DWG? Esto reemplazará el archivo actual y reiniciará la sesión.</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmReplace}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Sí, reemplazar
                </button>
                <button
                  onClick={cancelReplace}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help modal */}
        {showHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Guía de funciones</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Extraer materiales</p>
                    <p className="text-gray-400">Obtiene lista completa de componentes y materiales del tablero eléctrico</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Armar presupuesto</p>
                    <p className="text-gray-400">Crea presupuesto completo con precios estimados en pesos argentinos</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Consulta específica</p>
                    <p className="text-gray-400">Permite hacer preguntas personalizadas sobre el dibujo DWG</p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleHelpToggle}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Custom input modal */}
        {showCustomInput && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Consulta específica</h3>
              <p className="text-gray-300 mb-4 text-sm">¿Qué información específica necesitas del DWG?</p>
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="ej. ¿Cuáles son las especificaciones de las térmicas de 25A?"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customQuery.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Consultar
                </button>
                <button
                  onClick={() => {setShowCustomInput(false); setCustomQuery('');}}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay when uploading */}
        {isUploading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-white">Subiendo archivo DWG...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="text-center max-w-lg px-4 w-full mt-16">
        <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 mx-auto">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">¡Bienvenido!</h2>
        {isAccepted ? <p className="text-gray-400 mb-6">Tu archivo DWG está listo. ¿Qué análisis te gustaría realizar?</p> : <p className="text-gray-400 mb-6">Si el tablero o panel que se encuentra en el dibujo tiene nombre, puedes especificar uno. Esto facilita el análisis, particularmente si el archivo tiene múltiples tableros.</p>}
        
        {!isAccepted ? (
          <div className="mb-6 space-y-4">
            <div>
              <label htmlFor="board-name" className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Nombre del tablero o panel
              </label>
              <input
                id="board-name"
                type="text"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="ej. Tablero Principal TP-01, Panel de Control PC-02"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isUploading}
              />
            </div>
            <button
              onClick={handleAcceptBoardName}
              disabled={!boardName.trim() || isUploading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-colors duration-200"
            >
              Continuar con análisis
            </button>

            <div className="mt-4 text-center">
              <p className="text-sm text-gray-400 mb-2">¿El archivo tiene un solo tablero?</p>
              <button
                onClick={() => {
                  setBoardName("Tablero único del archivo");
                  setIsAccepted(true);
                  onBoardNameAccepted?.("Tablero único del archivo");
                }}
                disabled={isUploading}
                className="text-blue-500 hover:text-white hover:underline text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Omitir
              </button>
            </div>
          </div>
        ) : (
          <>
            {boardName !== "Tablero único del archivo" && (
              <div className="mb-6 p-3 bg-green-900/30 border border-green-600 rounded-lg">
                <p className="text-green-400 text-sm">
                  <strong>Tablero seleccionado:</strong> {boardName}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 text-sm">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  disabled={isLoading || isUploading}
                  className={`flex items-center gap-3 p-4 ${action.bgColor} ${action.hoverColor} border ${action.borderColor} rounded-lg transition-all duration-200 cursor-pointer group text-left disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-8 h-8 ${action.bgColor} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    {action.icon}
                  </div>
                  <span className="text-gray-300 group-hover:text-white transition-colors duration-200">{action.fullTitle}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Help modal */}
        {showHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Guía de funciones</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-yellow-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Extraer materiales</p>
                    <p className="text-gray-400">Obtiene lista completa de componentes y materiales del tablero eléctrico</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Armar presupuesto</p>
                    <p className="text-gray-400">Crea presupuesto completo con precios estimados en pesos argentinos</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Consulta específica</p>
                    <p className="text-gray-400">Permite hacer preguntas personalizadas sobre el dibujo DWG</p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleHelpToggle}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Custom input modal */}
        {showCustomInput && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Consulta específica</h3>
              <p className="text-gray-300 mb-4 text-sm">¿Qué información específica necesitas del DWG?</p>
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="ej. ¿Cuáles son las especificaciones de las térmicas de 25A?"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customQuery.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Consultar
                </button>
                <button
                  onClick={() => {setShowCustomInput(false); setCustomQuery('');}}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay when uploading */}
        {isUploading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 text-center border border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-white">Subiendo archivo DWG...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};