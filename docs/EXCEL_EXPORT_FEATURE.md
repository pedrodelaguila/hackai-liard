# Excel Export Feature

The frontend now includes Excel export functionality for both materials lists and markdown tables.

## Features Added

### 1. Materials List Export
- **Location**: When a materials list is displayed in the chat
- **Functionality**: Export button appears in the top-right corner of materials list containers
- **Output**: Creates an Excel file with multiple sheets:
  - **All Materials**: Complete list with Category, Description, Quantity columns
  - **Individual Category Sheets**: Separate sheets for each material category
  - **Totals Sheet**: Summary with quantities per category and grand total

### 2. Markdown Table Export
- **Location**: Automatically detected in any chat message containing markdown tables
- **Functionality**: Small "Excel" button appears in the top-right corner of messages with tables
- **Output**: Creates an Excel file with each markdown table as a separate sheet

## Dependencies Added
- `xlsx`: For Excel file generation and download
- `@types/xlsx`: TypeScript definitions

## File Structure
```
frontend/src/
├── utils/
│   └── excelExport.ts          # Excel export utilities
├── components/
│   └── MarkdownWithExport.tsx  # Markdown component with table export
└── App.tsx                     # Updated to use new export features
```

## Usage

### For Materials Lists
1. Upload a DWG file and request materials extraction
2. When materials list appears, click the green "Export Excel" button
3. Excel file will be automatically downloaded

### For Markdown Tables
1. Ask questions that return data in table format
2. When tables appear in responses, click the small green "Excel" button
3. All tables in that message will be exported to separate sheets

## Excel Output Details

### Materials Export Filename Format
`{MaterialsTitle}_{YYYY-MM-DD}T{HH-mm-ss}.xlsx`

### Table Export Filename Format
`markdown_tables_{YYYY-MM-DD}T{HH-mm-ss}.xlsx`

### Sheet Naming
- Materials: "All Materials", category names, "Totals"
- Tables: "Table_1", "Table_2", etc.

## Error Handling
- User-friendly error messages for export failures
- Console logging for debugging
- Graceful fallback if no tables found in markdown
