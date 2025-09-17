import * as XLSX from 'xlsx';

export interface MaterialItem {
  category: string;
  description: string;
  quantity: number;
}

export interface MaterialsData {
  type: 'materials_list';
  title: string;
  items: MaterialItem[];
}

// Export materials list to Excel
export const exportMaterialsToExcel = (materialsData: MaterialsData) => {
  // Group materials by category
  const categories = materialsData.items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MaterialItem[]>);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Create summary sheet
  const summaryData = [
    ['Category', 'Description', 'Quantity'],
    ...materialsData.items.map(item => [item.category, item.description, item.quantity])
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'All Materials');

  // Create individual category sheets
  Object.entries(categories).forEach(([category, items]) => {
    const categoryData = [
      ['Description', 'Quantity'],
      ...items.map(item => [item.description, item.quantity])
    ];

    const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
    // Sanitize sheet name (Excel has restrictions)
    const sanitizedCategory = category.replace(/[\\\/\?\*\[\]]/g, '_').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, categorySheet, sanitizedCategory);
  });

  // Add totals sheet
  const totalsData = [
    ['Category', 'Total Quantity'],
    ...Object.entries(categories).map(([category, items]) => [
      category,
      items.reduce((sum, item) => sum + item.quantity, 0)
    ]),
    ['', ''],
    ['GRAND TOTAL', materialsData.items.reduce((sum, item) => sum + item.quantity, 0)]
  ];

  const totalsSheet = XLSX.utils.aoa_to_sheet(totalsData);
  XLSX.utils.book_append_sheet(wb, totalsSheet, 'Totals');

  // Generate filename
  const sanitizedTitle = materialsData.title.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const filename = `${sanitizedTitle}_${timestamp}.xlsx`;

  // Save file
  XLSX.writeFile(wb, filename);
};

// Parse markdown table and export to Excel
export const exportMarkdownTableToExcel = (markdownContent: string, filename?: string) => {
  // Extract tables from markdown
  const tableRegex = /\|(.+)\|[\r\n]+\|(.+)\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g;
  const tables: string[][][] = [];
  
  let match;
  while ((match = tableRegex.exec(markdownContent)) !== null) {
    const headerRow = match[1].split('|').map(cell => cell.trim());
    const rows = match[3]
      .split('\n')
      .filter(line => line.trim() && line.includes('|'))
      .map(line => 
        line.split('|')
          .slice(1, -1) // Remove empty first and last elements
          .map(cell => cell.trim())
      );
    
    if (headerRow.length > 0 && rows.length > 0) {
      tables.push([headerRow, ...rows]);
    }
  }

  if (tables.length === 0) {
    alert('No tables found in the markdown content');
    return;
  }

  // Create workbook
  const wb = XLSX.utils.book_new();

  tables.forEach((tableData, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(tableData);
    const sheetName = `Table_${index + 1}`;
    XLSX.utils.book_append_sheet(wb, worksheet, sheetName);
  });

  // Generate filename
  const defaultFilename = `markdown_tables_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
  const finalFilename = filename || defaultFilename;

  // Save file
  XLSX.writeFile(wb, finalFilename);
};

// Check if content contains markdown tables
export const hasMarkdownTables = (content: string): boolean => {
  const tableRegex = /\|(.+)\|[\r\n]+\|(.+)\|[\r\n]+((?:\|.+\|[\r\n]*)+)/;
  return tableRegex.test(content);
};
