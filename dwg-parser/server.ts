import express, { Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LibreDwg, Dwg_File_Type } from "@mlightcad/libredwg-web";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { storeDwgData } from "./mcp-server.js";
import { randomUUID } from "node:crypto";
import * as jq from "node-jq";

const app = express();
const port = process.env.PORT || 3000;

const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "DWG Parser API",
      version: "1.0.0",
      description: "API to parse DWG files and extract information.",
    },
    servers: [
      {
        url: process.env.SWAGGER_URL || `http://localhost:${port}`,
      },
    ],
  },
  apis: ["server.ts", "dist/server.js"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const storage = multer.memoryStorage();
const upload = multer({ storage });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust the base directory to correctly locate node_modules in both development (ts-node)
// and production (node dist/server.js) environments.
const projectRoot = process.env.NODE_ENV === "production"
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname);

const wasmDir = path.join(
  projectRoot,
  "node_modules",
  "@mlightcad",
  "libredwg-web",
  "wasm"
) + path.sep;

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the service.
 *     responses:
 *       200:
 *         description: Service is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

function stringifyWithBigInt(value: any) {
  return JSON.stringify(value, (_key: string, v: any) => (typeof v === "bigint" ? v.toString() : v));
}

function countValuesByKey(root: any, targetKey: string) {
  const counts = new Map<string, number>();
  const visited = new WeakSet<object>();
  const stack: any[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === targetKey) {
        const valueKey = String(value);
        counts.set(valueKey, (counts.get(valueKey) || 0) + 1);
      }
      stack.push(value);
    }
  }
  return Object.fromEntries(counts);
}

function countInsertNames(root: any) {
  const counts = new Map<string, number>();
  const visited = new WeakSet<object>();
  const stack: any[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (node.type === "INSERT") {
      const valueKey = String(node.name ?? "<missing_name>");
      counts.set(valueKey, (counts.get(valueKey) || 0) + 1);
    }
    for (const value of Object.values(node)) {
      stack.push(value);
    }
  }
  return Object.fromEntries(counts);
}

// LibreDwg error code meanings for better debugging
const DWG_ERROR_CODES: { [key: number]: string } = {
  1: "DWG_ERR_INVALIDINPUT - Invalid input data",
  2: "DWG_ERR_IOERROR - Input/output error", 
  3: "DWG_ERR_OUTOFMEMORY - Out of memory",
  4: "DWG_ERR_INTERNALERROR - Internal error",
  5: "DWG_ERR_INVALIDDWG - Invalid DWG file",
  6: "DWG_ERR_INCOMPATIBLEVERSION - Incompatible DWG version",
  7: "DWG_ERR_NOTYETSUPPORTED - Feature not yet supported",
  8: "DWG_ERR_UNHANDLEDCLASS - Unhandled object class",
  9: "DWG_ERR_INVALIDTYPE - Invalid object type",
  10: "DWG_ERR_INVALIDHANDLE - Invalid handle reference",
  84: "DWG_ERR_VALUEOUTOFBOUNDS - Non-fatal warning: Some features unsupported but parsing continues"
};

// Fatal error codes that should stop processing
const FATAL_ERROR_CODES = [1, 2, 3, 4, 5, 6];

// Non-fatal warning codes that allow parsing to continue
const WARNING_CODES = [84];

async function parseDwgBufferToDb(buffer: Buffer) {
  let libredwg;
  let dwg: any = null;
  
  try {
    console.log(`Attempting to parse DWG file (${buffer.length} bytes)`);
    
    // Initialize LibreDwg
    libredwg = await LibreDwg.create(wasmDir);
    console.log("LibreDwg initialized successfully");
    
    // Convert buffer to ArrayBuffer
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    console.log(`Converting ${arrayBuffer.byteLength} bytes to DWG data structure`);
    
    // Read DWG data
    dwg = libredwg.dwg_read_data(arrayBuffer, Dwg_File_Type.DWG);
    
    if (dwg && typeof dwg.error === "number" && dwg.error !== 0) {
      const errorMessage = DWG_ERROR_CODES[dwg.error] || `Unknown LibreDwg error code: ${dwg.error}`;
      
      if (FATAL_ERROR_CODES.includes(dwg.error)) {
        console.error(`DWG parsing failed with FATAL error ${dwg.error}: ${errorMessage}`);
        libredwg.dwg_free?.(dwg);
        const err = new Error(`Failed to parse DWG file: ${errorMessage}`) as any;
        err.code = dwg.error;
        throw err;
      } else if (WARNING_CODES.includes(dwg.error)) {
        console.warn(`DWG parsing warning ${dwg.error}: ${errorMessage} - Continuing with parsing...`);
        // Continue processing despite warning
      } else {
        console.warn(`DWG parsing unknown error ${dwg.error}: ${errorMessage} - Attempting to continue...`);
        // Try to continue processing for unknown error codes
      }
    }
    
    if (!dwg) {
      throw new Error("LibreDwg returned null/undefined - file may be corrupted or unsupported");
    }
    
    console.log("DWG data structure created successfully, converting to database format");
    
    // Convert to database format
    const db = libredwg.convert(dwg);
    
    if (dwg) {
      libredwg.dwg_free(dwg);
    }
    
    console.log(`DWG conversion completed. Entities found: ${Array.isArray(db.entities) ? db.entities.length : 'unknown'}`);
    return db;
    
  } catch (error: any) {
    // Clean up resources
    if (dwg && libredwg?.dwg_free) {
      libredwg.dwg_free(dwg);
    }
    
    console.error("Error in parseDwgBufferToDb:", error);
    throw error;
  }
}

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: "Upload and parse a DWG file. WARNING: This will surely return a really big JSON file."
 *     description: "Uploads a DWG file, parses it, and returns the full JSON representation. WARNING: This will surely return a really big JSON file. For filtered results, use the other endpoints."
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dwgfile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: The parsed DWG file as JSON.
 *       400:
 *         description: No file uploaded or failed to open DWG file.
 *       500:
 *         description: Internal Server Error.
 */
app.post("/upload", upload.single("dwgfile"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const db = await parseDwgBufferToDb(req.file.buffer);
    const json = stringifyWithBigInt(db);
    res.set("Content-Type", "application/json");
    return res.send(json);
  } catch (error: any) {
    if (error && typeof error.code === "number") {
      return res.status(400).json({ error: "Failed to open DWG file", code: error.code });
    }
    console.error("Error processing DWG file:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @swagger
 * /upload/type-stats:
 *   post:
 *     summary: "Get statistics on object types in a DWG file. Primarily returns information about different types of figures, including even lines."
 *     description: "Uploads a DWG file and returns a count of each object type found. Primarily returns information about different types of figures, including even lines."
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dwgfile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: A JSON object with the counts of each object type.
 *       400:
 *         description: No file uploaded or failed to open DWG file.
 *       500:
 *         description: Internal Server Error.
 */
app.post("/upload/type-stats", upload.single("dwgfile"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const db = await parseDwgBufferToDb(req.file.buffer);
    const counts = countValuesByKey(db, "type");
    return res.json(counts);
  } catch (error: any) {
    if (error && typeof error.code === "number") {
      return res.status(400).json({ error: "Failed to open DWG file", code: error.code });
    }
    console.error("Error processing DWG file:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @swagger
 * /upload/insert-stats:
 *   post:
 *     summary: "Get statistics on INSERT object names in a DWG file. The obtained keys represent the entities referenced by the INSERTs."
 *     description: "Uploads a DWG file and returns a count of unique names for objects of type INSERT. Includes a count for items where the name key is missing. The obtained keys represent the entities referenced by the INSERTs."
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dwgfile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: A JSON object with the counts of each unique name for INSERT objects.
 *       400:
 *         description: No file uploaded or failed to open DWG file.
 *       500:
 *         description: Internal Server Error.
 */
app.post("/upload/insert-stats", upload.single("dwgfile"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const db = await parseDwgBufferToDb(req.file.buffer);
    const counts = countInsertNames(db);
    return res.json(counts);
  } catch (error: any) {
    if (error && typeof error.code === "number") {
      return res.status(400).json({ error: "Failed to open DWG file", code: error.code });
    }
    console.error("Error processing DWG file:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @swagger
 * /upload/store:
 *   post:
 *     summary: "Upload and store a DWG file with a unique ID for later querying"
 *     description: "Uploads a DWG file, parses it, stores it in memory with a unique ID, and returns the ID for later queries"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dwgfile:
 *                 type: string
 *                 format: binary
 *               id:
 *                 type: string
 *                 description: Optional custom ID. If not provided, a UUID will be generated.
 *     responses:
 *       200:
 *         description: DWG file successfully stored with ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: The unique ID assigned to the stored DWG
 *                 entityCount:
 *                   type: number
 *                   description: Number of entities in the DWG
 *                 message:
 *                   type: string
 *       400:
 *         description: No file uploaded or failed to open DWG file.
 *       500:
 *         description: Internal Server Error.
 */
app.post("/upload/store", upload.single("dwgfile"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const customId = req.body.id;
    const id = customId || randomUUID();

    const db = await parseDwgBufferToDb(req.file.buffer);

    // Store the parsed DWG data in the MCP server
    storeDwgData(id, db);

    const entityCount = Array.isArray(db.entities) ? db.entities.length : 0;

    return res.json({
      id,
      entityCount,
      message: `DWG file successfully stored with ID: ${id}`
    });
  } catch (error: any) {
    if (error && typeof error.code === "number") {
      return res.status(400).json({ error: "Failed to open DWG file", code: error.code });
    }
    console.error("Error processing DWG file:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @swagger
 * /debug/dwg-info:
 *   post:
 *     summary: "Get detailed information about a DWG file without full parsing"
 *     description: "Uploads a DWG file and returns basic information to help debug parsing issues"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               dwgfile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Basic DWG file information.
 *       400:
 *         description: No file uploaded or analysis failed.
 */
app.post("/debug/dwg-info", upload.single("dwgfile"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const buffer = req.file.buffer;
    const info: any = {
      filename: req.file.originalname,
      fileSize: buffer.length,
      fileSizeKB: Math.round(buffer.length / 1024),
      wasmDirectory: wasmDir
    };

    // Check first few bytes for DWG signature
    const header = buffer.subarray(0, Math.min(buffer.length, 16));
    info.headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ');
    
    // DWG files should start with "AC" followed by version
    if (buffer.length >= 6) {
      const signature = buffer.toString('ascii', 0, 2);
      const version = buffer.toString('ascii', 2, 6);
      info.signature = signature;
      info.version = version;
      info.isValidDWG = signature === 'AC';
      
      if (info.isValidDWG) {
        const versionMappings: { [key: string]: string } = {
          '1015': 'AutoCAD 2000/2001/2002',
          '1018': 'AutoCAD 2004/2005/2006',
          '1021': 'AutoCAD 2007/2008/2009',
          '1024': 'AutoCAD 2010/2011/2012',
          '1027': 'AutoCAD 2013/2014',
          '1032': 'AutoCAD 2018/2019/2020/2021/2022'
        };
        info.versionDescription = versionMappings[version] || `Unknown version: ${version}`;
      }
    }

    // Try to initialize LibreDwg to check WASM availability
    try {
      const libredwg = await LibreDwg.create(wasmDir);
      info.libredwgStatus = "OK - WASM loaded successfully";
      
      // Try basic parsing without conversion
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      const dwg: any = libredwg.dwg_read_data(arrayBuffer, Dwg_File_Type.DWG);
      
      if (dwg && typeof dwg.error === "number") {
        info.parsingError = dwg.error;
        info.parsingErrorMessage = DWG_ERROR_CODES[dwg.error] || `Unknown error ${dwg.error}`;
        info.parsingStatus = dwg.error === 0 ? "SUCCESS" : "FAILED";
        
        libredwg.dwg_free?.(dwg);
      } else {
        info.parsingStatus = dwg ? "SUCCESS" : "FAILED - No DWG object returned";
      }
    } catch (wasmError: any) {
      info.libredwgStatus = `ERROR - ${wasmError.message}`;
      info.wasmError = wasmError.toString();
    }

    return res.json(info);
  } catch (error: any) {
    console.error("Error in debug endpoint:", error);
    return res.status(500).json({ 
      error: "Analysis failed", 
      details: error.message,
      stack: error.stack
    });
  }
});

/**
 * @swagger
 * /query:
 *   post:
 *     summary: "Execute a jq query on a stored DWG file"
 *     description: "Bridge endpoint to execute MCP server queries via HTTP"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: ID of the stored DWG file
 *               query:
 *                 type: string
 *                 description: jq query to execute
 *             required: [id, query]
 *     responses:
 *       200:
 *         description: Query result as text.
 *       400:
 *         description: Invalid request or DWG not found.
 *       500:
 *         description: Query execution failed.
 */
app.post("/query", express.json(), async (req: Request, res: Response) => {
  try {
    const { id, query } = req.body;
    
    if (!id || !query) {
      return res.status(400).json({ error: "Both 'id' and 'query' are required" });
    }
    
    // Import the MCP server functions to access stored data
    const { hasDwgData, getDwgData } = await import('./mcp-server.js');
    
    // Check if DWG exists
    if (!hasDwgData(id)) {
      return res.status(400).send(`Error: No DWG found with ID '${id}'`);
    }
    
    // Get the stored DWG data
    const dwgData = getDwgData(id);
    const jsonString = stringifyWithBigInt(dwgData);
    
    // Execute jq query using the same import as MCP server with better error handling
    try {
      // Validate that the JSON string is properly formatted
      JSON.parse(jsonString);
      
      // Preprocess query to handle common issues
      let processedQuery = query;
      
      // If query tries to access .position on potentially string values, add error handling
      if (query.includes('.position') || query.includes('["position"]')) {
        // Wrap position access in try-empty to handle cases where position doesn't exist or is on a string
        processedQuery = query.replace(
          /(\.[a-zA-Z_][a-zA-Z0-9_]*\.position|\["[^"]*"\]\.position)/g, 
          '($1 // empty)'
        );
      }
      
      // Execute the query with proper error handling
      const result = await jq.run(processedQuery, jsonString, { 
        input: 'string'
      });
      
      return res.send(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (jqError: any) {
      console.error("JQ execution error:", jqError.message);
      
      // For debugging - log the actual query that failed
      console.error("Failed query:", query);
      console.error("JSON data length:", jsonString.length);
      
      // Return empty result for position-related errors to avoid breaking the flow
      if (jqError.message.includes('Cannot index string with string')) {
        console.log("Returning empty result for indexing error");
        return res.send('[]'); // Return empty array instead of error
      } else if (jqError.message.includes('Cannot iterate over')) {
        console.log("Returning empty result for iteration error");
        return res.send('[]');
      } else if (jqError.message.includes('null') || jqError.message.includes('undefined')) {
        console.log("Returning empty result for null/undefined error");
        return res.send('[]');
      } else {
        // For other errors, still return empty to avoid breaking the chat
        console.log("Returning empty result for unknown error");
        return res.send('[]');
      }
    }
  } catch (error: any) {
    console.error("Query execution error:", error);
    return res.status(500).send(`Error executing jq query: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`DWG to JSON API running at http://localhost:${port}`);
  console.log(`API Documentation available at http://localhost:${port}/api-docs`);
  console.log(`WASM directory: ${wasmDir}`);
});


