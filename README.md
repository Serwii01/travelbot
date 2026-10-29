# ✈️ travelbot

Bot de Telegram que **vigila precios de vuelos** y te avisa cuando bajan. Le das un destino y unas fechas (exactas, un rango o un mes entero) y busca el día más barato dentro de ellas.

Te avisa cuando:
1. el precio cae **por debajo de tu objetivo**, o
2. el precio **baja** al menos un `MIN_DROP_PCT`% (3 % por defecto) respecto a la última comprobación,

y solo si es más barato que lo que ya te avisó (no repite el mismo precio). El aviso incluye fechas, aerolínea, escalas, si es el **mínimo desde que lo vigila** y un botón **Ver vuelo** para comprarlo.

Dos formas de ejecutarlo:
- **24/7 en un VPS** (recomendado): responde al instante, ~60 MB de RAM, CPU casi a cero.
- **Cron en GitHub Actions** (gratis, sin servidor): responde en la siguiente ejecución.

---

## Uso con botones

Al pulsar **Start** aparece un menú fijo bajo la caja de texto:

- **➕ Nueva alerta**: asistente paso a paso. Escribes la ciudad ("madrid", "londres"; se busca con el autocompletado gratuito de Travelpayouts), eliges solo ida o ida y vuelta, el tipo de fechas (un día, varios días o un mes) en un calendario con botones, escribes el precio máximo y eliges si solo directos. Cada paso tiene **◀ Atrás** y **✖️ Cancelar**.
- **📋 Mis alertas**: un botón por alerta; dentro, precio actual, mínimo, mejor vuelo y botones para **Ver vuelo**, **Pausar/Reanudar**, **Cambiar precio** y **Borrar** (con confirmación).
- **🔎 Comprobar precios**: comprueba ahora y manda el resumen.

Los avisos de precio llevan **Ver vuelo**, **Pausar**, **Borrar** y **Detalle**. Las conversaciones a medias se guardan en el estado (sobreviven a reinicios) y se olvidan a las 24 h.

## Comandos (siguen funcionando)

```
/nueva               asistente con botones (igual que ➕ Nueva alerta; también /add sin argumentos)
/alertas             mis alertas con botones (también /list)
/cancel              cancelar el asistente o el cambio de precio
/add ORIGEN DESTINO IDA [VUELTA] precioMax [directo]
    /add MAD PRG 2026-08-20 120                                     solo ida, fecha exacta
    /add MAD PRG 2026-08-15..2026-08-20 2026-08-22..2026-08-27 200  ida y vuelta flexibles
    /add MAD LON 2026-09 2026-09 150 directo                        mes entero, solo directos
/list                ver alertas, precio actual, mínimo y mejor vuelo
/target ID precio    cambiar el objetivo
/remove ID · /pause ID · /resume ID
/setcurrency EUR
/checknow            comprobar ahora y recibir el resumen
/help
```

- Fechas: `YYYY-MM-DD`, `YYYY-MM-DD..YYYY-MM-DD` (máx. 31 días) o `YYYY-MM`.
- Puedes usar códigos de ciudad (`LON`, `MIL`, `PAR`) para cubrir todos sus aeropuertos.
- Las alertas se borran solas (con aviso) cuando pasa la última fecha de ida.

---

## Cómo encuentra el precio

Proveedor: **Travelpayouts / Aviasales Data API** (gratis, sin tarjeta), endpoint `prices_for_dates`.

- Son precios **cacheados** de búsquedas de usuarios de Aviasales en las últimas ~48 h, no en tiempo real. Valen para alertas; confirma el precio antes de comprar.
- Fecha exacta → se pide ese día. Rango o mes → se pide por meses y se filtra en local (máx. 2 meses por tramo).
- **Ahorro de llamadas**: alertas con la misma consulta comparten una búsqueda; las respuestas se cachean 20 min en memoria (alertas distintas del mismo mes y `/checknow` repetidos no gastan API); solo las llamadas reales esperan `REQUEST_DELAY_MS`.
- Si una ruta no tiene datos recientes, se reintenta en la siguiente comprobación.

---

## Despliegue en un VPS (24/7)

Requisitos: Linux con systemd y **Node ≥ 20.6 instalado a nivel de sistema** (no nvm).

```bash
# Node 22 en Debian/Ubuntu, si no lo tienes:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs git

sudo git clone https://github.com/Serwii01/travelbot.git /opt/travelbot
sudo bash /opt/travelbot/deploy/install.sh
sudo nano /etc/travelbot.env          # TELEGRAM_BOT_TOKEN y TRAVELPAYOUTS_TOKEN
sudo systemctl restart travelbot
```

> El repo es privado: para clonarlo en el VPS usa un [token de acceso personal](https://github.com/settings/tokens) como contraseña o una deploy key.

El instalador:
- crea el usuario de sistema `travelbot` (sin root ni shell),
- instala dependencias, compila a JavaScript (`dist/`) y quita las de desarrollo,
- copia `/etc/travelbot.env` desde `deploy/travelbot.env.example` (permisos 600),
- guarda el estado en `/var/lib/travelbot/db.json` (fuera del repo; copia el `data/db.json` existente la primera vez),
- instala el servicio con reinicio automático, `MemoryMax=160M` y sandbox de systemd.

Uso diario:

```bash
journalctl -u travelbot -f                 # logs en directo
sudo systemctl restart travelbot           # reiniciar
sudo bash /opt/travelbot/deploy/update.sh  # git pull + compilar + reiniciar
```

**Copia de seguridad**: lo único importante es `/var/lib/travelbot/db.json`.

> ⚠️ No uses a la vez el VPS y el workflow de GitHub Actions: los dos leerían los mensajes de Telegram y se los repartirían. Por eso el `schedule` del workflow viene comentado.

### Recursos

Un único proceso Node: long polling a Telegram (una petición abierta que Telegram responde cuando llega un mensaje) y comprobación de precios cada `CHECK_INTERVAL_MIN` (180 por defecto). Unos 55–65 MB de RAM (medido ~57 MB), CPU ~0 %, red despreciable. `npm ci` + compilación necesitan ~200 MB durante un minuto.

---

## Alternativa: GitHub Actions (sin servidor)

1. Descomenta el `schedule` en [.github/workflows/check-flights.yml](.github/workflows/check-flights.yml).
2. Crea los secrets `TELEGRAM_BOT_TOKEN` y `TRAVELPAYOUTS_TOKEN` (Settings → Secrets and variables → Actions).
3. El workflow corre cada 3 h, procesa comandos, comprueba precios y commitea `data/db.json`. Usa **repo privado** (el estado contiene tus chat IDs).

---

## Desarrollo

```bash
npm install
npm run typecheck
npm test
cp .env.example .env     # rellena los tokens
npm run dev              # bot 24/7 en local (Ctrl+C para parar)
FLIGHT_PROVIDER=mock npm run dev   # precios inventados, sin gastar API
npm run build && npm start         # versión compilada, como en el VPS
```

### Estructura

```
src/
  bot/         router (mensajes y botones), asistente, teclados, comandos
  services/    Telegram, comprobación de precios, lógica de avisos, mensajes
  providers/   FlightProvider + Travelpayouts + Mock
  storage/     StorageProvider + JsonStorage (escritura atómica, migra datos antiguos)
  jobs/        bot.ts (24/7) · checkFlights.ts (cron) · processUpdates.ts
  utils/       fechas, validación, logger
deploy/        install.sh · update.sh · travelbot.service · travelbot.env.example
```

Para otro proveedor (precios en tiempo real, de pago) crea una clase que cumpla `FlightProvider`. Para otra base de datos (SQLite/Postgres), una que cumpla `StorageProvider`.

### Variables de entorno

| Variable | Por defecto | |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | obligatoria |
| `TRAVELPAYOUTS_TOKEN` | — | obligatoria con `travelpayouts` |
| `TRAVELPAYOUTS_MARKER` | — | marker de afiliado para los enlaces |
| `TRAVELPAYOUTS_MARKET` | `es` | mercado de los precios cacheados (con el de la API, `ru`, muchas rutas españolas salen vacías) |
| `FLIGHT_PROVIDER` | `travelpayouts` | o `mock` |
| `DATA_FILE` | `data/db.json` | en el VPS: `/var/lib/travelbot/db.json` |
| `DEFAULT_CURRENCY` | `EUR` | |
| `CHECK_INTERVAL_MIN` | `180` | modo 24/7, mínimo 15 |
| `MIN_DROP_PCT` | `3` | bajada mínima para avisar por encima del objetivo |
| `REQUEST_DELAY_MS` | `1200` | espera entre llamadas reales a la API |
