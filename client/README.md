# Cloudflare AI Coding Assistant - Client

This is the Preact-based web client for the Cloudflare AI Coding Assistant, implementing RFC-UI-001 specifications.

## Features

- 🔒 **BYOK (Bring Your Own Key)** - Secure client-side API key management
- ⚡ **Fast Development** - Vite-powered development with HMR
- 🎨 **Modern UI** - Beautiful and responsive design
- 🧪 **Tested** - Comprehensive test coverage with Vitest

## Tech Stack

- **Framework**: Preact 10.x with TypeScript
- **Build Tool**: Vite 6.x
- **Testing**: Vitest with JSDOM
- **Deployment**: Cloudflare Pages
- **Styling**: CSS with modern features

## Development

### Prerequisites

- Node.js 18+ 
- npm or equivalent package manager

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage report

## Deployment

### Cloudflare Pages

The application is configured for Cloudflare Pages deployment:

1. **Create Pages Project** (one-time setup):
   ```bash
   npm run pages:create
   ```

2. **Deploy**:
   ```bash
   npm run deploy
   ```

### Live URL

The application is deployed at: https://f70617ef.ai-coding-assistant-client.pages.dev

### Build Configuration

- **Build Command**: `npm run build`
- **Build Output**: `dist/`
- **Framework**: Vite (Preact)

## Project Structure

```
client/
├── src/
│   ├── components/     # Preact components
│   ├── services/       # API services and utilities
│   ├── contexts/       # React contexts
│   ├── assets/         # Static assets
│   ├── app.tsx         # Main application component
│   └── main.tsx        # Application entry point
├── public/             # Public static assets
├── dist/               # Build output (generated)
└── wrangler.toml       # Cloudflare configuration
```

## Security

- API keys are stored only in browser localStorage
- Keys are transmitted per-request only for proxying
- No API keys are stored on servers
- Secure HTTPS-only deployment

## Implementation Notes

Implements the following RFC specifications:
- **RFC-UI-001**: Client application architecture
- **RFC-SEC-001**: BYOK security model

Built according to **P0-E2-S1** specification for Cloudflare Pages minimal web client shell. 