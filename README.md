# DWG Analysis Agentic System

A comprehensive agentic system for analyzing DWG files and extracting materials lists from electrical panels. The system consists of three main components working together to provide an interactive AI-powered interface for DWG analysis.

## System Architecture

```
Frontend (React + Tailwind)
    ↓ HTTP + File Upload
Backend (Node.js + Claude SDK)
    ↓ MCP Protocol
DWG Parser (MCP Server + LibreDWG)
```

## Components

### 1. DWG Parser (`/dwg-parser`)
- **Purpose**: MCP server that parses DWG files and provides jq query capabilities
- **Technology**: Node.js, TypeScript, LibreDWG, MCP SDK
- **Features**:
  - Parses DWG files into JSON format
  - Stores parsed files with unique IDs
  - Provides jq querying through MCP tools
  - HTTP API for file uploads

### 2. Backend (`/backend`)
- **Purpose**: Main backend service integrating Claude SDK with MCP server
- **Technology**: Node.js, TypeScript, Anthropic SDK, Express
- **Features**:
  - Chat API with file upload support
  - Claude AI integration for DWG analysis
  - Materials extraction using specialized prompts
  - MCP client for querying DWG data

### 3. Frontend (`/frontend`)
- **Purpose**: Interactive web interface for DWG analysis
- **Technology**: React, TypeScript, Vite, Tailwind CSS
- **Features**:
  - Chat interface with AI assistant
  - DWG file upload
  - Special rendering for materials lists
  - Real-time conversation with the AI

## Setup Instructions

### Prerequisites
- Node.js 20+
- npm
- Environment variable: `ANTHROPIC_API_KEY`

### 1. Install Dependencies

```bash
# DWG Parser
cd dwg-parser
npm install

# Backend
cd ../backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Environment Configuration

Create `.env` file in the backend directory:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DWG_PARSER_URL=http://localhost:3000
PORT=4000
```

### 3. Start the System

**Terminal 1 - DWG Parser:**
```bash
cd dwg-parser
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

## Usage

1. Open http://localhost:5173 in your browser
2. Upload a DWG file using the file input
3. Ask questions about the DWG file
4. For materials extraction, ask something like:
   - "Extract materials list for panel TS1B/E"
   - "Show me the materials needed for this electrical board"
   - "Generate a materials list for panel [name]"

## Materials Extraction Process

The system follows a systematic approach based on the electrical engineering methodology:

1. **Title Search**: Locate panel titles in TEXT/MTEXT entities
2. **Rectangle Boundary**: Find the panel rectangle using LWPOLYLINE entities
3. **Entity Extraction**: Extract all entities within the panel bounds
4. **Material Analysis**:
   - Parse amperages (e.g., "2x10A", "4x40A")
   - Identify differential IDs (e.g., "ID", "IDSI")
   - Extract circuit identifiers
   - Recognize equipment keywords

5. **Categorization**: Group materials into categories:
   - Térmicas (Circuit breakers)
   - Diferenciales (Differential breakers)
   - Equipos Especiales (Special equipment)
   - Gabinetes (Enclosures)
   - And other categories as found

## API Endpoints

### DWG Parser (Port 3000)
- `POST /upload/store` - Upload and store DWG file
- `GET /health` - Health check

### Backend (Port 4000)
- `POST /chat` - Chat with AI about DWG files
- `GET /health` - Health check

### Frontend (Port 5173)
- Static React application

## Technical Features

- **MCP Integration**: Uses Model Context Protocol for tool communication
- **jq Querying**: Powerful JSON querying capabilities on parsed DWG data
- **Streaming Chat**: Real-time conversation with Claude AI
- **Materials Recognition**: Specialized AI prompts for electrical component identification
- **Responsive UI**: Modern Tailwind CSS interface
- **File Handling**: Secure DWG file upload and processing

## Supported DWG Features

- All standard DWG entities (LINE, CIRCLE, TEXT, MTEXT, LWPOLYLINE, etc.)
- Layer information
- Block definitions and insertions
- Text content and positioning
- Geometric data extraction

## Example Queries

The system can handle various types of questions:

- **General Analysis**: "What entities are in this DWG?"
- **Materials Extraction**: "Generate materials list for TS1A/N"
- **Component Search**: "Find all circuit breakers in the drawing"
- **Geometric Queries**: "What are the dimensions of panel TS1B/E?"
- **Text Analysis**: "List all text containing 'UPS'"

## Development

### Adding New Material Types

1. Update the materials mapping in `backend/src/server.ts`
2. Add recognition patterns for new component types
3. Update category definitions in the system prompt

### Extending Query Capabilities

1. Add new tools to the MCP server (`dwg-parser/mcp-server.ts`)
2. Update the backend to handle new tool calls
3. Modify the frontend for specialized visualizations

## Troubleshooting

**Common Issues:**

1. **MCP Connection Failed**: Ensure dwg-parser is running before starting backend
2. **File Upload Errors**: Check DWG file format and size limits
3. **Missing Materials**: Verify text patterns in the DWG match expected formats
4. **API Key Issues**: Ensure ANTHROPIC_API_KEY is properly set

**Logs:**
- DWG Parser: Console output for file processing
- Backend: Express server logs with Claude API calls
- Frontend: Browser developer tools for client-side issues