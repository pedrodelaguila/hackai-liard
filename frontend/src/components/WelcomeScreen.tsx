import React, { useState } from 'react';

interface WelcomeScreenProps {
  onActionSelect: (prompt: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onActionSelect }) => {
  const [boardName, setBoardName] = useState('');

  const actions = [
    {
      id: 'materials',
      title: 'Extraer listas de materiales de paneles eléctricos',
      icon: (
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      bgColor: 'bg-blue-600/20',
      hoverColor: 'hover:bg-blue-600/30',
      borderColor: 'border-blue-600/30',
      prompt: (board: string) => `Dame la lista materiales del ${board || 'tablero eléctrico'}.`
    },
    {
      id: 'components',
      title: 'Analizar componentes y estructuras del dibujo',
      icon: (
        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      bgColor: 'bg-green-600/20',
      hoverColor: 'hover:bg-green-600/30',
      borderColor: 'border-green-600/30',
      prompt: (board: string) => `Analiza todos los componentes y estructuras presentes en el ${board || 'tablero eléctrico'} del dibujo DWG. Identifica tipos de componentes, sus conexiones, distribución espacial y características técnicas.`
    },
    {
      id: 'specific',
      title: 'Consultar elementos y especificaciones específicas',
      icon: (
        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      bgColor: 'bg-purple-600/20',
      hoverColor: 'hover:bg-purple-600/30',
      borderColor: 'border-purple-600/30',
      prompt: (board: string) => `Proporciona información detallada sobre elementos específicos del ${board || 'tablero eléctrico'} en el dibujo DWG. Puedo consultar especificaciones, dimensiones, códigos y cualquier detalle técnico que necesites.`
    }
  ];

  const handleActionClick = (action: typeof actions[0]) => {
    const prompt = action.prompt(boardName);
    onActionSelect(prompt);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="text-center max-w-lg px-4 w-full">
        <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 mx-auto">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">¡Bienvenido!</h2>
        <p className="text-gray-400 mb-6">Tu archivo DWG está listo. ¿Qué análisis te gustaría realizar?</p>
        
        <div className="mb-6">
          <p className="text-gray-400 mb-2">Especifica el nombre del tablero o panel que se encuentra en el dibujo, si existe. Esto facilita el análisis.</p>
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
          />
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              className={`flex items-center gap-3 p-4 ${action.bgColor} ${action.hoverColor} border ${action.borderColor} rounded-lg transition-all duration-200 cursor-pointer group text-left`}
            >
              <div className={`w-8 h-8 ${action.bgColor} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                {action.icon}
              </div>
              <span className="text-gray-300 group-hover:text-white transition-colors duration-200">{action.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};