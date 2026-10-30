# Estado de la primera entrega

Actualizado: 30 de octubre de 2026, America/Mexico_City.

## Resultado actual

**Prototipo local implementado y verificado. La entrega completa permanece abierta:** falta demostrar el piloto entre aplicaciones de IA reales y sus ejecuciones programadas. Los clientes SDK de prueba no sustituyen esa evidencia. El servicio todavía no está desplegado para equipos externos.

Proyecto: `/Users/romanalejandro/Desktop/Code Projects/AgentChannels`.
Panel local: `http://localhost:4310`. MCP HTTP: `http://localhost:4310/mcp`.
La base real se entrega sin cuentas: el usuario crea su administrador al abrir el panel. Las pruebas no crean usuarios en esa base.

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
- Inicio local por npm o archivo «Abrir AgentChannels.command». Documentación de operación, seguridad, conexión y compatibilidad.

## Evidencia reproducible

| Comprobación            | Evidencia y alcance                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | Sintaxis del panel, TypeScript y 11 pruebas de integración con PostgreSQL embebido.                                                                                                                                               |
| `npm run test:postgres` | Las mismas 11 pruebas con un servidor PostgreSQL nativo temporal, por el adaptador pg. No usa ni modifica bases reales.                                                                                                           |
| `npm run test:ui`       | Un recorrido completo con dos cuentas en Chromium: alta, canal, invitación, agentes, permisos, conexiones SDK, envío, recepción, respuesta, pausa, consentimiento OAuth y revocación; escritorio y móvil; sin errores JavaScript. |
| `npm run pilot`         | Dos conexiones SDK independientes que publican, se desconectan, responden más tarde y pierden acceso tras revocación. Es una prueba de protocolo, no de agentes autónomos.                                                        |
| `npm audit --omit=dev`  | Sin vulnerabilidades reportadas para dependencias de ejecución en la revisión realizada. No equivale a una auditoría de seguridad del producto.                                                                                   |

Las pruebas cubren aislamiento de canales/personas, lectura frente a escritura, identidad no declarable por el cliente, permisos vigentes tras conexión, cifrado del cuerpo, reintentos concurrentes, confirmación atómica, límites por agente incluso con otra credencial, paginación de historial mayor a 100 mensajes, código OAuth de un solo uso, PKCE incorrecto, recurso incorrecto, renovación, revocación y persistencia tras reiniciar.

Capturas de prueba, con datos ficticios: `test-results/panel-desktop.png` y `test-results/panel-mobile.png`. El comando de interfaz regenera esa carpeta.

## Auditoría del alcance acordado

| Requisito                                                 | Estado                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto en Code Projects del escritorio                  | Cumplido por los archivos del proyecto.                                                                                                             |
| Continuación diaria del trabajo                           | Automatización heartbeat `continuar-prototipo-de-canales-mcp`, activa a las 09:00 del contexto local America/Mexico_City, ligada al chat de origen. |
| Personas, invitaciones y panel de control                 | Implementado y probado por navegador/API.                                                                                                           |
| Canales privados, permisos y mensajes persistentes        | Implementado y probado en ambas bases.                                                                                                              |
| Cinco herramientas y conexiones MCP                       | Implementado y probado por HTTP, OAuth y puente stdio.                                                                                              |
| Reinicio, reintentos y revocación sobre clientes abiertos | Probado en integración.                                                                                                                             |
| Prueba con dos aplicaciones de IA concretas               | **Pendiente; no se ha afirmado compatibilidad con ChatGPT, Codex u otra aplicación.**                                                               |
| Ejecución programada de los agentes participantes         | **Pendiente; la automatización que desarrolla este proyecto no demuestra ese requisito.**                                                           |
| Uso desde equipos de amigos                               | **Pendiente si los clientes están fuera de esta Mac; requiere alojamiento HTTPS accesible.**                                                        |

## Siguiente trabajo autorizado

1. Obtener la selección de dos aplicaciones y dónde se ejecutan. Se preguntó al usuario en el chat. Mientras tanto, no cambiar configuraciones globales ni iniciar agentes secundarios por su cuenta.
2. Conectar esos clientes con sus identidades y permisos reales. Seguir docs/CLIENTS.md y registrar versión, entorno y método de conexión; nunca registrar tokens.
3. Si se necesitan equipos externos, preparar un despliegue HTTPS persistente en un alojamiento que el usuario pueda administrar. Verificar administrador ya creado, cifrado y backup. No publicar datos ni cuentas locales.
4. Demostrar consulta/respuesta en ejecuciones programadas reales y verificar la revocación. Registrar identificadores de mensajes y tiempos sin contenido privado.
5. Solo cuando todos esos requisitos estén probados, cerrar la primera entrega y desactivar la continuación diaria para evitar trabajo adicional.

## Límites explícitos

No hay cifrado de extremo a extremo, adjuntos, tareas, ejecución de modelos, aplicación móvil, usuarios públicos ni comunicación A2A. La protección del servidor no garantiza que un agente resista instrucciones maliciosas del contenido recibido. Los agentes deben aplicar sus propias autorizaciones de herramientas.

La retención de mensajes es indefinida en el piloto. No hay borrado individual, recuperación de contraseña por correo ni rotación automatizada de claves. La base local y su clave comparten equipo; para un despliegue se necesita separar secretos y respaldos y cifrar almacenamiento. La configuración remota debe revisarse antes de compartirlo con otras personas.

Los procesos locales pueden detenerse cuando se cierre su sesión de ejecución; el archivo de inicio permite volver a abrir el servicio sin perder datos. Las continuaciones locales dependen de que la Mac y la aplicación estén disponibles para ejecutarlas.
