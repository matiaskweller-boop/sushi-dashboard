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

Cliente en `src/lib/fudo-client.ts` con cache en memoria (5 min para datos, 23hs para tokens).

### Estructura de archivos

```
src/
├── app/
│   ├── layout.tsx              # Layout HTML + fonts (DM Sans, Noto Serif JP)
│   ├── globals.css             # Tailwind + estilos globales
│   ├── page.tsx                # Dashboard principal "/"
│   ├── login/page.tsx          # Login "/login"
│   └── api/
│       ├── auth/route.ts       # POST login / DELETE logout (JWT cookie)
│       └── fudo/route.ts       # GET proxy a las 3 sucursales
├── components/
│   ├── Dashboard.tsx           # Componente principal (estado, fetch, layout)
│   ├── Header.tsx              # Branding "MASUNORI" + estado conexión
│   ├── PeriodFilter.tsx        # Filtros: Hoy / 7d / 30d / Personalizado
│   ├── KPICards.tsx            # Cards de KPIs consolidados
│   ├── SucursalCards.tsx       # Comparativo por sucursal
│   ├── HourlySalesChart.tsx    # Gráfico de líneas ventas por hora
│   ├── PaymentMethodsChart.tsx # Donut de métodos de pago
│   ├── TopProductsTable.tsx    # Top 10 productos con tabs por sucursal
│   └── ErrorBanner.tsx         # Warning si falla una sucursal
├── lib/
│   ├── auth.ts                 # JWT create/verify para sesión del dashboard
│   ├── fudo-client.ts          # Cliente API Fudo (auth, fetch, parseo JSON:API, cache)
│   ├── dashboard-data.ts       # Lógica de negocio (KPIs, gráficos, top products)
│   └── sucursales.ts           # Config de las 3 sucursales
├── types/index.ts              # Todos los tipos TypeScript
└── middleware.ts               # Protege rutas con JWT cookie
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
