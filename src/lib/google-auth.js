const { BrowserWindow } = require('electron');
const { google } = require('googleapis');
const keytar = require('keytar');
const crypto = require('crypto');

const SERVICE_NAME = 'RRightclickrr';
const ACCOUNT_NAME = 'google-oauth-tokens';

// You'll need to create these at console.cloud.google.com
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:8234/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

class GoogleAuth {
  constructor(store) {
    this.store = store;
    this.oauth2Client = null;
    this.tokens = null;
    this.initClient();
  }

  initClient() {
    this.oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    this.oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        this.saveTokens(tokens);
      }
      this.tokens = tokens;
    });
  }

  async loadTokens() {
    try {
      const encrypted = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (encrypted) {
        const decrypted = this.decrypt(encrypted);
        this.tokens = JSON.parse(decrypted);
        this.oauth2Client.setCredentials(this.tokens);
        return true;
      }
    } catch (error) {
      // Failed to load tokens - ignore silently
    }
    return false;
  }

  async saveTokens(tokens) {
    try {
      const encrypted = this.encrypt(JSON.stringify(tokens));
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, encrypted);
      this.tokens = tokens;
    } catch (error) {
      // Failed to save tokens - ignore silently
    }
  }

  async clearTokens() {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
      this.tokens = null;
    } catch (error) {
      // Failed to clear tokens - ignore silently
    }
  }

  encrypt(text) {
    const key = crypto.scryptSync('rrightclickrr-secret', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const key = crypto.scryptSync('rrightclickrr-secret', 'salt', 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  isAuthenticated() {
    return this.tokens !== null && this.tokens.access_token !== undefined;
  }

  async authenticate() {
    // Try to load existing tokens first
    const hasTokens = await this.loadTokens();
    if (hasTokens && this.isAuthenticated()) {
      // Verify tokens are still valid
      try {
        await this.oauth2Client.getAccessToken();
        return true;
      } catch (error) {
        // Tokens expired, need to re-auth
        await this.clearTokens();
      }
    }

    // Start OAuth flow
    return new Promise((resolve, reject) => {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      });

      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        },
        title: 'Sign in to Google'
      });

      // Create local server to handle callback
      const http = require('http');
      const url = require('url');

      const server = http.createServer(async (req, res) => {
        const queryParams = url.parse(req.url, true).query;

        if (queryParams.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #2C6E49; color: white;">
                <div style="text-align: center;">
                  <h1>Success!</h1>
                  <p>You can close this window.</p>
                </div>
              </body>
            </html>
          `);

          try {
            const { tokens } = await this.oauth2Client.getToken(queryParams.code);
            this.oauth2Client.setCredentials(tokens);
            await this.saveTokens(tokens);
            authWindow.close();
            server.close();
            resolve(true);
          } catch (error) {
            authWindow.close();
            server.close();
            reject(error);
          }
        } else if (queryParams.error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #c0392b; color: white;">
                <div style="text-align: center;">
                  <h1>Error</h1>
                  <p>${queryParams.error}</p>
                </div>
              </body>
            </html>
          `);
          authWindow.close();
          server.close();
          reject(new Error(queryParams.error));
        }
      });

      server.listen(8234, () => {
        authWindow.loadURL(authUrl);
      });

      authWindow.on('closed', () => {
        server.close();
      });
    });
  }

  async signOut() {
    if (this.tokens && this.tokens.access_token) {
      try {
        await this.oauth2Client.revokeToken(this.tokens.access_token);
      } catch (error) {
        // Failed to revoke token - ignore silently
      }
    }
    await this.clearTokens();
    this.oauth2Client.setCredentials({});
  }

  getClient() {
    return this.oauth2Client;
  }
}

module.exports = { GoogleAuth };
