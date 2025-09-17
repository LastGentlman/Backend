# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a full-stack order management application with two main components:

### Frontend (mercury-app/)
- **Framework**: React 19 with TanStack Router for file-based routing
- **Build Tool**: Vite with TypeScript
- **UI Library**: Shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS
- **State Management**: TanStack Store and React Query for data fetching
- **Forms**: React Hook Form with Zod validation
- **PWA**: Configurable Progressive Web App using Vite PWA plugin
- **Database**: Supabase client integration
- **Payments**: Stripe integration
- **Analytics**: Sentry error tracking

### Backend (Backend/)
- **Runtime**: Deno 2.2.14
- **Framework**: Hono web framework
- **Database**: Supabase with PostgreSQL
- **Validation**: Zod schemas for all critical endpoints
- **Security**: Comprehensive validation, CSRF protection, XSS prevention
- **Integrations**: WhatsApp, AWS S3, Stripe, Resend email

## Development Commands

### Frontend (mercury-app/)
```bash
# Development server
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck

# Linting and formatting
npm run lint
npm run format

# Testing
npm run test                    # Watch mode
npm run test:run               # Single run
npm run test:coverage          # With coverage
npm run test:auth             # Authentication tests
npm run test:components       # Component tests
npm run test:pwa              # PWA tests

# PWA management
npm run pwa:disable           # Disable PWA
npm run pwa:enable            # Enable PWA
npm run build:pwa             # Build with PWA enabled
npm run build:no-pwa          # Build without PWA

# Full production pipeline
npm run build:production      # Clean, typecheck, lint, test, build

# Add Shadcn components
pnpx shadcn@latest add button
```

### Backend (Backend/)
```bash
# Development server with watch mode
deno task dev

# Production server
deno task start

# Testing
deno task test

# Code quality
deno task lint
deno task fmt
deno task check

# Build/cache dependencies
deno task build
```

## Architecture Overview

### Frontend Architecture
- **File-based routing** with TanStack Router in `src/routes/`
- **Component architecture** with reusable UI components in `src/components/`
- **Service layer** for API communication in `src/services/`
- **Custom hooks** for business logic in `src/hooks/`
- **Type-safe environment variables** using T3 Env in `src/env.ts`
- **Offline-first design** with service worker and local storage
- **Authentication flow** integrated with Supabase Auth

### Backend Architecture
- **Layered architecture** with routes, middleware, services, and utilities
- **Security-first design** with 13/15 critical endpoints having Zod validation
- **Middleware pipeline** for authentication, CORS, rate limiting, and validation
- **Service layer** for business logic separation
- **Comprehensive monitoring** with security logging and WhatsApp alerts
- **Database migrations** for schema management

### Key Integration Points
- **Authentication**: Supabase Auth handles user management for both frontend and backend
- **Real-time data**: Supabase real-time subscriptions for live updates
- **Offline sync**: Frontend caches data locally and syncs with backend when online
- **File uploads**: Direct to AWS S3 with signed URLs from backend
- **Payment processing**: Stripe integration with webhook handling
- **Notifications**: Push notifications and WhatsApp integration

## Important Configuration

### Environment Variables
Frontend requires:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_PWA_DISABLED` (true/false)

Backend requires:
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`
- WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- AWS: S3 credentials for file uploads

### Development Proxy
Frontend development server proxies `/api` requests to `http://localhost:3030` (Backend server).

### Security Features
- Input validation with Zod on all critical endpoints
- CSRF protection with token validation
- XSS protection with content sanitization
- Rate limiting on authentication endpoints
- Comprehensive security logging and monitoring
- Automated WhatsApp alerts for security events

## Testing Strategy
- Unit tests for utilities and pure functions
- Component tests with React Testing Library
- Integration tests for authentication flows
- PWA functionality tests
- Backend API endpoint tests with Deno's built-in test runner

## Deployment Notes
- Frontend builds to `dist/` and can be deployed to static hosting
- Backend deploys to Deno Deploy with automatic deployments configured
- PWA can be enabled/disabled via environment variable
- Security monitoring includes production alerts via WhatsApp

This codebase follows security-first development practices with comprehensive validation, monitoring, and offline-first architecture for reliable order management.