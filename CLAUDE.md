# Masunori Dashboard

Dashboard web para el restaurante de sushi Masunori. Conecta con Fudo (POS gastronómico) vía su API REST para mostrar ventas, KPIs y métricas de las 3 sucursales.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS** para estilos
- **Recharts** para gráficos
- **jose** para JWT auth del dashboard
- **date-fns** para manejo de fechas
- Deploy target: **Vercel**

## Comandos

- `npm run dev` — servidor de desarrollo (necesita Node en PATH, ver `start-dev.sh`)
- `npm run build` — build de producción
- `npm run start` — servir build de producción
- `npm run lint` — linter

## Arquitectura

### Sucursales

3 sucursales, cada una con cuenta separada en Fudo:
- **Palermo** (id: `palermo`, color: `#2E6DA4`)
- **Belgrano** (id: `belgrano`, color: `#10B981`)
- **Puerto Madero** (id: `puerto`, color: `#8B5CF6`)

Configuradas en `src/lib/sucursales.ts`. Credenciales en `.env.local`.

### API de Fudo

- **Auth centralizada**: `POST https://auth.fu.do/api` con `{apiKey, apiSecret}` → devuelve JWT (expira en 24hs)
- **Base URL**: `https://api.fu.do/v1alpha1`
- **Formato**: JSON:API (resources con `type`, `id`, `attributes`, `relationships`, `included`)
- **Paginación**: `page[size]` (max 500) y `page[number]` (desde 1)
- **Sin filtros de fecha**: La API NO soporta query params `from/to`. Se usa `sort=-createdAt` y se filtra en el server hasta salir del rango.
- **Includes**: `include=items,payments.paymentMethod` para traer items, pagos y métodos de pago en una sola request.
- El endpoint `/payment_methods` no existe (404). Los métodos de pago se obtienen via include en sales.
- **Categorías**: Endpoint `/product-categories` (con guión, NO `/categories` que da 404). Relación en productos: `productCategory`.
- **Rate limiting**: 1s delay entre requests por sucursal. Retry con backoff exponencial para 429s.
- **Sucursales en paralelo**: Cada sucursal tiene su propia queue de rate limiting, pueden correr en paralelo con `Promise.all`.

Cliente en `src/lib/fudo-client.ts` con cache en memoria (5 min para datos, 23hs para tokens).
- **Timezone**: Fechas se construyen con `-03:00` (Argentina). "Hoy" = día calendario 00:00-23:59 AR.

### Estructura de archivos

```
src/
├── app/
│   ├── layout.tsx              # Layout HTML + fonts + CurrencyProvider
│   ├── globals.css             # Tailwind + estilos globales
│   ├── page.tsx                # Dashboard principal "/"
│   ├── login/page.tsx          # Login "/login"
│   ├── historico/page.tsx      # Histórico mensual con gráficos
│   ├── kpis/page.tsx           # KPIs avanzados + heatmap
│   └── api/
│       ├── auth/route.ts       # POST login / DELETE logout (JWT cookie)
│       ├── fudo/route.ts       # GET proxy a las 3 sucursales
│       ├── fudo/kpis/route.ts  # GET KPIs avanzados
│       ├── fudo/products/route.ts # GET product analytics por categoría
│       ├── historico/route.ts  # GET datos históricos + live merge
│       └── exchange-rates/route.ts # GET tipo de cambio dólar blue
├── components/
│   ├── Dashboard.tsx           # Componente principal (estado, fetch, layout)
│   ├── Header.tsx              # Branding + estado conexión + toggle ARS/USD
│   ├── Navigation.tsx          # Tabs: Dashboard, KPIs, Histórico
│   ├── PeriodFilter.tsx        # Filtros: Hoy / 7d / 30d / Personalizado
│   ├── KPICards.tsx            # Cards de KPIs consolidados
│   ├── SucursalCards.tsx       # Comparativo por sucursal
│   ├── HourlySalesChart.tsx    # Gráfico de líneas ventas por hora
│   ├── PaymentMethodsChart.tsx # Donut de métodos de pago
│   ├── TopProductsTable.tsx    # Top productos con tabs por sucursal
│   ├── ProductAnalytics.tsx    # Categorías: donut + barras por sucursal
│   ├── RevenueHeatmap.tsx      # Heatmap hora × día de la semana
│   └── ErrorBanner.tsx         # Warning si falla una sucursal
├── lib/
│   ├── auth.ts                 # JWT create/verify para sesión del dashboard
│   ├── fudo-client.ts          # Cliente API Fudo (auth, fetch, parseo JSON:API, cache, categorías)
│   ├── dashboard-data.ts       # Lógica de negocio (KPIs, gráficos, products, live summaries)
│   ├── sucursales.ts           # Config de las 3 sucursales
│   ├── format.ts               # formatMoney/formatMoneyShort con soporte ARS/USD
│   ├── exchange-rates.ts       # Servicio dólar blue (bluelytics API)
│   └── CurrencyContext.tsx     # React context para toggle ARS/USD global
├── types/index.ts              # Todos los tipos TypeScript
└── middleware.ts               # Protege rutas con JWT cookie
data/
└── historico/resumen-mensual.json  # Datos pre-septiembre 2025 (exportados de Fudo)
```

### Autenticación del dashboard

Login simple con usuario/contraseña via variables de entorno (`DASHBOARD_USER`, `DASHBOARD_PASSWORD`). Sesión con JWT en cookie httpOnly. Middleware protege todas las rutas excepto `/login` y `/api/auth`.

## Variables de entorno

```
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=xxx
NEXTAUTH_SECRET=xxx

FUDO_PALERMO_API_KEY=xxx
FUDO_PALERMO_API_SECRET=xxx
FUDO_BELGRANO_API_KEY=xxx
FUDO_BELGRANO_API_SECRET=xxx
FUDO_PUERTO_API_KEY=xxx
FUDO_PUERTO_API_SECRET=xxx
```

## Notas importantes

- Los tokens de Fudo se obtienen de `soporte@fu.do` indicando cuenta y usuario.
- Mobile-first: diseñado para uso en celular (80% del tiempo).
- Si una sucursal falla, las otras se muestran normalmente + banner de warning.
- Los montos de Fudo vienen en centavos (ej: `136400.0` = $136.400). Verificar si el formateo es correcto según la moneda.
- Node.js instalado manualmente en `/Users/matiaskw/.local/node/bin/` (macOS 12 no tiene brew node).
- **Horario del restaurante**: 12:00 a 00:00 (corrido, no hay turnos separados).
- **Dólar blue**: Toggle ARS/USD en header. Usa promedio mensual de bluelytics.com.ar para datos históricos.
- **Histórico**: Merge de JSON estático (pre-sept 2025) + datos live de Fudo (oct 2025→hoy). Cache 30 min.
- **Sucursales**: Palermo (22 asientos), Belgrano (32), Puerto Madero (46). Seats configurados en sucursales.ts.

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
