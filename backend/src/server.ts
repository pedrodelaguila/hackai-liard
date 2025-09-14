import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Anthropic } from '@anthropic-ai/sdk';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { spawn } from 'child_process';
import FormData from 'form-data';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DWG_PARSER_URL = process.env.DWG_PARSER_URL || 'http://localhost:3000';

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// MCP Client for DWG parser
let mcpClient: Client | null = null;

// Initialize MCP client connection to dwg-parser
async function initializeMCPClient(): Promise<void> {
  try {
    // Start the MCP server process
    const mcpProcess = spawn('npm', ['run', 'mcp'], {
      cwd: '../dwg-parser',
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: true
    });

    const transport = new StdioClientTransport({
      command: mcpProcess,
    });

    mcpClient = new Client({
      name: 'dwg-analysis-backend',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    await mcpClient.connect(transport);
    console.log('Connected to DWG Parser MCP Server');
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
  }
}

// Upload DWG file to parser service and get ID
async function uploadDwgFile(fileBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('dwgfile', fileBuffer, filename);

  const response = await fetch(`${DWG_PARSER_URL}/upload/store`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload DWG: ${response.statusText}`);
  }

  const result = await response.json() as any;
  return result.id;
}

// Execute jq query via MCP
async function queryDwg(id: string, query: string): Promise<string> {
  if (!mcpClient) {
    throw new Error('MCP client not initialized');
  }

  const result = await mcpClient.callTool({
    name: 'query_dwg',
    arguments: { id, query },
  });

  if (result.content?.[0]?.type === 'text') {
    return result.content[0].text;
  }

  throw new Error('Invalid response from MCP server');
}

// Chat endpoint
app.post('/chat', upload.single('dwg'), async (req, res) => {
  try {
    const { message, dwgId: existingDwgId } = req.body;
    let dwgId = existingDwgId;

    // If a DWG file is uploaded, process it first
    if (req.file) {
      dwgId = await uploadDwgFile(req.file.buffer, req.file.originalname);
    }

    if (!dwgId) {
      return res.status(400).json({ error: 'No DWG file provided or uploaded' });
    }

    // Prepare system message with DWG context
    const systemMessage = `You are an expert in analyzing DWG (AutoCAD) files for electrical panel materials extraction. You have access to a DWG file with ID: ${dwgId}.

You can query this DWG using jq syntax to extract information. The DWG is parsed as JSON with the following structure:
- entities: Array of drawing entities (lines, circles, text, etc.)
- header: Drawing configuration variables
- tables: Layer definitions, block records, etc.

MATERIALS EXTRACTION PROCESS - Follow this exact methodology:

**Step 1: Search for title text**
Use: .entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("TITULO"; "i"))) | map({text: .text, position: .startPoint, handle: .handle})
Replace "TITULO" with the board name being searched (e.g., "ts1a/n", "ts1b/e")

**Step 2: Find the rectangle boundary**
Use: .entities | map(select(.type == "LWPOLYLINE" and (.vertices | length) == 4)) | map(select( (.vertices[0].x - \$refX | if . < 0 then -. else . end) < 3000 and (.vertices[0].y - \$refY | if . < 0 then -. else . end) < 3000 )) | map({ handle: .handle, firstVertex: .vertices[0], bounds: { minX: ([.vertices[].x] | min), maxX: ([.vertices[].x] | max), minY: ([.vertices[].y] | min), maxY: ([.vertices[].y] | max) } })

**Step 3: Extract entities within rectangle bounds**
Use: .entities[] | select(((.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) >= \$minX and (.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) <= \$maxX and (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) >= \$minY and (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) <= \$maxY))

**Step 4: Extract material specifications**
- Amperages: .entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("[0-9]+x[0-9]+A"))) | map({text: .text, position: .startPoint}) | sort_by(.text)
- Differential IDs: .entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("ID[0-9]+|IDSI[0-9]+"))) | map({text: .text, position: .startPoint}) | sort_by(.text)
- Circuits: .entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("TS[0-9]+[A-Z]+-[A-Z]+[0-9]*"))) | map({text: .text, position: .startPoint}) | sort_by(.text)

**Common Materials Mapping (EXAMPLES - interpret other materials as needed):**
- "2x10A" → TÉRMICA 2P10A 4.5KA C
- "2x16A" → TÉRMICA 2P16A 4.5KA C
- "2x25A" → TÉRMICA 2P25A 4.5KA C
- "4x40A" → TÉRMICA 4P40A 4.5KA C
- "4x80A" → TÉRMICA 4P80A 4.5KA C
- "ID" + "2x40A 30mA" → DIFERENCIAL 2P40A 30mA
- "IDSI" + "4x40A 30mA" → DIFERENCIAL 4P40A 30mA

**Equipment Keywords (EXAMPLES - look for other equipment types):**
- "UPS" → UPS equipment
- "SECCIONADOR" → Manual load disconnect switches
- "GABINETE" → Enclosures
- "DESCARGADOR" → Surge arresters

**IMPORTANT:** The above are just EXAMPLES. Analyze all text found in the panel and interpret ANY electrical components, ratings, equipment, or materials mentioned. Use your expertise to categorize and quantify all materials present.

When providing materials lists, format them as JSON with this structure (this is an EXAMPLE - adapt categories and items based on what you find):
{
  "type": "materials_list",
  "title": "Materials for [board name]",
  "items": [
    {"category": "Térmicas", "description": "TÉRMICA 2P10A 4.5KA C", "quantity": 5},
    {"category": "Diferenciales", "description": "DIFERENCIAL 2P40A 30mA", "quantity": 2},
    {"category": "Equipos Especiales", "description": "UPS 8kVA", "quantity": 2},
    {"category": "Gabinetes", "description": "GABINETE ESTANCO IP65", "quantity": 1}
  ]
}`;

    // Call Claude with the message and system context
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      system: systemMessage,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      tools: [
        {
          name: 'query_dwg',
          description: 'Execute a jq query on the loaded DWG file',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'jq query string to execute on the DWG JSON data',
              },
            },
            required: ['query'],
          },
        },
      ],
    });

    // Process tool calls if any
    let finalResponse = response;
    if (response.content.some(block => block.type === 'tool_use')) {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'query_dwg') {
          try {
            const queryResult = await queryDwg(dwgId, block.input.query as string);
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: queryResult,
            });
          } catch (error: any) {
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `Error: ${error.message}`,
              is_error: true,
            });
          }
        }
      }

      // Continue conversation with tool results
      if (toolResults.length > 0) {
        finalResponse = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          system: systemMessage,
          messages: [
            {
              role: 'user',
              content: message,
            },
            {
              role: 'assistant',
              content: response.content,
            },
            {
              role: 'user',
              content: toolResults,
            },
          ],
        });
      }
    }

    // Extract text content
    const textContent = finalResponse.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Check if response contains a materials list
    let materialsData = null;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/);
      if (jsonMatch) {
        materialsData = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      // Not a materials list, continue normally
    }

    res.json({
      response: textContent,
      dwgId,
      materialsData,
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mcpConnected: mcpClient !== null });
});

// Start server
async function startServer() {
  await initializeMCPClient();

  app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
    console.log(`DWG Parser URL: ${DWG_PARSER_URL}`);
  });
}

startServer().catch(console.error);