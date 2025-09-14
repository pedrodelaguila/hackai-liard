import express, { Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LibreDwg, Dwg_File_Type } from "@mlightcad/libredwg-web";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { storeDwgData } from "./mcp-server.js";
import { randomUUID } from "node:crypto";

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
        url: `http://localhost:${port}`,
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

async function parseDwgBufferToDb(buffer: Buffer) {
  const libredwg = await LibreDwg.create(wasmDir);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const dwg: any = libredwg.dwg_read_data(arrayBuffer, Dwg_File_Type.DWG);
  if (dwg && typeof dwg.error === "number" && dwg.error !== 0) {
    libredwg.dwg_free?.(dwg);
    const err = new Error("Failed to open DWG file") as any;
    err.code = dwg.error;
    throw err;
  }
  const db = libredwg.convert(dwg);
  libredwg.dwg_free(dwg);
  return db;
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

app.listen(port, () => {
  console.log(`DWG to JSON API running at http://localhost:${port}`);
});


