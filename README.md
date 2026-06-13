# ✈️ travelbot

Bot de Telegram para **alertas de precios de vuelos**, diseñado para correr **gratis** en GitHub Actions (cron cada 3 h), **sin servidor 24/7, sin Docker y sin servicios de pago**.

Te avisa por Telegram cuando:
1. el precio **baja** respecto al último valor guardado, o
2. el precio cae **por debajo de tu objetivo**.

---

## Cómo funciona (en 30 segundos)

No hay proceso permanente. Un único workflow corre cada 3 h (o manualmente) y en cada ejecución:

1. **Lee tus comandos** de Telegram pendientes (`getUpdates` con offset guardado).
2. **Comprueba precios** con Amadeus, agrupando rutas iguales para gastar el mínimo de llamadas.
3. **Notifica** solo lo relevante (bajada o bajo objetivo) y sin repetir el mismo precio.
4. **Guarda el estado** en `data/db.json` y lo commitea de vuelta al repo.

> **Consecuencia importante:** las respuestas a tus comandos (`/add`, `/list`, …) llegan en la **siguiente ejecución del workflow** (hasta 3 h). Para una respuesta inmediata, lanza el workflow a mano (`workflow_dispatch`) o reduce el cron. Ver [Comandos más ágiles](#comandos-más-ágiles-opcional).

---

## Stack y decisiones técnicas (breve)

- **TypeScript estricto + Node 20**, ejecutado con `tsx` (sin paso de build).
- **0 dependencias de runtime**: `fetch` nativo para Telegram y Amadeus, `node:test` para los tests. Solo `typescript` y `tsx` en dev.
- **Cron, no servidor**: cumple "coste 0". El polling de comandos se hace en la propia ejecución, no en un proceso vivo.
- **Almacenamiento abstraído** (`StorageProvider`). Implementación por defecto: **JSON commiteado al repo** (gratis, simple). Para escalar, crea una clase `PostgresStorage`/`SqliteStorage` que cumpla la interfaz y cámbiala en `src/storage/index.ts` — nada más cambia.
- **Proveedor de vuelos abstraído** (`FlightProvider`): `AmadeusFlightProvider` (principal) y `MockFlightProvider` (pruebas / `/checknow` sin API).
- **Ahorro de llamadas**: agrupación por ruta (`ORG|DEST|FECHA|MONEDA`) → 1 llamada compartida entre alertas iguales; comparación con último valor; espera (`REQUEST_DELAY_MS`) entre llamadas; token Amadeus cacheado durante la ejecución.
- **Robustez**: si una ruta o un envío falla, se registra y se continúa con el resto.

### Amadeus: test vs. producción
| | `test.api.amadeus.com` (por defecto) | `api.amadeus.com` (producción) |
|---|---|---|
| Coste | Gratis | Gratis dentro de cuota, luego de pago |
| Datos | Limitados, cacheados, no todas las rutas/fechas devuelven ofertas | Reales |
| Cambio | — | `AMADEUS_HOSTNAME=api.amadeus.com` + pasar la app a producción en el portal |

Si una ruta no devuelve ofertas en test, **no es un bug**: es la limitación del entorno gratuito. Cámbialo con una sola variable de entorno.

---

## Estructura

```
src/
  bot/         parseo y manejo de comandos
  services/    Telegram, lógica de precios/dedupe, formato de mensajes
  providers/   FlightProvider + Amadeus + Mock
  storage/     StorageProvider + JsonStorage
  jobs/        checkFlights (entry) + processUpdates
  models/      tipos
  utils/       logger, validación, sleep, id
.github/workflows/check-flights.yml
data/db.json   estado persistente (lo gestiona el workflow)
```

---

## Comandos del bot

```
/start
/help
/add ORG DEST YYYY-MM-DD maxPrice    ej: /add MAD PRG 2026-08-20 120
/list
/remove ID
/pause ID
/resume ID
/setcurrency EUR
/checknow
```

---

## Despliegue gratis: pasos exactos

### 1. Crear el bot en Telegram (BotFather)
1. Abre Telegram y habla con [`@BotFather`](https://t.me/BotFather).
2. Envía `/newbot` y sigue las instrucciones (nombre + username que acabe en `bot`).
3. Copia el **token** que te da (formato `123456:ABC-...`). Es tu `TELEGRAM_BOT_TOKEN`.
4. Abre un chat con tu bot y pulsa **Start** (necesario para que pueda escribirte).

### 2. Credenciales de Amadeus (free tier)
1. Regístrate en https://developers.amadeus.com.
2. Crea una **Self-Service App**.
3. Copia **API Key** (`AMADEUS_CLIENT_ID`) y **API Secret** (`AMADEUS_CLIENT_SECRET`).

### 3. Subir el repo a GitHub
```bash
cd travelbot
npm install            # genera package-lock.json (necesario para `npm ci` del workflow)
git init
git add .
git commit -m "init travelbot"
gh repo create travelbot --private --source=. --push
```
> **Usa repo privado.** El estado (`data/db.json`) incluye tus chat IDs y alertas; un repo público los expondría. Con repo privado, el uso (~8 ejecuciones/día × ~1–2 min) entra de sobra en los **2000 min/mes gratis** de Actions.

### 4. Configurar los secrets
En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crea:

| Secret | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token de BotFather |
| `AMADEUS_CLIENT_ID` | API Key de Amadeus |
| `AMADEUS_CLIENT_SECRET` | API Secret de Amadeus |

(Opcional, como *Repository variables* o en el `env:` del workflow: `AMADEUS_HOSTNAME`, `FLIGHT_PROVIDER`, `DEFAULT_CURRENCY`.)

### 5. Activar y probar
1. Pestaña **Actions** → habilita los workflows si te lo pide.
2. Abre **check-flights** → **Run workflow** (`workflow_dispatch`).
3. En Telegram, escribe a tu bot: `/start`, luego `/add MAD PRG 2026-08-20 120`.
4. Vuelve a **Run workflow**: en esa ejecución procesa tu `/add`, responde y comprueba precios.

A partir de ahí corre solo cada 3 h.

---

## Comandos exactos: instalar, probar, ejecutar

```bash
npm install        # instala dev-deps y crea package-lock.json
npm run typecheck  # comprobación de tipos (TS estricto)
npm test           # tests unitarios (parsing de comandos + dedupe)

# Ejecutar el job en local (necesita las variables de entorno):
cp .env.example .env   # rellena los valores
# En Linux/macOS:
set -a && . ./.env && set +a && npm run check
# En PowerShell (Windows):
#   Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { $env:($matches[1].Trim()) = $matches[2] } }; npm run check
```

Probar sin gastar API de Amadeus: `FLIGHT_PROVIDER=mock npm run check`.

---

## Lista de secrets necesarios

- `TELEGRAM_BOT_TOKEN`
- `AMADEUS_CLIENT_ID`
- `AMADEUS_CLIENT_SECRET`

---

## Comandos más ágiles (opcional)

Si quieres respuestas casi instantáneas a los comandos sin montar un servidor, duplica el workflow con un cron más frecuente (p. ej. `*/10 * * * *`). Vigila el consumo de minutos en repos privados; en **repos públicos los minutos de Actions son gratuitos** (a cambio de exponer `data/db.json`). El diseño ya deduplica `getUpdates` con `offset`, así que ejecutar más a menudo es seguro.

---

## Si algo no puede ser 100% gratis a largo plazo

- **Amadeus producción** supera la cuota gratis con uso alto → aislado tras `FlightProvider`. Sustituible por otro proveedor (Kiwi/Tequila, Travelpayouts, etc.) creando una clase nueva.
- **Almacenamiento** si creces a muchos usuarios → aislado tras `StorageProvider`. Migra a Postgres gratuito (Supabase/Neon) implementando la interfaz, sin tocar la lógica.
