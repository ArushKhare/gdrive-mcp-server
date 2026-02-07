import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import http from "http";
import url from "url";
import open from "open";

const CREDENTIALS_PATH = "./credentials.json";
const TOKEN_PATH = "./token.json";

async function authenticate() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const oauth2Client = new OAuth2Client(
    client_id,
    client_secret,
    "http://localhost:3001/oauth2callback"
  );

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  console.log("Opening browser for authentication...");
  console.log("If browser doesn't open, visit this URL:", authorizeUrl);

  // Create a local server to receive the auth code
  const server = http.createServer(async (req, res) => {
    if (req.url.indexOf("/oauth2callback") > -1) {
      const qs = new url.URL(req.url, "http://localhost:3001").searchParams;
      const code = qs.get("code");

      res.end("Authentication successful! You can close this window.");
      server.close();

      // Get tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Save tokens
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log("\n✅ Token saved to", TOKEN_PATH);
      console.log("You can now start the server with: npm start");
    }
  }).listen(3001, () => {
    open(authorizeUrl);
  });
}

authenticate().catch(console.error);