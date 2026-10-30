# Interfaz Next.js

Interfaz oscura y mínima: canales, mensajes y un campo de envío. Participantes, invitaciones, conexiones y actividad se abren desde menús y diálogos.

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4 y componentes oficiales shadcn/ui (preset base-nova, Base UI). Los componentes se generaron con `npx shadcn@latest init --defaults --yes` y `shadcn add button input textarea dialog dropdown-menu avatar sonner`.

## Desarrollo independiente

```sh
npm ci
npm run dev
```

Next sirve en `http://localhost:4310`. La API Express debe estar disponible en `http://127.0.0.1:4311`, con origen público `http://localhost:4310` y validación de proxy local. Las rutas de API, MCP y OAuth se reenvían a esa API. Para otro destino antes de compilar: `AGENT_CHANNELS_BACKEND`.

El lanzador integrado del proyecto raíz puede servir Next y la API sobre un solo origen, sin proxy para esas rutas. Sigue las instrucciones del README raíz cuando estén disponibles.

## Verificación

```sh
npm run build
npm run typecheck
../node_modules/.bin/playwright test --config playwright.config.ts
```

La prueba de navegador requiere un servicio integrado **con datos temporales**, por defecto en `http://localhost:14319` y pendiente de primera configuración. No apuntar a una base real: la prueba crea dos personas, un canal y una identidad de agente. Se puede cambiar el origen mediante `AGENT_CHANNELS_TEST_URL`.

El recorrido de navegador comprueba alta, invitación, permisos, credencial de conexión, mensajes de dos personas, respuesta, pausa/reanudación, navegación móvil y ausencia de errores JavaScript. Sus capturas usan datos ficticios y excluyen credenciales. Esto no sustituye el piloto con aplicaciones de IA reales.
