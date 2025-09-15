import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Anthropic } from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
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
    // Try connecting to the MCP server running on the DWG parser HTTP server (port 3000)
    // Instead of spawning a new process, we'll communicate with the existing one
    console.log('Attempting to connect to MCP server via HTTP bridge...');
    
    // For now, we'll create a mock client that communicates via HTTP to the DWG parser
    // This is a temporary solution until we properly set up stdio communication
    mcpClient = {
      callTool: async (params: any) => {
        // Mock implementation that calls the HTTP server's functionality
        const { name, arguments: args } = params;
        
        if (name === 'query_dwg') {
          try {
            // Make HTTP request to DWG parser to execute jq query
            const response = await fetch(`${DWG_PARSER_URL}/query`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: args.id,
                query: args.query
              })
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.text();
            return {
              content: [{
                type: 'text',
                text: result
              }]
            };
          } catch (error: any) {
            return {
              content: [{
                type: 'text', 
                text: `Error executing query: ${error.message}`
              }]
            };
          }
        }
        
        throw new Error(`Unknown tool: ${name}`);
      }
    } as any;
    
    console.log('Connected to DWG Parser via HTTP bridge');
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

  if ((result.content as any)?.[0]?.type === 'text') {
    return (result.content as any)[0].text;
  }

  throw new Error('Invalid response from MCP server');
}

// Helper function to execute DWG queries
async function executeDwgQuery(dwgId: string, query: string): Promise<string> {
  try {
    const queryResult = await queryDwg(dwgId, query);
    console.log(`✅ Query executed successfully: ${query}`);
    return queryResult;
  } catch (error: any) {
    console.error(`❌ Query failed: ${query}`, error);
    return `Error: ${error.message}`;
  }
}

// Streaming version of Claude conversation handler with progress updates
async function handleClaudeConversationWithStreaming(
  messages: any[], 
  systemMessage: string,
  dwgId: string,
  sendUpdate: (type: string, data: any) => void
): Promise<{ response: string; materialsData: any }> {
  
  const tools = [
    {
      name: 'query_dwg',
      description: 'Execute a jq query on the loaded DWG file to extract specific information',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string' as const,
            description: 'jq query string to execute on the DWG JSON data',
          },
        },
        required: ['query'],
      },
    },
  ];

  console.log(`🚀 Starting Claude conversation for DWG: ${dwgId}`);
  sendUpdate('conversation_started', { round: 0, message: 'Initializing conversation with Claude...' });
  
  let conversationMessages = [...messages];
  let fullResponse = "";
  let conversationRound = 1;
  const maxRounds = 10;

  try {
    while (conversationRound <= maxRounds) {
      console.log(`🔄 Conversation round ${conversationRound}`);
      sendUpdate('round_started', { round: conversationRound, message: `Round ${conversationRound}: Claude is thinking...` });
      
      // Make API call to Claude
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        system: systemMessage,
        messages: conversationMessages,
        tools
      });

      // Extract text and tool calls from response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      const responseText = textBlocks.map(block => block.text).join('');
      fullResponse += (fullResponse ? '\n\n' : '') + responseText;
      
      console.log(`📝 Claude response (round ${conversationRound}): "${responseText.substring(0, 200)}..."`);
      console.log(`🔧 Tool calls in this round: ${toolUseBlocks.length}`);

      // Send the round's text response
      sendUpdate('round_response', { 
        round: conversationRound, 
        text: responseText,
        toolCount: toolUseBlocks.length
      });

      // If Claude wants to use tools, execute them and continue conversation
      if (toolUseBlocks.length > 0) {
        console.log(`⚡ Executing ${toolUseBlocks.length} tool call(s)`);
        sendUpdate('tools_executing', { 
          round: conversationRound, 
          toolCount: toolUseBlocks.length,
          message: `Executing ${toolUseBlocks.length} database ${toolUseBlocks.length === 1 ? 'query' : 'queries'}...`
        });
        
        const toolResults = [];
        
        for (let i = 0; i < toolUseBlocks.length; i++) {
          const toolBlock = toolUseBlocks[i];
          if (toolBlock.name === 'query_dwg') {
            const query = (toolBlock.input as any).query;
            console.log(`🔍 Executing query ${i + 1}/${toolUseBlocks.length}: ${query}`);
            sendUpdate('tool_executing', { 
              round: conversationRound, 
              toolIndex: i + 1, 
              totalTools: toolUseBlocks.length,
              query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
              message: `Query ${i + 1}/${toolUseBlocks.length}: ${query.substring(0, 50)}...`
            });
            
            const result = await executeDwgQuery(dwgId, query);
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id,
              content: result,
            });
            console.log(`✅ Query result: ${result.substring(0, 100)}...`);
            sendUpdate('tool_completed', { 
              round: conversationRound, 
              toolIndex: i + 1,
              resultPreview: result.substring(0, 200) + (result.length > 200 ? '...' : '')
            });
          }
        }

        // Add assistant message and tool results to conversation
        conversationMessages.push({
          role: 'assistant' as const,
          content: response.content
        });
        
        conversationMessages.push({
          role: 'user' as const,
          content: toolResults
        });

        conversationRound++;
        console.log(`➡️  Continuing to round ${conversationRound} with tool results`);
        sendUpdate('round_completed', { 
          round: conversationRound - 1, 
          message: `Round ${conversationRound - 1} completed. Continuing analysis...`,
          continuing: true
        });
        
      } else {
        // No tools used, Claude has finished
        console.log(`✅ Claude finished conversation after ${conversationRound} rounds`);
        console.log(`📊 Final response length: ${fullResponse.length} characters`);
        sendUpdate('conversation_finished', { 
          totalRounds: conversationRound, 
          responseLength: fullResponse.length,
          message: `Analysis completed in ${conversationRound} rounds`
        });
        break;
      }
    }

    if (conversationRound > maxRounds) {
      console.warn(`⚠️  Conversation hit max rounds (${maxRounds}), stopping`);
      sendUpdate('max_rounds_reached', { maxRounds, message: `Analysis stopped after ${maxRounds} rounds` });
    }

    // Check for materials data
    let materialsData = null;
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/);
      if (jsonMatch) {
        materialsData = JSON.parse(jsonMatch[0]);
        console.log('📋 Materials list extracted:', materialsData);
        sendUpdate('materials_extracted', { materialsData });
      }
    } catch (error) {
      console.log('ℹ️  No materials list found in response');
    }

    console.log('🎉 Claude conversation completed successfully');
    return { response: fullResponse, materialsData };

  } catch (error: any) {
    console.error('❌ Claude conversation error:', error);
    sendUpdate('conversation_error', { error: error.message });
    throw new Error(`Claude conversation failed: ${error.message}`);
  }
}

// Simpler but more reliable Claude conversation handler
async function handleClaudeConversation(
  messages: any[], 
  systemMessage: string,
  dwgId: string
): Promise<{ response: string; materialsData: any }> {
  
  const tools = [
    {
      name: 'query_dwg',
      description: 'Execute a jq query on the loaded DWG file to extract specific information',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string' as const,
            description: 'jq query string to execute on the DWG JSON data',
          },
        },
        required: ['query'],
      },
    },
  ];

  console.log(`🚀 Starting Claude conversation for DWG: ${dwgId}`);
  
  let conversationMessages = [...messages];
  let fullResponse = "";
  let conversationRound = 1;
  const maxRounds = 10; // Prevent infinite loops

  try {
    while (conversationRound <= maxRounds) {
      console.log(`🔄 Conversation round ${conversationRound}`);
      
      // Make API call to Claude
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        system: systemMessage,
        messages: conversationMessages,
        tools
      });

      // Extract text and tool calls from response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      const responseText = textBlocks.map(block => block.text).join('');
      fullResponse += (fullResponse ? '\n\n' : '') + responseText;
      
      console.log(`📝 Claude response (round ${conversationRound}): "${responseText.substring(0, 200)}..."`);
      console.log(`🔧 Tool calls in this round: ${toolUseBlocks.length}`);

      // If Claude wants to use tools, execute them and continue conversation
      if (toolUseBlocks.length > 0) {
        console.log(`⚡ Executing ${toolUseBlocks.length} tool call(s)`);
        
        const toolResults = [];
        
        for (const toolBlock of toolUseBlocks) {
          if (toolBlock.name === 'query_dwg') {
            console.log(`🔍 Executing query: ${(toolBlock.input as any).query}`);
            const result = await executeDwgQuery(dwgId, (toolBlock.input as any).query);
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id,
              content: result,
            });
            console.log(`✅ Query result: ${result.substring(0, 100)}...`);
          }
        }

        // Add assistant message and tool results to conversation
        conversationMessages.push({
          role: 'assistant' as const,
          content: response.content
        });
        
        conversationMessages.push({
          role: 'user' as const,
          content: toolResults
        });

        conversationRound++;
        console.log(`➡️  Continuing to round ${conversationRound} with tool results`);
        
      } else {
        // No tools used, Claude has finished
        console.log(`✅ Claude finished conversation after ${conversationRound} rounds`);
        console.log(`📊 Final response length: ${fullResponse.length} characters`);
        break;
      }
    }

    if (conversationRound > maxRounds) {
      console.warn(`⚠️  Conversation hit max rounds (${maxRounds}), stopping`);
    }

    // Check for materials data
    let materialsData = null;
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/);
      if (jsonMatch) {
        materialsData = JSON.parse(jsonMatch[0]);
        console.log('📋 Materials list extracted:', materialsData);
      }
    } catch (error) {
      console.log('ℹ️  No materials list found in response');
    }

    console.log('🎉 Claude conversation completed successfully');
    return { response: fullResponse, materialsData };

  } catch (error: any) {
    console.error('❌ Claude conversation error:', error);
    throw new Error(`Claude conversation failed: ${error.message}`);
  }
}

// Non-streaming chat endpoint (fallback)
app.post('/chat/basic', upload.single('dwg'), async (req, res) => {
  try {
    const { message, dwgId: existingDwgId } = req.body;
    let dwgId = existingDwgId;

    console.log(`📨 New chat request: ${message?.substring(0, 100)}...`);

    // If a DWG file is uploaded, process it first
    if (req.file) {
      console.log(`📂 Processing uploaded DWG: ${req.file.originalname}`);
      dwgId = await uploadDwgFile(req.file.buffer, req.file.originalname);
      console.log(`✅ DWG uploaded with ID: ${dwgId}`);
    }

    if (!dwgId) {
      return res.status(400).json({ error: 'No DWG file provided or uploaded' });
    }

    // System message with improved query strategy to avoid token limits
    const systemMessage = `You are an expert in analyzing DWG (AutoCAD) files for electrical panel materials extraction. You have access to a DWG file with ID: ${dwgId}.

CRITICAL: To avoid token limits, use FOCUSED queries that return only essential information. Do NOT query for all entities at once.

STRATEGY FOR MATERIALS EXTRACTION:

**Step 1: Quick entity count**
Use: [.entities | length]

**Step 2: Find specific text patterns (use selective filters)**
- For amperages: .entities[] | select(.type == "TEXT" or .type == "MTEXT") | select(.text | test("[0-9]+[xX][0-9]+A")) | .text
- For differentials: .entities[] | select(.type == "TEXT" or .type == "MTEXT") | select(.text | test("ID[SsIi]*[0-9]")) | .text  
- For board names: .entities[] | select(.type == "TEXT" or .type == "MTEXT") | select(.text | test("[Tt][Ss][0-9]+")) | .text

**Step 3: Extract material quantities**
Count unique occurrences of each pattern found.

**IMPORTANT CONSTRAINTS:**
- Use | .text instead of full objects to minimize token usage
- Query for specific patterns, not all entities
- Limit results with | .[0:20] if needed
- Focus on extracting materials data, not analyzing entire drawing

When providing materials lists, format as JSON:
{
  "type": "materials_list",
  "title": "Materials for Panel Analysis", 
  "items": [
    {"category": "Térmicas", "description": "TÉRMICA 2P10A 4.5KA C", "quantity": 5},
    {"category": "Diferenciales", "description": "DIFERENCIAL 2P40A 30mA", "quantity": 2}
  ]
}

ALWAYS use focused, selective queries to stay within token limits.`;

    const messages = [
      {
        role: 'user' as const,
        content: message,
      },
    ];

    const result = await handleClaudeConversation(messages, systemMessage, dwgId);

    res.json({
      response: result.response,
      materialsData: result.materialsData,
      dwgId,
    });

    console.log('✅ Chat request completed successfully');

  } catch (error: any) {
    console.error('❌ Chat endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Streaming chat endpoint - shows progressive conversation rounds
app.post('/chat/stream', upload.single('dwg'), async (req, res) => {
  try {
    const { message, dwgId: existingDwgId } = req.body;
    let dwgId = existingDwgId;

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    function sendUpdate(type: string, data: any) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    }

    console.log(`📨 New streaming chat request: ${message?.substring(0, 100)}...`);

    // If a DWG file is uploaded, process it first
    if (req.file) {
      console.log(`📂 Processing uploaded DWG: ${req.file.originalname}`);
      sendUpdate('status', { message: 'Uploading and parsing DWG file...', stage: 'upload' });
      
      dwgId = await uploadDwgFile(req.file.buffer, req.file.originalname);
      console.log(`✅ DWG uploaded with ID: ${dwgId}`);
      
      sendUpdate('dwg_uploaded', { dwgId, message: 'DWG file processed successfully!' });
    }

    if (!dwgId) {
      sendUpdate('error', { error: 'No DWG file provided or uploaded' });
      res.end();
      return;
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

**Step 2: Find board rectangle boundary**  
After finding the board title position, find the rectangular boundary around it:
Use: .entities | map(select(.type == "LWPOLYLINE" and (.vertices | length) == 4)) | map(select( (.vertices[0].x - $refX | if . < 0 then -. else . end) < 5000 and (.vertices[0].y - $refY | if . < 0 then -. else . end) < 5000 )) | map({ handle: .handle, bounds: { minX: ([.vertices[].x] | min), maxX: ([.vertices[].x] | max), minY: ([.vertices[].y] | min), maxY: ([.vertices[].y] | max) } })
Replace $refX and $refY with the actual coordinates found in step 1.

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

When providing materials lists, format them as JSON with this structure:
{
  "type": "materials_list", 
  "title": "Materials for [Board Name]",
  "items": [
    {"category": "Térmicas", "description": "TÉRMICA 2P10A 4.5KA C", "quantity": 5},
    {"category": "Diferenciales", "description": "DIFERENCIAL 2P40A 30mA", "quantity": 2},
    {"category": "Equipos Especiales", "description": "UPS 8kVA", "quantity": 2},
    {"category": "Gabinetes", "description": "GABINETE ESTANCO IP65", "quantity": 1}
  ]
}

ALWAYS use the query_dwg tool to analyze the DWG data. Be thorough and methodical in your analysis.`;

    const messages = [
      {
        role: 'user' as const,
        content: message,
      },
    ];

    sendUpdate('analysis_started', { message: 'Starting DWG analysis with Claude...' });

    // Use streaming conversation handler with progress updates
    const result = await handleClaudeConversationWithStreaming(messages, systemMessage, dwgId, sendUpdate);

    sendUpdate('analysis_complete', { 
      response: result.response, 
      materialsData: result.materialsData,
      dwgId 
    });

    console.log('✅ Streaming chat request completed successfully');
    res.end();

  } catch (error: any) {
    console.error('❌ Streaming chat endpoint error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: { error: error.message } })}\n\n`);
    res.end();
  }
});

// Chat endpoint - supports both text and file uploads  
app.post('/chat', upload.single('dwg'), async (req, res) => {
  try {
    const { message, dwgId: existingDwgId } = req.body;
    let dwgId = existingDwgId;

    console.log(`📨 New chat request: ${message?.substring(0, 100)}...`);

    // If a DWG file is uploaded, process it first
    if (req.file) {
      console.log(`📂 Processing uploaded DWG: ${req.file.originalname}`);
      dwgId = await uploadDwgFile(req.file.buffer, req.file.originalname);
      console.log(`✅ DWG uploaded with ID: ${dwgId}`);
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
}

ALWAYS use the query_dwg tool to analyze the DWG data. Be thorough and methodical in your analysis.`;

    const messages = [
      {
        role: 'user' as const,
              content: message,
            },
    ];

    // Use the improved conversation handler
    const result = await handleClaudeConversation(messages, systemMessage, dwgId);

    console.log('✅ Chat request completed successfully');

    res.json({
      response: result.response,
      dwgId,
      materialsData: result.materialsData,
    });

  } catch (error: any) {
    console.error('❌ Chat endpoint error:', error);
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