import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Anthropic } from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDwgAnalysisSystemMessage } from './prompts.js';
import * as aps from './apsService.js';
import { 
  createConversationSession, 
  addMessageToHistory, 
  getConversationHistory, 
  buildContextFromHistory, 
  getSessionStats 
} from './conversationHistory.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
async function uploadDwgFile(
  fileBuffer: Buffer,
  filename: string
): Promise<{ id: string; localPath: string }> {
  // Save the file locally first for APS upload
  const localDrawingsDir = path.join(__dirname, '../cadviewer-data/drawings');
  await fs.promises.mkdir(localDrawingsDir, { recursive: true });
  
  const localFilename = `${Date.now()}-${filename}`;
  const localPath = path.join(localDrawingsDir, localFilename);
  await fs.promises.writeFile(localPath, fileBuffer);

  // Also upload to the DWG parser service for analysis
  const formData = new FormData();
  formData.append('dwgfile', fileBuffer, filename);

  const response = await fetch(`${DWG_PARSER_URL}/upload/store`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload DWG: ${response.statusText}`);
  }

  const result = (await response.json()) as any;
  return { id: result.id, localPath: localPath };
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

/**
 * APS Token endpoint for the viewer.
 */
app.get('/api/aps/token', async (_req, res) => {
  try {
    const token = await aps.getAuthToken();
    res.json({
      access_token: token.access_token,
      expires_in: token.expires_in,
    });
  } catch (error) {
    console.error('Error fetching APS token:', error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// Extract final result from Claude's full response
function extractFinalResult(fullResponse: string): string {
  // Split into sections by double newlines
  let paragraphs = fullResponse.split('\n\n');
  
  // Remove step-by-step process markers and reasoning
  const filteredParagraphs = paragraphs.filter(paragraph => {
    const lowerPara = paragraph.toLowerCase().trim();
    
    // Skip step markers and process explanations
    if (/^\*\*paso \d+:/i.test(paragraph) ||
        /^\*\*step \d+:/i.test(paragraph) ||
        lowerPara.includes('voy a proceder') ||
        lowerPara.includes('procedamos a') ||
        lowerPara.includes('ahora voy a') ||
        lowerPara.includes('déjame') ||
        lowerPara.includes('let me') ||
        lowerPara.includes('voy a buscar') ||
        lowerPara.includes('buscar el') ||
        lowerPara.includes('encontré el') ||
        lowerPara.includes('he encontrado') ||
        lowerPara.includes('perfecto!') ||
        lowerPara.includes('excelente!') ||
        lowerPara.includes('¡perfecto!') ||
        lowerPara.includes('¡excelente!') ||
        lowerPara.includes('basándome en') ||
        lowerPara.includes('based on')) {
      return false;
    }
    
    // Skip internal reasoning
    if (lowerPara.startsWith('i need to') || 
        lowerPara.startsWith('i\'ll') || 
        lowerPara.startsWith('i should') ||
        lowerPara.startsWith('first, i') ||
        lowerPara.startsWith('now i') ||
        lowerPara.startsWith('te ayudo a') ||
        lowerPara.includes('siguiendo los estándares') ||
        lowerPara.includes('sistemáticamente')) {
      return false;
    }
    
    // Skip query explanations
    if (lowerPara.includes('this query will') ||
        lowerPara.includes('esta consulta') ||
        lowerPara.includes('the query returned') ||
        lowerPara.includes('la consulta devuelve') ||
        lowerPara.includes('déjame simplificar')) {
      return false;
    }
    
    // Skip short paragraphs that are likely process notes
    if (paragraph.trim().length < 20) {
      return false;
    }
    
    return true;
  });
  
  // Look for final results section - usually contains JSON or summary
  let result = '';
  
  // First, try to find a JSON materials list
  const jsonMatch = fullResponse.match(/\{[\s\S]*"type":\s*"materials_list"[\s\S]*\}/);
  if (jsonMatch) {
    // Extract the paragraph that contains the JSON and maybe some context
    const jsonText = jsonMatch[0];
    const beforeJson = fullResponse.substring(0, fullResponse.indexOf(jsonText));
    const afterJson = fullResponse.substring(fullResponse.indexOf(jsonText) + jsonText.length);
    
    // Look for a summary or conclusion after the JSON
    const summaryMatch = afterJson.match(/\*\*Resumen[\s\S]*?(?=\n\n|\n\*\*|$)/i) ||
                        afterJson.match(/\*\*Summary[\s\S]*?(?=\n\n|\n\*\*|$)/i) ||
                        afterJson.match(/En resumen[\s\S]*?(?=\n\n|\n\*\*|$)/i);
    
    result = jsonText;
    if (summaryMatch) {
      result += '\n\n' + summaryMatch[0];
    }
  } else {
    // If no JSON, look for final summary sections
    const summaryMatches = fullResponse.match(/\*\*Resumen[\s\S]*$/i) ||
                          fullResponse.match(/\*\*Summary[\s\S]*$/i) ||
                          fullResponse.match(/## Resumen[\s\S]*$/i);
    
    if (summaryMatches) {
      result = summaryMatches[0];
    } else {
      // Fallback: use filtered paragraphs but prioritize later ones
      if (filteredParagraphs.length > 0) {
        // Take the last 2-3 substantial paragraphs
        const substantialParas = filteredParagraphs.filter(p => p.trim().length > 50);
        result = substantialParas.slice(-3).join('\n\n');
      } else {
        // Last resort: take the end of the response
        const lastPart = fullResponse.split('\n\n').slice(-4).join('\n\n');
        result = lastPart;
      }
    }
  }
  
  // Clean up step markers and process language that might have slipped through
  result = result
    .replace(/^\*\*Paso \d+:.*$/gmi, '')
    .replace(/^\*\*Step \d+:.*$/gmi, '')
    .replace(/^Te ayudo a.*siguiendo.*$/gmi, '')
    .replace(/^Voy a proceder.*$/gmi, '')
    .replace(/^Basándome en.*análisis.*$/gmi, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return result || fullResponse;
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
  sendUpdate: (type: string, data: any) => void,
  sessionId?: string
): Promise<{ response: string; materialsData: any; sessionId: string }> {
  
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

  // Create or use existing session for conversation history
  const currentSessionId = sessionId || createConversationSession(dwgId);
  
  console.log(`🚀 Starting Claude conversation for DWG: ${dwgId}, Session: ${currentSessionId}`);
  sendUpdate('conversation_started', { 
    round: 0, 
    message: 'Initializing conversation with Claude...', 
    sessionId: currentSessionId 
  });
  
  // Add user message to history
  if (messages.length > 0) {
    addMessageToHistory(currentSessionId, 'user', messages[0].content);
  }
  
  // Build context from conversation history
  const historyContext = buildContextFromHistory(currentSessionId, 8);
  const enhancedSystemMessage = historyContext ? `${systemMessage}\n\n${historyContext}` : systemMessage;
  
  let conversationMessages = [...messages];
  let fullResponse = "";
  let conversationRound = 1;
  const maxRounds = 15;

  try {
    while (conversationRound <= maxRounds) {
      console.log(`🔄 Conversation round ${conversationRound}`);
      sendUpdate('round_started', { round: conversationRound, message: `Round ${conversationRound}: Claude is thinking...` });
      
      // Make API call to Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: enhancedSystemMessage,
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
        const toolCallsForHistory: Array<{ name: string; query: string; result: string }> = [];
        
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
            
            // Track tool call for history
            toolCallsForHistory.push({
              name: toolBlock.name,
              query: query,
              result: result
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

        // Add assistant response to history with tool calls
        addMessageToHistory(currentSessionId, 'assistant', responseText, toolCallsForHistory);
        
        conversationRound++;
        console.log(`➡️  Continuing to round ${conversationRound} with tool results`);
        sendUpdate('round_completed', { 
          round: conversationRound - 1, 
          message: `Round ${conversationRound - 1} completed. Continuing analysis...`,
          continuing: true
        });
        
      } else {
        // No tools used, Claude has finished
        // Add final assistant response to history
        addMessageToHistory(currentSessionId, 'assistant', responseText);
        
        console.log(`✅ Claude finished conversation after ${conversationRound} rounds`);
        console.log(`📊 Final response length: ${fullResponse.length} characters`);
        sendUpdate('conversation_finished', { 
          totalRounds: conversationRound, 
          responseLength: fullResponse.length,
          message: `Analysis completed in ${conversationRound} rounds`,
          sessionId: currentSessionId
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
    
    // Extract only the final useful result from Claude's response
    const finalResult = extractFinalResult(fullResponse);
    
    return { response: finalResult, materialsData, sessionId: currentSessionId };

  } catch (error: any) {
    console.error('❌ Claude conversation error:', error);
    sendUpdate('conversation_error', { error: error.message });
    throw new Error(`Claude conversation failed: ${error.message}`);
  }
}



// Streaming chat endpoint - shows progressive conversation rounds with conversation history
app.post('/chat/stream', upload.single('dwg'), async (req, res) => {
  try {
    const { message, dwgId: existingDwgId, sessionId: existingSessionId } = req.body;
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
      
      const { id, localPath } = await uploadDwgFile(req.file.buffer, req.file.originalname);
      dwgId = id;
      console.log(`✅ DWG uploaded with ID: ${dwgId}`);

      // Asynchronously start the translation to not block the chat flow
      aps.uploadAndTranslateDwg(dwgId, localPath)
        .then(urn => {
          console.log(`✅ DWG translation started. URN: ${urn}`);
          // The URN is the ID of the object in the bucket, base64 encoded.
          // The frontend will receive this URN and can start polling for translation progress,
          // but for simplicity, we'll just let the viewer handle it.
          // We'll send a message when the process is initiated.
          sendUpdate('dwg_translation_started', { urn });
        })
        .catch(err => {
          console.error('APS translation failed:', err);
          sendUpdate('dwg_translation_failed', { error: 'Could not prepare DWG for viewing.' });
        });

      sendUpdate('dwg_uploaded', { dwgId, message: 'DWG file processed successfully!' });
    }

    if (!dwgId) {
      sendUpdate('error', { error: 'No DWG file provided or uploaded' });
      res.end();
      return;
    }

    // Prepare system message with DWG context
    const systemMessage = getDwgAnalysisSystemMessage({ dwgId });

    const messages = [
      {
        role: 'user' as const,
        content: message,
      },
    ];

    sendUpdate('analysis_started', { message: 'Starting DWG analysis with Claude...' });

    // Use streaming conversation handler with progress updates and session management
    const result = await handleClaudeConversationWithStreaming(messages, systemMessage, dwgId, sendUpdate, existingSessionId);

    sendUpdate('analysis_complete', { 
      response: result.response, 
      materialsData: result.materialsData,
      dwgId,
      sessionId: result.sessionId
    });

    console.log('✅ Streaming chat request completed successfully');
    res.end();

  } catch (error: any) {
    console.error('❌ Streaming chat endpoint error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: { error: error.message } })}\n\n`);
    res.end();
  }
});


// Get conversation history for a session
app.get('/conversations/:sessionId/history', (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = getConversationHistory(sessionId);
    
    if (history.length === 0) {
      return res.status(404).json({ error: 'Session not found or empty' });
    }
    
    res.json({ sessionId, history });
  } catch (error: any) {
    console.error('❌ Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation statistics
app.get('/conversations/stats', (_, res) => {
  try {
    const stats = getSessionStats();
    res.json(stats);
  } catch (error: any) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (_, res) => {
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