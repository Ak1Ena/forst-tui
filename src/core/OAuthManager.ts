import http from 'http';
import { exec } from 'child_process';
import crypto from 'crypto';
import { configManager } from './ConfigManager.js';

interface OAuthConfig {
    authorizeUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes: string[];
    redirectUri: string;
}

const PROVIDERS: Record<string, OAuthConfig> = {
    google: {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: process.env.GOOGLE_CLIENT_ID || '', // User must provide
        scopes: ['https://www.googleapis.com/auth/generative-language'],
        redirectUri: 'http://localhost:3000/callback'
    },
    openai: {
        authorizeUrl: 'https://auth.openai.com/oauth/authorize',
        tokenUrl: 'https://auth.openai.com/oauth/token',
        clientId: process.env.OPENAI_CLIENT_ID || '', // User must provide
        scopes: ['openid', 'profile', 'email'],
        redirectUri: 'http://localhost:3000/callback'
    },
    anthropic: {
        // Anthropic primarily uses the Claude Code flow or direct oat01 tokens
        authorizeUrl: 'https://api.anthropic.com/v1/oauth/authorize',
        tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
        clientId: process.env.ANTHROPIC_CLIENT_ID || '', // User must provide
        scopes: ['messages'],
        redirectUri: 'http://localhost:3000/callback'
    }
};

export class OAuthManager {
    private server: http.Server | null = null;

    private generateCodeVerifier() {
        return crypto.randomBytes(32).toString('base64url');
    }

    private generateCodeChallenge(verifier: string) {
        return crypto.createHash('sha256').update(verifier).digest('base64url');
    }

    public async login(providerId: string): Promise<void> {
        const oauthConfig = PROVIDERS[providerId];
        if (!oauthConfig || !oauthConfig.clientId) {
            throw new Error(`OAuth Client ID for ${providerId} not found in environment variables.`);
        }

        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);
        const state = crypto.randomBytes(16).toString('hex');

        const authUrl = new URL(oauthConfig.authorizeUrl);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', oauthConfig.clientId);
        authUrl.searchParams.append('redirect_uri', oauthConfig.redirectUri);
        authUrl.searchParams.append('scope', oauthConfig.scopes.join(' '));
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        console.log(`Opening browser for ${providerId} login...`);
        // Use standard open command depending on OS
        const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        exec(`${openCmd} "${authUrl.toString()}"`);

        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                const url = new URL(req.url!, `http://${req.headers.host}`);
                const code = url.searchParams.get('code');
                const returnedState = url.searchParams.get('state');

                if (returnedState !== state) {
                    res.end('Invalid state');
                    return;
                }

                if (code) {
                    try {
                        const tokenResponse = await fetch(oauthConfig.tokenUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                grant_type: 'authorization_code',
                                client_id: oauthConfig.clientId,
                                code,
                                redirect_uri: oauthConfig.redirectUri,
                                code_verifier: codeVerifier,
                                ...(oauthConfig.clientSecret ? { client_secret: oauthConfig.clientSecret } : {})
                            })
                        });

                        const tokens = await tokenResponse.json() as { 
                            access_token?: string; 
                            refresh_token?: string; 
                            expires_in?: number; 
                        };
                        if (tokens.access_token) {
                            configManager.updateProvider(providerId, {
                                authType: 'oauth',
                                accessToken: tokens.access_token,
                                refreshToken: tokens.refresh_token,
                                tokenExpiry: Date.now() + ((tokens.expires_in || 3600) * 1000)
                            });
                            res.end('Login successful! You can close this tab and return to the TUI.');
                            this.server?.close();
                            resolve();
                        } else {
                            res.end('Failed to exchange token');
                            reject(new Error('Token exchange failed'));
                        }
                    } catch (error) {
                        res.end('Error: ' + error);
                        reject(error);
                    }
                }
            }).listen(3000);
        });
    }
}

export const oauthManager = new OAuthManager();
