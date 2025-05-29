# Project Context for AI Coding Assistant

This document provides project-specific information to assist AI models in understanding and contributing to the "Cloudflare AI Coding Assistant" codebase.

**Last Updated:** 2025-05-29

## 1. Project Overview & Purpose

*   **Project Name:** Cloudflare AI Coding Assistant
*   **Core Purpose:** A web-based AI coding assistant leveraging user-provided LLM/Embedding API keys (BYOK model), built entirely on the Cloudflare Developer Platform.
*   **Key Architectural Components:**
    *   **Client:** Thin web application hosted on Cloudflare Pages. (RFC-UI-001)
    *   **Backend Logic:** Cloudflare Workers handling API requests, indexing, agent orchestration, and external AI service proxying. (RFC-CORE-001, RFC-API-001)
    *   **Storage:**
        *   Cloudflare R2: Original code files, chunked code. (RFC-IDX-001)
        *   Cloudflare KV: Project metadata, chunk metadata, pinned context, user configurations, short-term agent state. (RFC-IDX-001, RFC-MEM-001, RFC-AGT-001, RFC-MOD-001)
        *   Cloudflare Vectorize: Storing and searching code embeddings. (RFC-IDX-001)
    *   **BYOK Integration:** All LLM and embedding API calls are proxied, using API keys provided by the user. (RFC-CORE-001, RFC-SEC-001, Spec: P0-E1-S2)

## 2. Core Technologies & Versions

*   **Cloudflare Workers:**
    *   Runtime: `workers-runtime` (latest stable)
    *   Deployment Tool: Wrangler v3.x (latest stable)
*   **Language:** TypeScript v5.x (strict mode enabled: `tsconfig.json` -> `"strict": true`)
*   **Frontend Framework:** Preact v10.x (for client-side UI components)
*   **Worker Routing:** Hono v3.x (for API endpoint routing within Workers)
*   **Key Libraries (Illustrative - to be updated as implemented):**
    *   `hono`: Worker request routing.
    *   `zod`: Data validation for API requests/responses.
    *   `diff-match-patch` (or similar): Client-side diff display, server-side diff application. (RFC-AGT-003)
    *   `tiktoken-rs` (WASM): For accurate token counting if client-side or complex server-side counting is needed. (RFC-CTX-003)
    *   `jszip` (or similar): For handling ZIP uploads on Worker. (Spec: P1-E1-S1)
*   **External APIs (User BYOK):** OpenAI, Anthropic Claude, Cohere, Jina Embeddings (user chooses).

## 3. Directory Structure

```
.
├── client/                     # Cloudflare Pages - Preact Frontend
│   ├── public/                 # Static assets (index.html, favicon)
│   ├── src/
│   │   ├── components/         # Reusable Preact components (e.g., ChatWindow.tsx, DiffViewer.tsx)
│   │   ├── services/           # API client logic (e.g., apiClient.ts - wrappers for fetch)
│   │   ├── contexts/           # Preact contexts (e.g., ApiKeyContext.tsx, ProjectContext.tsx)
│   │   ├── utils/              # Client-side utility functions
│   │   ├── styles/             # CSS modules or global styles
│   │   └── main.tsx            # Main Preact application entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts          # Or other bundler config for Preact
├── workers/                    # Cloudflare Workers - Backend Logic
│   ├── src/                    # Common entry, often where Hono app is defined or main router
│   │   ├── index.ts            # Main Worker entry point, Hono app initialization & routing
│   │   ├── handlers/           # Route-specific handler functions
│   │   │   ├── projectHandlers.ts  # /api/project/* endpoints
│   │   │   ├── searchHandlers.ts   # /api/search/* endpoints
│   │   │   ├── agentHandlers.ts    # /api/agent/* endpoints
│   │   │   └── configHandlers.ts   # /api/config/* endpoints
│   │   ├── services/           # Business logic services called by handlers
│   │   │   ├── indexingService.ts # Logic for RFC-IDX-001, P1-E1-S1, P1-E1-S2, P1-E2-S1, P1-E2-S2
│   │   │   ├── retrievalService.ts# Logic for RFC-RET-001, RFC-RET-002, P1-E3-S1
│   │   │   ├── agentService.ts   # Logic for RFC-AGT-001, P2-E2-S1
│   │   │   ├── toolExecutor.ts   # Logic for RFC-AGT-002, P2-E2-S2
│   │   │   └── contextBuilder.ts # Logic for RFC-CTX-003, P2-E1-S4
│   │   ├── tools/                # Individual agent tool implementations
│   │   │   ├── codeSearchTool.ts
│   │   │   ├── readFileTool.ts
│   │   │   └── generateEditTool.ts # Implements RFC-AGT-003
│   │   ├── lib/                  # Shared utilities, constants, types within workers
│   │   │   ├── byokProxyClient.ts# Client for the P0-E1-S2 external API proxy Worker
│   │   │   ├── kvStore.ts        # Typed wrappers for Cloudflare KV interactions
│   │   │   ├── r2Store.ts        # Typed wrappers for Cloudflare R2 interactions
│   │   │   ├── vectorizeClient.ts# Typed wrappers for Cloudflare Vectorize
│   │   │   └── errorHandler.ts   # Centralized error handling utilities
│   │   ├── types.ts              # Shared TypeScript interfaces/types for all workers
│   │   └── constants.ts          # Project-wide constants
│   ├── wrangler.toml             # Wrangler configuration for all workers
│   ├── package.json
│   └── tsconfig.json
├── docs/                       # Project documentation
│   ├── README.MD                # This file
│   ├── RFCs/                   # Directory containing all RFC documents
│   └── ARCHITECTURE.MD         # High-level architecture overview
├── tests/
│   ├── unit/                   # Unit tests (e.g., using Vitest or Jest)
│   │   ├── workers/            # Mirroring worker structure
│   │   └── client/             # Mirroring client structure
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests (e.g., using Playwright)
├── .github/                    # GitHub specific files
│   └── workflows/              # CI/CD GitHub Actions (e.g., deploy-client.yml, deploy-workers.yml)
├── .eslintignore
├── .eslintrc.js
├── .gitignore
├── .prettierignore
├── .prettierrc.js
└── package.json                # Root package.json for workspace commands, devDependencies
```

## 4. Key Data Structures & Schemas (Illustrative)

Refer to `workers/src/types.ts` for authoritative definitions.

*   **`Project`:**
    ```typescript
    interface Project {
      id: string; // Unique project identifier
      name: string;
      userId: string; // Associated user
      r2BucketPath: string; // Base path in R2 for this project's files/chunks
      kvPrefix: string; // Prefix for KV keys related to this project
      createdAt: string; // ISO Date string
    }
    ```
*   **`CodeChunk` (RFC-IDX-001):**
    ```typescript
    interface CodeChunk {
      id: string; // Unique chunk identifier (e.g., UUID)
      projectId: string;
      filePath: string; // Original file path within the project
      r2ChunkPath: string; // Path to the chunk content in R2
      startLine: number;
      endLine: number;
      charCount?: number; // For quick size estimation
      tokenCount?: number; // If pre-calculated
      embeddingId?: string; // ID of the embedding in Vectorize, if generated
      metadata?: Record<string, any>; // e.g., language, parent function/class
    }
    ```
*   **`AgentTurn` (Part of Agent History for RFC-AGT-001):**
    ```typescript
    interface AgentTurn {
      role: 'user' | 'assistant' | 'tool_observation';
      content: string; // User message, assistant thought/response, or tool output
      toolCall?: { // If role is 'assistant' and action is a tool call
        name: string;
        args: Record<string, any>;
      };
      toolResult?: { // If role is 'tool_observation'
        toolName: string;
        output: any; // Could be string, object, etc.
        isError?: boolean;
      };
      timestamp: string;
    }
    ```
*   **API Payloads:** Use Zod schemas for validation. Define these schemas alongside Hono route definitions or in `workers/src/types.ts`. Example:
    ```typescript
    // For POST /api/search/vector_query (Ref: P1-E3-S1)
    const VectorQuerySchema = z.object({
      project_id: z.string().uuid(),
      query_text: z.string().min(1),
      user_api_keys: z.object({ // Ref: RFC-SEC-001
        embeddingKey: z.string().min(1)
      }),
      top_k: z.number().int().positive().optional().default(10)
    });
    ```

## 5. Development Workflow & Tooling

*   **Version Control:** Git. Hosted on GitHub.
*   **Branching Strategy:**
    *   `main`: Production-ready code. Deploys automatically.
    *   `develop`: Integration branch for features. Staging deployments.
    *   Feature Branches: `feature/<spec_id>-<short-description>` (e.g., `feature/P1-E1-S1-project-upload`). Create from `develop`.
    *   Bugfix Branches: `fix/<issue-number>-<short-description>`. Create from `main` or `develop`.
    *   Pull Requests (PRs): Required for merging into `develop` and `main`. Require at least one approval. PRs should link to relevant issues/specs.
*   **CI/CD:** GitHub Actions (`.github/workflows/`):
    *   Linting and type checking on every push to feature branches.
    *   Unit tests on every push.
    *   Automatic deployment to Cloudflare Pages (client) and Workers (backend) on merge to `develop` (staging environment) and `main` (production environment).
*   **Local Development:**
    *   `npm run dev` (or `pnpm dev` / `yarn dev`) in the root to start client and workers concurrently (using `wrangler dev` for workers).
    *   Workers: `wrangler dev workers/src/index.ts --local --persist --var KEY:VALUE`. Use `.dev.vars` for local secrets.
    *   Client: `npm run dev --workspace=client` (or similar for chosen package manager).
*   **Testing:**
    *   **Unit Tests:** Vitest. Place test files adjacent to source files (`*.test.ts`) or in `tests/unit/`. Aim for >80% coverage for core logic.
    *   **Integration Tests:** Vitest, testing interactions between Worker modules or with local mock Cloudflare services (e.g., Miniflare for older Wrangler, or `wrangler dev --test-scheduled`).
    *   **E2E Tests (Future):** Playwright.
*   **Linting & Formatting:**
    *   ESLint: Configured in `.eslintrc.js`. Run with `npm run lint`.
    *   Prettier: Configured in `.prettierrc.js`. Run with `npm run format`.
    *   Pre-commit hooks (e.g., Husky + lint-staged) to enforce linting/formatting.

## 6. Coding Standards & Conventions

*   **Language:** TypeScript. Enable `strict: true` and other strict compiler options in `tsconfig.json`. Avoid `any` where possible; use `unknown` or define explicit types.
*   **Naming Conventions:**
    *   Files (Workers): `kebab-case.ts` (e.g., `indexing-service.ts`)
    *   Files (Preact Components): `PascalCase.tsx` (e.g., `ChatWindow.tsx`)
    *   Variables/Functions: `camelCase` (e.g., `getUserProject`)
    *   Interfaces/Types/Enums: `PascalCase` (e.g., `ProjectConfig`, `AgentRole`)
    *   Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_TOP_K_RESULTS`)
*   **Error Handling:**
    *   Define custom error classes extending `Error` (e.g., `ApiError`, `ToolExecutionError`, `ConfigError`) in `workers/src/lib/errorHandler.ts`.
    *   Workers should return consistent JSON error responses:
        ```json
        { "success": false, "error": { "message": "Descriptive error message", "code": "ERROR_CODE_SLUG", "details": { /* optional */ } } }
        ```
    *   Use Hono's error handling middleware for centralized error response formatting.
    *   Validate all external inputs (API requests, tool arguments) using Zod.
*   **Logging:**
    *   Use `console.log`, `console.info`, `console.warn`, `console.error` in Workers. These are automatically captured by Cloudflare Logs.
    *   For structured logging, stringify a JSON object:
        `console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'User project indexed', projectId: '...', fileCount: 10 }));`
    *   Avoid logging sensitive information (API keys, PII).
*   **API Design (Workers):**
    *   Follow RESTful principles where appropriate.
    *   Use Hono for routing. Define routes clearly in `workers/src/index.ts`.
    *   Version APIs if/when breaking changes are introduced (e.g., `/api/v1/...`, `/api/v2/...`).
*   **Comments:**
    *   JSDoc for all exported functions, classes, types, and complex internal functions. Describe parameters, return values, and purpose.
    *   Inline comments for complex logic, assumptions, or "why" something is done a certain way.
*   **Modularity & Reusability:**
    *   Break down complex Worker logic into smaller, single-responsibility functions or service modules (see `workers/src/services/`).
    *   Utilize shared library functions in `workers/src/lib/`.
*   **Environment Variables & Secrets (Workers):**
    *   Local development: Use `.dev.vars` at the root of the `workers/` directory. This file IS NOT committed to Git.
    *   Deployed environments (staging/production): Configure secrets via Cloudflare Dashboard or `wrangler secret put`.
    *   Access secrets/vars via the `env` binding in the Worker.
*   **Security:**
    *   User BYOK API keys are handled client-side and passed per-request to a dedicated proxy worker (P0-E1-S2). **Workers (except the proxy) MUST NOT store or log these keys.** (RFC-SEC-001)
    *   Validate all inputs rigorously (Zod).
    *   Implement rate limiting on critical API endpoints (e.g., using Cloudflare's Rate Limiting product or custom Worker logic).
    *   Sanitize any user-provided content if it's ever rendered directly as HTML (though primarily this app deals with code/text).
    *   Regularly update dependencies.

## 7. API Interaction Patterns

*   **Client -> Worker API:**
    *   Standard `fetch` requests from `client/src/services/apiClient.ts`.
    *   Content-Type: `application/json`.
    *   Authentication: JWT-based if user accounts are implemented (beyond MVP). For MVP, might be simpler or rely on Cloudflare Access for the whole app.
*   **Worker -> External BYOK APIs (LLMs, Embeddings):**
    *   All calls go through the dedicated BYOK Proxy Worker (Spec: P0-E1-S2).
    *   The calling Worker (e.g., `agentService.ts`) uses `byokProxyClient.ts` which constructs the request to the proxy, including the user's API key (obtained from the initial client request).
*   **Worker -> Cloudflare Services (KV, R2, Vectorize):**
    *   Use the bindings provided in the Worker's `env` object (e.g., `env.MY_KV_NAMESPACE`, `env.MY_R2_BUCKET`, `env.MY_VECTORIZE_INDEX`).
    *   Utilize typed wrapper functions in `workers/src/lib/` for consistent interaction patterns.

## 8. Specific Instructions for AI Contribution

*   **Code Generation - New Worker Endpoint:**
    1.  Define the Zod schema for request/response in `workers/src/types.ts` or alongside the handler.
    2.  Add the route definition to `workers/src/index.ts` using Hono (e.g., `app.post('/api/new-feature', newFeatureHandler)`).
    3.  Implement the handler function in the appropriate file within `workers/src/handlers/` (e.g., `projectHandlers.ts`).
    4.  If complex business logic is needed, create/update a service function in `workers/src/services/` and call it from the handler.
    5.  Add JSDoc comments and unit tests.
*   **Code Generation - New Agent Tool:**
    1.  Create a new file in `workers/src/tools/` (e.g., `newTool.ts`).
    2.  The tool function should accept `args: Record<string, any>` and the `env` (Worker bindings) object.
    3.  It must return a promise resolving to the tool's output (can be any serializable type).
    4.  Update `workers/src/services/toolExecutor.ts` to register the new tool and its description for the LLM prompt.
    5.  Update the tool manifest in prompts (e.g., `workers/src/services/agentService.ts` or `promptConstructor.ts`).
    6.  Add unit tests for the tool.
*   **Code Generation - New Preact Component (Client):**
    1.  Create a `.tsx` file in `client/src/components/`.
    2.  Follow existing Preact patterns (functional components, hooks).
    3.  If stateful, consider if local state is sufficient or if a Preact Context (in `client/src/contexts/`) is more appropriate.
    4.  Add props types using TypeScript interfaces.
*   **Modifying Existing Code:**
    *   Understand the relevant RFCs and spec documents linked in comments or this file.
    *   Prioritize using shared utility functions from `workers/src/lib/` or `client/src/utils/`.
    *   Maintain existing coding style and conventions.
    *   Update relevant tests or add new ones.
    *   Ensure JSDoc comments are updated if function signatures or behavior change.
*   **Testing:**
    *   All new functions/modules with logic require unit tests.
    *   For API endpoint changes, consider adding/updating integration tests.
*   **TypeScript Usage:**
    *   Be explicit with types. Avoid `any`.
    *   Leverage utility types (e.g., `Partial`, `Pick`, `Omit`) where appropriate.
    *   Ensure generated code passes `tsc --noEmit` and `eslint .`.
*   **Referencing RFCs:** When implementing features directly tied to an RFC, include a comment like `// Implements RFC-XXX-YYY` or `// See RFC-ABC-001 for rationale`.