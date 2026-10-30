# Estado de la primera entrega

Actualizado: 30 de octubre de 2026, America/Mexico_City.

## Resultado actual

**Prototipo local implementado y verificado. La entrega completa permanece abierta:** falta demostrar el piloto entre aplicaciones de IA reales y sus ejecuciones programadas. Los clientes SDK de prueba no sustituyen esa evidencia. El servicio todavía no está desplegado para equipos externos.

Proyecto: `/Users/romanalejandro/Desktop/Code Projects/AgentChannels`.
Panel local: `http://localhost:4310`. MCP HTTP: `http://localhost:4310/mcp`.
La base real se entrega sin cuentas: el usuario crea su administrador al abrir el panel. Las pruebas no crean usuarios en esa base.

## Corrección de dirección visual

El usuario pidió sustituir la apariencia de dashboard verde por mensajería minimalista en modo oscuro, sin texto redundante. El rediseño ya está implementado con Next.js, React y shadcn/ui y verificado por navegador. Consultar `docs/DESIGN_DIRECTION.md` antes de cambiar la interfaz.

## Implementado

- Un espacio privado, cuenta de administrador y miembros por invitación individual, de un solo uso, ligada al correo y con vencimiento de 48 horas.
- Canales privados, participantes humanos explícitos y permisos por agente: sin acceso, lectura o lectura y escritura. Un agente solo puede entrar a un canal de su dueño.
- Identidades de agentes con dueño; autoría fijada en servidor; revocación permanente de identidad y todas sus credenciales.
- Mensajes de texto, menciones, respuestas a una raíz común, paginación, orden del servidor y reintentos sin duplicados.
- Bandeja persistente, ofrecimiento y confirmación explícita de recepción. No equivale a una tarea completada. El emisor no recibe sus propios mensajes.
- Cinco herramientas MCP: list_channels, get_inbox, get_thread, post_message, ack_messages.
- MCP HTTP mediante SDK oficial y adaptador local stdio. OAuth de cliente público con PKCE, consentimiento humano, tokens de acceso, renovación y revocación. Alternativa Bearer personal de 30 días.
- Panel en español: cuentas, canales, mensajes, participantes, agentes, permisos, pausa y actividad. Revisado a 1440 px y 390 px.
- Contenido cifrado AES-256-GCM, contraseñas scrypt, credenciales/sesiones como hashes; validación de origen, Host y CSRF; cookies HttpOnly; límites de uso y CSP.
- PostgreSQL embebido persistente para desarrollo, adaptador PostgreSQL nativo y pruebas de ambos. Clave local privada; carga de clave desde entorno para alojamiento.
- Ayuda de conexión para Codex desde el panel y ejemplo TOML sin credenciales. Descubrimiento autenticado de las cinco herramientas comprobado con el cliente nativo Codex CLI 0.163.0; no demuestra llamadas del modelo.
- Inicio local por npm o archivo «Abrir AgentChannels.command». Documentación de operación, seguridad, conexión y compatibilidad.

## Evidencia reproducible

| Comprobación            | Evidencia y alcance                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Sintaxis del panel, TypeScript y 12 pruebas de integración con PostgreSQL embebido.                                                                                                                                               |
| `npm run test:postgres` | Las mismas 11 pruebas con un servidor PostgreSQL nativo temporal, por el adaptador pg. No usa ni modifica bases reales.                                                                                                           |
| `npm run test:ui`       | Un recorrido completo con dos cuentas en Chromium: alta, canal, invitación, agentes, permisos, conexiones SDK, envío, recepción, respuesta, pausa, consentimiento OAuth y revocación; escritorio y móvil; sin errores JavaScript. |
| `npm run pilot`         | Dos conexiones SDK independientes que publican, se desconectan, responden más tarde y pierden acceso tras revocación. Es una prueba de protocolo, no de agentes autónomos.                                                        |
| `npm audit --omit=dev`  | Sin vulnerabilidades reportadas para dependencias de ejecución en la revisión realizada. No equivale a una auditoría de seguridad del producto.                                                                                   |

Prueba adicional: `npm run test:codex` pasó con **codex-cli 0.163.0**, transporte HTTP y Bearer por agente. El cliente nativo autenticó y devolvió las cinco herramientas, usando una base temporal y conexiones ajenas desactivadas solo mediante parámetros del proceso. Se comparó el hash de la configuración global antes y después: sin cambios. No se crearon conversaciones ni turnos y no se llamó a un modelo. Evidencia sin credenciales: `docs/evidence/codex-native-discovery.json`. Esta prueba es opcional y requiere tener Codex CLI instalado.

Las pruebas cubren aislamiento de canales/personas, lectura frente a escritura, identidad no declarable por el cliente, permisos vigentes tras conexión, cifrado del cuerpo, reintentos concurrentes, confirmación atómica, límites por agente incluso con otra credencial, paginación de historial mayor a 100 mensajes, código OAuth de un solo uso, PKCE incorrecto, recurso incorrecto, renovación, revocación y persistencia tras reiniciar.

Capturas de prueba, con datos ficticios: `test-results/panel-desktop.png` y `test-results/panel-mobile.png`. El comando de interfaz regenera esa carpeta.

## Auditoría del alcance acordado

| Requisito                                                 | Estado                                                                                                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto en Code Projects del escritorio                  | Cumplido por los archivos del proyecto.                                                                                                                                                |
| Continuación diaria del trabajo                           | Automatización heartbeat `continuar-prototipo-de-canales-mcp`, activa a las 09:00 del contexto local America/Mexico_City, ligada al chat de origen.                                    |
| Personas, invitaciones y panel de control                 | Implementado y probado por navegador/API.                                                                                                                                              |
| Canales privados, permisos y mensajes persistentes        | Implementado y probado en ambas bases.                                                                                                                                                 |
| Cinco herramientas y conexiones MCP                       | Implementado y probado por HTTP, OAuth y puente stdio.                                                                                                                                 |
| Reinicio, reintentos y revocación sobre clientes abiertos | Probado en integración.                                                                                                                                                                |
| Prueba con dos aplicaciones de IA concretas               | **Parcial: descubrimiento MCP nativo de Codex CLI verificado. Falta el intercambio entre dos agentes de aplicaciones reales; no se ha afirmado compatibilidad autónoma o programada.** |
| Ejecución programada de los agentes participantes         | **Pendiente; la automatización que desarrolla este proyecto no demuestra ese requisito.**                                                                                              |
| Uso desde equipos de amigos                               | **Pendiente si los clientes están fuera de esta Mac; requiere alojamiento HTTPS accesible.**                                                                                           |

## Identidad del cliente

El usuario aclaró que el agente es Antigravity y se ejecuta con `agy`. Los primeros informes conservaron la etiqueta histórica «Gemini»; esos mensajes originales no se reescriben. Las nuevas ejecuciones usan «Antigravity». El modelo subyacente puede pertenecer a la familia Gemini; eso no cambia el nombre del cliente.

## Piloto real y nueva interfaz

El usuario resolvió la selección: Antigravity (`agy`), OpenCode y Codex, todos en esta Mac. Autorizó una interfaz Next.js + React + shadcn/ui y un runner externo para activar los agentes ante mensajes. El bloqueo anterior por selección de aplicaciones ya no aplica.

La interfaz oscura está implementada en web/, compiló y pasó la prueba de navegador con dos cuentas, invitaciones, permisos, mensajes, MCP por el mismo origen, pausa y móvil. El servicio principal con Next corre en http://localhost:4310. El canal aislado del piloto está abierto en http://localhost:14316, con cuentas y archivos de prueba separados de los datos reales.

Evidencia de agentes reales:

- Codex publicó mediante MCP, creó normalize-task.mjs y confirmó recepción. Además, en una prueba visible en el navegador, un watcher detectó el mensaje dirigido del usuario de demostración y activó Codex, que respondió en el canal con identificador b0323964-0a12-4616-b9c2-2ccd6179f38a. Informó correctamente que faltaba summarize-tasks.mjs y que npm test fallaba. Esto prueba una reacción real activada externamente, no un scheduler nativo de Codex.
- Antigravity, mediante `agy` y ACP, escribió tests/tasks.test.mjs y publicó mediante MCP en una ejecución independiente. Evidencia en docs/evidence/pilot-real-initial.json. No es Gemini CLI, que no está instalado.
- OpenCode fue intentado con modelos gratuitos disponibles. La última ejecución quedó interrumpida por un error de transporte del proveedor; no publicó una respuesta en el canal. No se declara colaboración completa de los tres.

El proyecto MiniTasks conjunto sigue incompleto y sus pruebas no pasan por la ausencia del módulo asignado a OpenCode. Hay que resolver esa conexión y repetir la colaboración. No sustituir el resultado por mensajes simulados ni presentar los clientes SDK como modelos autónomos.

Continuación autorizada: reparar interoperabilidad de OpenCode, conservar el piloto visible, verificar colaboración y límites del watcher, consolidar documentación de arranque Next y evidencias. La continuación diaria sigue activa. Solo cerrar la entrega cuando el flujo completo esté verificado.

## Límites explícitos

No hay cifrado de extremo a extremo, adjuntos, tareas, ejecución de modelos, aplicación móvil, usuarios públicos ni comunicación A2A. La protección del servidor no garantiza que un agente resista instrucciones maliciosas del contenido recibido. Los agentes deben aplicar sus propias autorizaciones de herramientas.

La retención de mensajes es indefinida en el piloto. No hay borrado individual, recuperación de contraseña por correo ni rotación automatizada de claves. La base local y su clave comparten equipo; para un despliegue se necesita separar secretos y respaldos y cifrar almacenamiento. La configuración remota debe revisarse antes de compartirlo con otras personas.

Los procesos locales pueden detenerse cuando se cierre su sesión de ejecución; el archivo de inicio permite volver a abrir el servicio sin perder datos. Las continuaciones locales dependen de que la Mac y la aplicación estén disponibles para ejecutarlas.
