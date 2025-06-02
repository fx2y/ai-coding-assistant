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
import { handleProjectUpload, handleProjectChunking, handleEmbeddingGeneration, handleAddPinnedItem, handleListPinnedItems, handleRemovePinnedItem, handleApplyDiff } from './handlers/projectHandlers.js';
import { getVectorizeInfo, testVectorizeQuery } from './handlers/debugHandlers.js';
import { handleVectorQuery } from './handlers/searchHandlers.js';
import { handleManagedContextDemo, handleTokenCountDemo } from './handlers/contextHandlers.js';
import { handleAgentReactStep, handleToolExecution, handleAgentResponseStream } from './handlers/agentHandlers.js';

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

// Project endpoints (P1-E1-S1)
app.post('/api/project/upload', handleProjectUpload);

// Project chunking endpoint (P1-E1-S2)
app.post('/api/project/:projectId/process_chunks', handleProjectChunking);

// Project embedding generation endpoint (P1-E2-S1)
app.post('/api/project/:projectId/generate_embeddings', handleEmbeddingGeneration);

// Apply diff endpoint (P3-E1-S2)
app.post('/api/project/:projectId/apply_diff', handleApplyDiff);

// Pinned context endpoints (P2-E1-S2)
app.post('/api/project/:projectId/pinned_context', handleAddPinnedItem);
app.get('/api/project/:projectId/pinned_context', handleListPinnedItems);
app.delete('/api/project/:projectId/pinned_context/:pinnedItemId', handleRemovePinnedItem);

// Search endpoints (P1-E3-S1)
app.post('/api/search/vector_query', handleVectorQuery);

// Context management demo endpoints (P2-E1-S4)
app.post('/api/context/managed_demo', handleManagedContextDemo);
app.post('/api/context/token_count', handleTokenCountDemo);

// Agent endpoints (P2-E2-S1, P2-E2-S2)
app.post('/api/agent/react_step', handleAgentReactStep);
app.post('/api/agent/execute_action', handleToolExecution);

// Streaming endpoints (P3-E2-S2, RFC-SYNC-001)
app.post('/api/agent/stream/:sessionId', handleAgentResponseStream);

// Debug endpoints (P0-E2-S2)
app.post('/api/echo', echoHandler);

// Debug endpoints for Vectorize (P1-E2-S2)
app.get('/api/debug/vectorize/info', getVectorizeInfo);
app.post('/api/debug/vectorize/query', testVectorizeQuery);

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