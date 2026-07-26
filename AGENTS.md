# AGENTS.md — instrucciones para asistentes de IA

Este archivo aplica a cualquier asistente de IA (Claude, otro modelo, u otra
sesión futura) que trabaje en este repositorio. Es permanente: no lo
edites para reflejar el estado de una tarea puntual — eso va en
[`SESSION.md`](./SESSION.md).

## Antes de empezar

1. **Leé [`README.md`](./README.md) completo** — propósito, arquitectura,
   estructura del proyecto.
2. **Leé [`SESSION.md`](./SESSION.md) completo** — estado actual, tareas
   pendientes, problemas conocidos, decisiones recientes. No asumas que la
   última conversación es la única fuente de contexto: `SESSION.md` es el
   estado acordado entre sesiones.
3. Si necesitás historial más viejo que lo que hay en `SESSION.md`, está en
   [`CHANGELOG.md`](./CHANGELOG.md).

## Reglas de trabajo

- **Mantené la arquitectura y el estilo existentes.** Este proyecto sigue un
  patrón consistente: transporte (nativo Kotlin) separado del armado de
  bytes ESC/POS (JS/TS), inyección de dependencias para poder testear sin
  hardware real, comentarios solo cuando explican un *por qué* no obvio. No
  introduzcas un patrón nuevo (state management, navegación, otro lenguaje)
  sin que el usuario lo pida explícitamente.
- **No hagas cambios innecesarios.** Sin refactors, limpieza, o
  "mejoras" no pedidas fuera del alcance de la tarea. Tres líneas repetidas
  son mejores que una abstracción prematura.
- **Documentá las decisiones importantes.** Si tomás una decisión de diseño
  no trivial (por qué un módulo nativo propio y no una librería, por qué un
  intervalo de polling específico, etc.), anotala en `SESSION.md` (estado
  vigente) y, cuando se archive, quedará en `CHANGELOG.md`.
- **No ejecutes `git commit` ni `git push`.** Dejá los cambios sin commitear
  para que el usuario revise y decida. Esto aplica salvo que el usuario lo
  pida explícitamente en el turno actual.
- **Código como fuente de verdad.** Si encontrás una discrepancia entre lo
  que dice `README.md`/`SESSION.md` y el estado real del código (un archivo
  que ya no existe, una función que cambió de firma, una dependencia que se
  agregó o quitó), el código manda: señalá la discrepancia al usuario y
  corregí la documentación para que quede alineada.
- **No toques el repo de la POS** (es un proyecto separado, en Vercel) salvo
  instrucción explícita del usuario.
- **Verificá antes de reportar éxito.** Este proyecto no puede probar
  impresión física en CI: usá el patrón de dependencias inyectadas/mocks ya
  establecido (`processPrintJob.ts`, `connectionStatus.ts`) para verificar
  lógica, y dejá explícito qué queda pendiente de verificación con hardware
  real. No afirmes que algo "imprime correctamente" sin haberlo verificado
  de alguna forma (test, build, o hardware real).

## Al terminar una sesión

- **Actualizá `SESSION.md`** con fecha y hora, qué se hizo, estado actual,
  pendientes, problemas conocidos, decisiones tomadas, y el siguiente paso
  recomendado. Hacé esto al finalizar la tarea, o **antes** de que la sesión
  se corte por límite de contexto (no esperes a último momento si notás que
  el contexto se está agotando).
- **Si `SESSION.md` supera ~150 líneas**, movés las entradas más viejas (todo
  lo que ya no sea "estado vigente") a `CHANGELOG.md`, con su fecha, y dejás
  `SESSION.md` corto y enfocado en el presente.
- No es necesario tocar `CHANGELOG.md` si no hay nada que archivar todavía.
