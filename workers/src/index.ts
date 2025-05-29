/**
 * Main Cloudflare Worker entry point
 * Implements RFC-API-001: Core Backend API Design
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { errorHandler, requestIdMiddleware } from './lib/error-handler.js';
import { 
  proxyExternalApiHandler, 
  proxyHealthHandler, 
  proxySupportedServicesHandler 
} from './handlers/proxy-handlers.js';
import { echoHandler } from './handlers/debug-handlers.js';

// Initialize Hono app with environment type
const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

// Global middleware
app.use('*', cors({
  origin: '*', // Configure appropriately for production
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use('*', requestIdMiddleware());
app.use('*', errorHandler());

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    message: 'AI Coding Assistant Workers API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoints (P0-E1-S2)
app.post('/api/proxy/external', proxyExternalApiHandler);
app.get('/api/proxy/health', proxyHealthHandler);
app.get('/api/proxy/services', proxySupportedServicesHandler);

// Debug endpoints (P0-E2-S2)
app.post('/api/echo', echoHandler);

// Fallback for unmatched routes
app.notFound((c) => {
  return c.json({
    error: 'NotFound',
    message: 'The requested endpoint was not found',
    path: c.req.path
  }, 404);
});

// Export the Cloudflare Worker fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
}; 