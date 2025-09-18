import React from 'react';
import { exportMaterialsToExcel } from '../utils/excelExport';

interface MaterialItem {
  category: string;
  description: string;
  quantity: number;
}

interface MaterialsData {
  type: 'materials_list';
  title: string;
  items: MaterialItem[];
}

interface MaterialsListProps {
  materialsData: MaterialsData;
}

export const MaterialsList: React.FC<MaterialsListProps> = ({ materialsData }) => {
  const categories = materialsData.items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MaterialItem[]>);

  const handleExportMaterials = () => {
    try {
      exportMaterialsToExcel(materialsData);
    } catch (error) {
      console.error('Error exportando materiales a Excel:', error);
      alert('Error exportando materiales a Excel. Por favor inténtalo de nuevo.');
    }
  };

  return (
    <div className="bg-gray-700 border border-gray-600 rounded-lg p-6 mt-4 shadow-lg">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-600">
        <h3 className="text-xl font-bold text-red-400">
          {materialsData.title}
        </h3>
        <button
          onClick={handleExportMaterials}
          className="bg-green-600 hover:bg-green-700 ml-4 text-white px-4 py-2 rounded-lg flex items-center gap-2 btn-hover text-sm font-medium"
          title="Descargar como archivo Excel"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Exportar Excel
        </button>
      </div>

      {Object.entries(categories).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h4 className="text-lg font-semibold mb-3 bg-gray-600 text-gray-200 px-3 py-2 rounded">
            {category}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-600">
                  <th className="text-left p-3 font-semibold border-b border-gray-500 text-gray-200">
                    Descripción
                  </th>
                  <th className="text-left p-3 font-semibold border-b border-gray-500 text-gray-200">
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-600 transition-colors">
                    <td className="p-3 border-b border-gray-600 text-gray-200">{item.description}</td>
                    <td className="p-3 border-b border-gray-600 font-medium text-gray-200">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="bg-red-600 text-white p-3 rounded text-center font-bold">
        Total de elementos: {materialsData.items.reduce((sum, item) => sum + item.quantity, 0)}
      </div>
    </div>
  );
};