import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import express from "express";

const PORT = process.env.PORT || 3000;

// Read from environment variables or files (for local development)
let credentials, token;

if (process.env.CREDENTIALS_JSON && process.env.TOKEN_JSON) {
  console.log("Reading credentials from environment variables");
  credentials = JSON.parse(process.env.CREDENTIALS_JSON);
  token = JSON.parse(process.env.TOKEN_JSON);
} else {
  console.log("Reading credentials from files");
  const CREDENTIALS_PATH = process.env.GDRIVE_CREDS_PATH || "./credentials.json";
  const TOKEN_PATH = process.env.GDRIVE_TOKEN_PATH || "./token.json";
  credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  token = JSON.parse(fs.readFileSync(TOKEN_PATH));
}

// Initialize OAuth2 client
let oauth2Client;
let drive;

async function authorize() {
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  oauth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  oauth2Client.setCredentials(token);

  drive = google.drive({ version: "v3", auth: oauth2Client });
  console.log("✅ Google Drive authorized successfully");
}

// Create Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    server: "gdrive-mcp-server",
    version: "1.0.0"
  });
});

// MCP Tools List endpoint
app.post("/tools/list", async (req, res) => {
  try {
    res.json({
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
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MCP Tools Call endpoint
app.post("/tools/call", async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    if (name === "search_files") {
      const query = args?.query || "mimeType='text/csv'";
      const result = await drive.files.list({
        q: query,
        fields: "files(id, name, mimeType, modifiedTime, size)",
        pageSize: 100,
      });

      return res.json({
        content: [
          {
            type: "text",
            text: JSON.stringify(result.data.files, null, 2),
          },
        ],
      });
    }

    if (name === "read_file") {
      const { fileId } = args;
      
      if (!fileId) {
        return res.status(400).json({ error: "fileId is required" });
      }

      const result = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
      );

      return res.json({
        content: [
          {
            type: "text",
            text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
          },
        ],
      });
    }

    res.status(400).json({ error: `Unknown tool: ${name}` });
  } catch (error) {
    console.error("Error calling tool:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generic MCP endpoint (for compatibility)
app.post("/mcp", async (req, res) => {
  try {
    const { method, params } = req.body;

    if (method === "tools/list") {
      return res.json({
        tools: [
          {
            name: "search_files",
            description: "Search for files in Google Drive",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
              },
            },
          },
          {
            name: "read_file",
            description: "Read file contents from Google Drive",
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
      });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;

      if (name === "search_files") {
        const query = args?.query || "mimeType='text/csv'";
        const result = await drive.files.list({
          q: query,
          fields: "files(id, name, mimeType, modifiedTime, size)",
          pageSize: 100,
        });

        return res.json({
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data.files, null, 2),
            },
          ],
        });
      }

      if (name === "read_file") {
        const { fileId } = args;
        const result = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "text" }
        );

        return res.json({
          content: [
            {
              type: "text",
              text: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
            },
          ],
        });
      }
    }

    res.status(400).json({ error: `Unknown method: ${method}` });
  } catch (error) {
    console.error("MCP error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
async function main() {
  try {
    await authorize();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Google Drive MCP Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 MCP endpoint: http://localhost:${PORT}/mcp`);
      console.log(`📋 Tools list: http://localhost:${PORT}/tools/list`);
      console.log(`⚡ Tools call: http://localhost:${PORT}/tools/call\n`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

main();