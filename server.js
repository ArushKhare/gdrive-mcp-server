import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import express from "express";

const PORT = process.env.PORT || 3000;
const CREDENTIALS_PATH = process.env.GDRIVE_CREDS_PATH || "./credentials.json";
const TOKEN_PATH = process.env.GDRIVE_TOKEN_PATH || "./token.json";

// Initialize OAuth2 client
let oauth2Client;
let drive;

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oauth2Client.setCredentials(token);
  }

  drive = google.drive({ version: "v3", auth: oauth2Client });
}

// MCP Server setup
const server = new Server(
  {
    name: "gdrive-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Search files in Google Drive
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "search_files",
        description: "Search for files in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'name contains \".csv\"')",
            },
          },
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a file from Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The ID of the file to read",
            },
          },
          required: ["fileId"],
        },
      },
    ],
  };
});

// Tool handler
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "search_files") {
    const query = args.query || "mimeType='text/csv'";
    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      pageSize: 100,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(res.data.files, null, 2),
        },
      ],
    };
  }

  if (name === "read_file") {
    const { fileId } = args;
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );

    return {
      content: [
        {
          type: "text",
          text: res.data,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// HTTP server for remote access (required for Dedalus)
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  try {
    const result = await server.handleRequest(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "gdrive-mcp-server" });
});

// Start the server
async function main() {
  await authorize();
  
  app.listen(PORT, () => {
    console.log(`Google Drive MCP Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

main().catch(console.error);