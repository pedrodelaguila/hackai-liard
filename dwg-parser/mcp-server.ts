import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import jq from "node-jq";
import { z } from "zod";

// Store parsed DWG files in memory with unique IDs
const dwgStore = new Map<string, any>();

function stringifyWithBigInt(value: any) {
  return JSON.stringify(value, (_key: string, v: any) => (typeof v === "bigint" ? v.toString() : v));
}

const server = new Server(
  {
    name: "dwg-parser",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(
  z.object({
    method: z.literal("tools/list"),
  }),
  async () => {
    return {
      tools: [
        {
          name: "query_dwg",
          description: "Execute a jq query on a previously loaded DWG file by its ID",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the DWG file to query",
              },
              query: {
                type: "string",
                description: "jq query string to execute on the parsed DWG JSON",
              },
            },
            required: ["id", "query"],
          },
        },
        {
          name: "list_loaded_dwgs",
          description: "List all currently loaded DWG files with their IDs",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  }
);

server.setRequestHandler(
  z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.any(),
    }),
  }),
  async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "query_dwg": {
          const { id, query } = args as { id: string; query: string };

          if (!dwgStore.has(id)) {
            return {
              content: [{
                type: "text",
                text: `Error: No DWG found with ID '${id}'. Use list_loaded_dwgs to see available DWGs.`
              }]
            };
          }

          try {
            const dwgData = dwgStore.get(id);
            const jsonString = stringifyWithBigInt(dwgData);
            const result = await jq.run(query, jsonString, { input: 'string' });

            return {
              content: [{
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }]
            };
          } catch (error: any) {
            return {
              content: [{
                type: "text",
                text: `Error executing jq query: ${error.message}`
              }]
            };
          }
        }

        case "list_loaded_dwgs": {
          const loadedDwgs = Array.from(dwgStore.keys());
          return {
            content: [{
              type: "text",
              text: loadedDwgs.length > 0
                ? `Loaded DWGs: ${loadedDwgs.join(', ')}`
                : "No DWG files currently loaded."
            }]
          };
        }

        default:
          return {
            content: [{
              type: "text",
              text: `Unknown tool: ${name}`
            }],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true,
      };
    }
  }
);

// Export function to store DWG data (called by the HTTP server)
export function storeDwgData(id: string, data: any): void {
  dwgStore.set(id, data);
}

// Export function to remove DWG data
export function removeDwgData(id: string): boolean {
  return dwgStore.delete(id);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DWG Parser MCP Server running on stdio");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}