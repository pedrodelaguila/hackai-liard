import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportMarkdownTableToExcel, hasMarkdownTables } from '../utils/excelExport';

interface MarkdownWithExportProps {
  content: string;
  className?: string;
}

const MarkdownWithExport: React.FC<MarkdownWithExportProps> = ({ content, className }) => {
  const handleExportTable = () => {
    try {
      exportMarkdownTableToExcel(content);
    } catch (error) {
      console.error('Error exportando tabla a Excel:', error);
      alert('Error exportando tabla a Excel. Por favor inténtalo de nuevo.');
    }
  };

  const hasTables = hasMarkdownTables(content);

  return (
    <div className="relative">
      {hasTables && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={handleExportTable}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs flex items-center gap-1 transition-colors shadow-lg"
            title="Descargar tablas como archivo Excel"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Excel
          </button>
        </div>
      )}
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownWithExport;
