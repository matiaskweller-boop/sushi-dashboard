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

### Navegación v3.0

3 entradas en la barra principal:
- **VENTAS** (dropdown): Dashboard (/), KPIs (/kpis), Histórico (/historico)
- **P&L** (link directo): /administracion/pnl
- **ADMINISTRACIÓN** (link directo a /administracion): página índice con cards agrupadas
  - ERP: Egresos, Proveedores, Caja diaria, Descuentos, Alertas, Carga facturas (OCR)
  - Productos: Consumo, Stock (read-only)
  - Carta: Menú, Competencia

P&L NO debe aparecer en la página índice de Administración — solo se accede vía la barra principal.

### Control de acceso a Administración (sistema de permisos por usuario)

El sistema de permisos vive en **`MASUNORI_ERP_CONFIG / Usuarios`** (Google Sheet).

Schema de la tab Usuarios:
| Email | Nombre | Rol | Sucursales | Permisos | Activo | Creado |

- **Login global**: `ALLOWED_EMAILS` env var controla quién puede loguearse al dashboard.
- **Permisos granulares**: por user en la tab Usuarios. Columna Permisos contiene:
  - `*` = acceso total (admin)
  - lista CSV: `pnl,egresos,facturas` = solo esas secciones
  - vacío = sin acceso a Administración (solo Ventas)
- **Owner único**: `matiaskweller@gmail.com` (constante `OWNER_EMAIL` en `src/lib/admin-permissions.ts`). Tiene acceso a TODO siempre, incluso si no está en la tab. Es el único que puede modificar usuarios.

Permisos válidos (`ALL_PERMISSIONS` en admin-permissions.ts):
`ventas, pnl, egresos, deuda_locales, oficina, proveedores, caja, descuentos, alertas, facturas, facturas_aprobar, consumo, stock, menu, competencia, efectivo`

**Permisos implícitos** (un permiso padre da acceso a sub-secciones):
- `egresos` → implica `deuda_locales` + `oficina` (backward compat).
- Definido en `PERM_IMPLIES` (src/lib/admin-permissions.ts). Verificado dentro de `userHasPermission()`.

## ⚠️ CHECKLIST OBLIGATORIO al crear cualquier sección nueva en /administracion

**Cada vez que agregues una página/módulo nuevo, hacer SIEMPRE las 5 cosas:**

1. **Agregar el permiso a `ALL_PERMISSIONS`** en `src/lib/admin-permissions.ts`.
2. **Agregar la etiqueta a `PERM_LABELS`** en `src/app/administracion/usuarios/page.tsx` — con emoji + label legible (ej: `🏢 Oficina (gastos overhead)`). Si no, aparece como string crudo en el panel de permisos del owner.
3. **Agregar el path al `PATH_PERMS`** en `src/app/administracion/layout.tsx` mapeando prefix → permiso.
4. **Usar `requirePermissionApi(request, "nuevo_perm")`** en cada route handler `/api/erp/*/route.ts` de la sección.
5. **Agregar la card al landing** en `src/app/administracion/page.tsx` (`MODULES` array) con icon/title/desc/group/status.

**Opcional pero recomendado:**
- Si el módulo es una variante o sub-sección de uno existente (ej. Oficina deriva de Egresos), agregarlo a `PERM_IMPLIES` para que el padre lo otorgue automáticamente y no rompa users existentes.
- Documentar el módulo en este CLAUDE.md con su propia sección.

Si faltó cualquiera de los 5 pasos, el owner verá un permiso sin label, los users no podrán acceder, o la card no aparecerá en /administracion.

Permisos especiales:
- `_users` = puede gestionar usuarios — **solo el owner** lo tiene.
- `logged_in` = cualquier usuario activo (sirve para landings)
- `facturas` vs `facturas_aprobar`:
  - `facturas` puede subir facturas (van a cola pendiente, NO a EGRESOS directo)
  - `facturas_aprobar` puede aprobar facturas pendientes (las exporta a EGRESOS)
  - Owner y admin (`*`) tienen ambos implícitamente.

### Flujo de carga de facturas (cola con aprobación)

1. **Lourdes** (user con `facturas`) sube foto/PDF → OCR extrae → revisa datos → submit
2. La factura va a la tab **`Facturas`** del workbook MASUNORI_ERP_CONFIG con `Estado=pendiente`
3. **Daniela / matias** (con `facturas_aprobar` o `*`) entra a `/administracion/facturas`, ve la cola pendiente
4. Revisa cada factura, edita campos si es necesario, click "Aprobar"
5. Al aprobar: estado pasa a `aprobada` + se exporta una fila a la tab `EGRESOS` de la sucursal correspondiente
6. Si rechaza: estado pasa a `rechazada` con motivo (NO va a EGRESOS)

Schema tab `Facturas` (32 cols A-AF):
ID | SubmittedAt | SubmittedBy | Sucursal | Año | TipoComprobante | NroComprobante | Proveedor | RazonSocial | CUIT | FechaIngreso | FechaFC | FechaVto | FechaPago | Rubro | Insumo | Subtotal | IVA | OtrosImpuestos | Total | MetodoPago | FotoURL | Confianza | NotasOCR | Estado | ReviewedBy | ReviewedAt | NotasReview | ItemsJSON | ImpuestosJSON | Moneda | TipoCambio

APIs:
- `POST /api/erp/ocr` — extrae datos de imagen/PDF con Gemini
- `POST /api/erp/facturas/submit` — guarda como pendiente
- `GET /api/erp/facturas?estado=&scope=` — lista facturas
- `POST /api/erp/facturas/approve` — aprueba + exporta a EGRESOS
- `POST /api/erp/facturas/reject` — rechaza con motivo
- `PATCH /api/erp/facturas/update` — edita campos (mientras esté pendiente)

OCR (Gemini) extrae además:
- subtotal SIN impuestos
- iva (suma de alícuotas) + array `impuestos: [{tipo, monto, alicuota}]`
- otros impuestos (IIBB, percepciones, etc.)
- total
- por item: descripcion, cantidad, **unidad** (kg/lt/ud/g/ml), precioUnitario (sin IVA), subtotal (sin IVA), alicuotaIva, montoIva
- fechaVto si aparece
- **moneda** ("ARS" / "USD") y **tipoCambio** si la factura está en USD

### MASTER PROVEEDORES (ficha editable por proveedor)

Tab `MASTER PROVEEDORES` dentro de `MASUNORI_ERP_CONFIG` (sheet `1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g`). Es la fuente de verdad de la info comercial/contacto/banco de cada proveedor.

Schema (17 cols A-Q):
| ID | Nombre Sociedad | Nombre Fantasia | Contacto | CUIT | Forma de Pago | Alias o CBU | Titular Cuenta | Banco | Nro Cuenta Bancaria | Rubro | Plazo de Pago | Mail | Corroborado | Notas | ActualizadoEn | ActualizadoPor |

Inicialmente se migran 88 proveedores desde `MADERO DEUDA AL DIA` (la fuente que el equipo replica manualmente a las otras sucursales). Una vez creado el MASTER, el panel `/administracion/proveedores`:
- Hace JOIN entre la deuda agregada (DEUDA AL DIA de las 3 sucursales) y el MASTER por `nombreFantasia`/`razonSocial`.
- Muestra info enriquecida (CUIT, mail, contacto, etc) en el expandido de cada fila.
- Permite **editar la ficha master** desde el botón "✏️ Editar ficha master" o crear nueva ficha con "+ Nuevo proveedor".
- Marca proveedores que están en deuda pero NO en master con badge "⚠️ sin master".
- Tilde `Corroborado` para validar manualmente.
- Filtro `⚠️ sin corroborar` para encontrar fichas pendientes.
- Badge "✓" verde cuando los datos están corroborados.

APIs:
- `GET /api/erp/proveedores/master` — lista completa del master (cache 5 min). Requiere `facturas` o `proveedores`.
- `POST /api/erp/proveedores/master` — upsert por id o por nombreFantasia. Requiere `proveedores`. Body completo de la ficha.
- `DELETE /api/erp/proveedores/master?id=PROV-XXX` — limpia la fila (no la borra para mantener row indices).

El picker de proveedores en `/administracion/facturas` ahora también lee de este master.

Cache: 5 minutos in-memory. Cualquier upsert/delete invalida el cache automáticamente.

Variable de entorno opcional: `ERP_CONFIG_SHEET_ID` (ya existe, mismo sheet que Usuarios y demás).

### Integración Proveedores ↔ Deuda Locales

`/administracion/proveedores` consume `analyzeDeudaLocales` desde `lib/deuda-locales.ts` y muestra al tope:
- `🔁 Movimientos entre locales`: cant. movimientos, total, sin contraparte, saldos netos.
- Saldos netos destacados (deudor → acreedor con colores) con link a la página dedicada.

**⚠️ Importante — no hay auto-detección de "duplicados" o "centralizados":** Cada sucursal opera independientemente, paga sus propias facturas y registra sus propios egresos. Aunque compartan proveedores (NUNOS, PESCE, FUDO, etc.), no hay duplicación contable. La detección automática vieja basada en `mismo proveedor + fecha + monto` producía falsos positivos y fue removida.

### Deuda entre locales (`/administracion/deuda-locales`)

Módulo para visualizar movimientos y deudas netas entre Palermo, Belgrano y Madero. Cada local registra los gastos compartidos a su manera, así que el sistema detecta los movimientos por **patrones explícitos** sobre las columnas Rubro/Insumo/Proveedor de EGRESOS de cada sucursal.

**Patrones detectados como inter-sucursal**:
- `PAGO POR GASTO HECHO POR (MADERO|PALERMO|BELGRANO)` — Madero usa esto en su rubro
- `deuda con (palermo|belgrano|madero)`
- `envío de X de (sucursal) a (sucursal)`
- `flete que pagó (sucursal)`
- `(uber|envío) entre locales`

Para cada movimiento detectado:
- Sucursal de origen = el sheet en el que apareció
- Sucursal contraparte = mención explícita a otra sucursal en el texto (puede quedar `null`)

**Outputs del API `/api/erp/deuda-locales?year=2026`**:
- `movimientos`: lista de filas inter-sucursal con monto, fechas, estadoPago
- `matriz[origen][destino]`: total bruto registrado de A → B
- `saldosNetos`: si A→B = X y B→A = Y, neto = max(0, X - Y) hacia el ganador
- ~~`centralizados`~~: **deprecado**. `lib/deuda-locales.ts` aún lo computa internamente pero ninguna UI lo usa. Cada sucursal paga independientemente sus facturas; misma fecha+monto+proveedor en >1 sucursal es coincidencia (precios estandarizados), no duplicación.

**Vista de la página** tiene 2 tabs:
- **Resumen**: saldos netos destacados (deudor → acreedor), matriz 3×3, stats por sucursal
- **Movimientos**: tabla detallada con filtros (search, sucursal)

Permisos: requiere `egresos`. Solo el aprobador / admin debería verlo.

Si la factura es en dólares, el sistema soporta conversión automática:

1. OCR detecta `moneda: "USD"` y trata de extraer `tipoCambio` impreso en la factura.
2. UI muestra un toggle "💵 Factura en USD" en upload Y en panel de aprobación.
3. Cuando está activo, todos los montos del form se interpretan en USD y se muestra un preview de conversión a ARS usando el TC.
4. Al **aprobar**, los valores que se exportan a EGRESOS están convertidos a ARS (`monto × tipoCambio`). Cantidad y unidad NO se convierten.
5. Si el approver intenta aprobar una factura en USD sin TC > 0, el endpoint devuelve 400 con error.
6. El TC queda guardado en la columna `TipoCambio` de la tab Facturas (auditoría).

Convenciones:
- `moneda` se guarda como string "ARS" o "USD" (col AE)
- `tipoCambio` se guarda como número (col AF). Default 1 para ARS.
- Aplica a TODOS los montos: items, impuestos, totales.

### Efectivo y más — retiros + consumos de socios (`/administracion/efectivo-y-mas`)

Modulo para visualizar y cargar movimientos de socios (retiros en efectivo, consumos en el restaurante, transferencias). Toma datos del archivo Google Drive **"efectivo y mas"** (`1x8ZI8qIDcHitHJA6Hadd3VtdZNwPL4h0pwOxyUghdw0`), tab **`RETIROS+CONSUMOS SOCIOS`**.

Schema del sheet (cols A-H):
| FECHA | QUIEN HIZO EN MOV | LOCAL | VALOR PESOS | VALOR DOLAR | CAJA | MEDIO DE PAGO | COMO SE IMPUTA |

Socios usuales: MATIAS KWELLER, VALENTIN TOBAL, LUCAS TOBAL, Agustin Tobal, ENRICO MARTELLA, GABRIELA GERENTE.

API:
- `GET /api/erp/efectivo-y-mas?from=YYYY-MM-DD&to=YYYY-MM-DD` — lista movimientos filtrados + cards por socio con totales/desgloses.
- `POST /api/erp/efectivo-y-mas` — agrega un nuevo movimiento al sheet (append en cols A-H, formato fecha D/M/YYYY).

UI:
- Filtros por rango de fechas (default mes actual) + filtro por sucursal.
- Cards por socio: total pesos, total dólar, mini desglose por sucursal (Palermo/Belgrano/Madero).
- Click en card → expande mostrando desglose por caja, medio de pago, y tabla detallada de todos los movimientos del socio.
- Botón "+ Nuevo movimiento" → form con autocomplete (datalists con socios/cajas/medios existentes).

Permisos: requiere permiso `efectivo`. Owner y `*` lo tienen implícito.

Variable de entorno opcional: `SHEET_EFECTIVO_Y_MAS` (si no se setea, usa el ID hardcodeado).

### Editor de carta (`/menu`) — etiquetas/badges por item

Cada item del menú soporta un campo opcional `tag` (string) que se renderiza como badge dorado al lado del nombre.
Schema:
```ts
interface MenuItem { id; name; price; description?; tag?; fudoMatch? }
```

UI:
- En modo edición, el panel del item incluye input `Etiqueta / Badge` (maxLength 50, uppercase).
- Presets rápidos: `THE CHEESECAKE FACTORY`, `EXCLUSIVO PUERTO MADERO`, `EXCLUSIVO PALERMO`, `EXCLUSIVO BELGRANO`, `NUEVO`, `TEMPORADA`, `CHEFS CHOICE`, y botón "sin etiqueta" para limpiar.
- Preview en vivo muestra el nombre con TagBadge al lado.

Persistencia:
- `POST /api/menu/save` action=update acepta `changes.tag`. Si viene `""` elimina el field, si trae valor lo asigna.
- `POST /api/menu/save` action=add ya soportaba `tag` en el objeto item.
- Se guarda en KV (Cloudflare Workers) vía `/menu-data` con `X-Proxy-Secret`.

Render:
- App `/menu`: componente `TagBadge` con `bg-menu-gold/10 text-menu-gold border-menu-gold-light`.
- Print HTML estático (`public/menu-print.html`): clase `.tag` ya estilizada para impresión.

### Login y permisos (auto-sync)

El callback `/api/auth` chequea si el email está autorizado en este orden:
1. `ALLOWED_EMAILS` env var de Vercel (legacy, admins iniciales)
2. Tab Usuarios del workbook MASUNORI_ERP_CONFIG con `Activo=TRUE`

Esto permite agregar usuarios desde `/administracion/usuarios` sin tocar Vercel.

**Fuente de verdad de permisos**: la columna **Permisos** del sheet (no el rol).
- Anteriormente, si `rol="admin"`, el código auto-asignaba `*` ignorando la columna Permisos.
- Ahora la columna Permisos manda. Esto permite editar a admins desde la UI live.
- El rol queda como label informativo: "admin" si Permisos="*", "user" si tiene perms específicos.
- Cache de permisos: 30s (live edits propagan en máx 30s).
- Owner (`matiaskweller@gmail.com`) sigue hardcoded con acceso total — no se puede restringir desde la UI (security).

Implementación:
- **Middleware** (`src/middleware.ts`): verifica sesión + inyecta header `x-pathname`. NO hace check de permisos (Edge no puede leer Sheets fácilmente).
- **`src/lib/admin-permissions.ts`** (Node-only, server-side):
  - `requirePermission(perm)` — usar en server components / layouts. Redirige si no autorizado.
  - `requirePermissionApi(request, perm)` — usar en route handlers `/api/*`. Devuelve `{ ok, response | user }`.
  - `getAllUsers()`, `upsertUser()`, `deleteUser()` — CRUD del sheet con cache 5 min in-memory.
  - **Auto-migra** schema viejo (sin columna Permisos) la primera vez que se lee.
- **`/administracion/layout.tsx`**: llama `requirePermission(perm)` según el path actual (lee `x-pathname`). Mapea path → permiso.
- **APIs `/api/erp/*`**: cada route handler llama `requirePermissionApi(request, "X")` al inicio.
- **Página `/administracion/usuarios`**: UI para gestionar permisos. Solo accesible por owner.

Endpoints de la gestión de usuarios:
- `GET /api/erp/usuarios` — lista usuarios (solo owner)
- `POST /api/erp/usuarios` — crear/actualizar usuario (solo owner)
- `DELETE /api/erp/usuarios?email=X` — eliminar usuario (solo owner, no permite eliminar al owner)

Si un user logueado intenta acceder sin permisos, lo redirige a `/?error=admin_only` (o `/administracion?error=perm_denied`) y muestra un banner.

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
│   ├── administracion/page.tsx # Placeholder ERP (próximamente)
│   └── api/
│       ├── auth/route.ts       # GET Google OAuth callback / DELETE logout
│       ├── auth/login/route.ts # GET inicia flujo OAuth con Google
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

Google OAuth como único método de login. Whitelist de emails permitidos en `ALLOWED_EMAILS`. Flujo: `/api/auth/login` redirige a Google → callback en `/api/auth` intercambia code por id_token → verifica email en whitelist → crea sesión JWT en cookie httpOnly. Middleware protege todas las rutas excepto `/login` y `/api/auth`.

## Variables de entorno

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
ALLOWED_EMAILS=email1@gmail.com,email2@gmail.com
SESSION_SECRET=xxx

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
- **Fudo API Proxy**: Las requests a Fudo pasan por un Cloudflare Worker (`fudo-test.matiaskweller.workers.dev`) porque Fudo bloquea IPs de datacenter (AWS/Vercel). Proxy code en `/Users/matiaskw/Desktop/fudo-cf-test/`.

## ⚠️ Convenciones del P&L (críticas — leer antes de editar `/administracion/pnl`)

El P&L se construye desde **EGRESOS pagados** (cash real, no devengado) + ventas Fudo. Reglas:

### Categorías de costo (afectan EBITDA)
1. **Insumos / CMV** — Almacen, Bebidas c/Alcohol, Bebidas s/Alcohol, Postres y Café, Carnicería, Descartables, Productos Orientales, Pescadería, Verdulería, Envíos, Pollería
2. **Sueldos / RRHH** — Sueldos, RRHH, Comida personal, Reemplazos, Extra eventos, Sindicato, Aguinaldos, Cargas Sociales, Liquidaciones, Despidos, Previsiones
3. **Alquiler + Servicios** — Alquiler, Expensas, Servicios
4. **Operativos** — Bazar, Equipamiento, Farmacia, Honorarios, Inversiones, Librería, Limpieza, Mantenimiento, Redes, Varios
5. **Impuestos / Acuerdos** — IVA, IIBB, Impuestos, Retenciones, AFIP, Acuerdos, IMP. INTERNOS
6. **Bancarios / Comisiones** — Gastos Bancarios, Comisiones, Intereses, Financieros
7. **Otros** — fallback para rubros sin clasificar

### Categoría especial — NO suma a costos
8. **Retiros (distribución a socios)** — Retiros, distribuciones a socios, dividendos. Se muestran como línea separada **debajo de EBITDA prefijada con `*`** (es **distribución desde banco a socios**, NO gasto operativo, NO ganancia operativa). **Nunca usar `+` para retiros**, siempre `*` con texto "distribución desde banco a socios".

### Ventas Brutas vs Netas vs Descuentos
- **Ventas Brutas**: `Σ item.price` para items NO cancelados. ⚠️ **CRÍTICO**: en Fudo, `Item.price` es el **TOTAL DE LA LÍNEA**, NO precio unitario. Por eso NO se multiplica por quantity. Ejemplo: 5× Combo a $48k cada uno → Fudo guarda price=$240k, quantity=5. Si multiplicás price×quantity overcomputás 5×$240k=$1.2M (incorrecto).
- **Descuentos**: Brutas - Netas (descuentos de socios, promos, ajustes manuales, etc.)
- **Ventas Netas**: `sale.total` de Fudo (lo que efectivamente se cobra)
- **CMV %** se calcula contra **Ventas Brutas** (es la métrica operativa real, los descuentos no afectan el costo de los insumos). El CMV vs netas se guarda como referencia (`cmvPctNetas`)
- **EBITDA %** y demás % de costos se calculan contra **Ventas Netas** (lo que efectivamente entra)

### Estructura del P&L mensual
```
Ventas Brutas (de Fudo, items × cant)
- Descuentos (de socios, promos)
= Ventas Netas (sale.total Fudo)
- Insumos (CMV)               ← CMV% sobre BRUTAS
= Margen Bruto
- Sueldos / RRHH
- Alquiler + Servicios
- Operativos
- Impuestos / Acuerdos
- Bancarios / Comisiones
- Otros
= EBITDA                       ← EBITDA% sobre NETAS
* Retiros (distribución a socios)  ← NO afecta EBITDA, info aparte
```

### Re-asignación de rubros
- Los rubros se clasifican por keyword en `classifyRubro()` (`src/app/api/erp/pnl/route.ts`)
- Las re-asignaciones del usuario se persisten en la tab **`RubroCategorias`** del workbook **MASUNORI_ERP_CONFIG** (`1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g`)
- Columnas: `Rubro | Categoria | ActualizadoPor | ActualizadoEn`
- **Las re-asignaciones aplican a las 3 sucursales** (Palermo, Belgrano, Madero) automáticamente — son globales, no por sucursal
- API: `/api/erp/rubro-categorias` (GET / POST / DELETE)

### Identificación de "pagado"
Una factura cuenta como pagada (suma a costos del mes) cuando:
- Tiene `Fecha Pago` cargada en EGRESOS, **Y**
- `Metodo de Pago` no es vacío, "Sin pagar", ni "pendiente"

Las pendientes/vencidas se manejan en módulos Egresos y Alertas, NO en P&L.

### Archivos involucrados
- `src/app/api/erp/pnl/route.ts` — endpoint y `classifyRubro()` con keywords default
- `src/app/api/erp/rubro-categorias/route.ts` — overrides persistentes
- `src/app/administracion/pnl/page.tsx` — UI con tabla + dropdown reasignar + PDFs

### PDFs
- **Resumido**: P&L mensual con totales por categoría (1 página A4 horizontal)
- **Detallado**: resumido + 1 página por categoría con todos los rubros desglosados mes a mes
- Generación con `jspdf` + `jspdf-autotable` client-side

### Reglas para futuras modificaciones
- **Nuevas categorías**: agregar en `Categoria` type en `pnl/route.ts` Y en `VALID_CATEGORIAS` de `rubro-categorias/route.ts` Y en page CATEGORIAS / CATEGORIA_LABEL / CATEGORIA_COLOR
- **Una categoría que NO suma a costos** (como retiros): excluir de `totalCostos = ...` en el endpoint y agregarle un campo top-level (no dentro de `costos`)
- **Mover keyword auto-classify**: editar `classifyRubro()` solamente. Los overrides manuales del usuario NO se afectan, ya que aplican encima del default.

## ⚠️ REGLAS CRÍTICAS — Productos Fudo

**PROHIBIDO crear productos masivamente.** En abril 2026, la creación masiva de productos SIN CATEGORÍA crasheó la app de Fudo POS para TODOS los usuarios durante UNA SEMANA. Reglas irrompibles:

1. **SIEMPRE asignar categoría** — Todo producto DEBE tener `categoryId`. Sin excepción.
2. **Uno a la vez** — Crear máximo 1 producto por operación, con confirmación humana (`confirmed: true`).
3. **Nunca batch-create** — No crear productos en loop ni en masa. Cada producto se confirma individualmente.
4. **PATCH limitado a 10** — Máximo 10 actualizaciones de precio/nombre por request.
5. **Verificar antes de crear** — Siempre verificar que el producto no exista ya en la sucursal destino.

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
