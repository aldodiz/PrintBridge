# Print Bridge

App Android de un solo propósito: recoge trabajos de impresión pendientes de
la POS (Pancherías Cuaqu) por HTTP y los manda por USB/OTG a una impresora
térmica genérica (ESC/POS, probado para OFICHIDO 58mm). Proyecto separado
del repo de la POS — no depende de él en runtime, solo reutiliza (portado
a TypeScript) el mismo formato de ticket.

## Estado (Paso 24)

**Hecho y verificado en este entorno** (código, compilación Gradle real,
ejecución en emulador Android, polling contra servidor real, camino de
éxito y de fallo con tests automatizados — detalle completo más abajo):
investigación de librerías, módulo nativo Kotlin USB, puerto del formato de
ticket, cliente de polling/confirmación, UI, manejo de errores, reintento
manual.

**Pendiente — requiere el hardware físico, solo lo puede hacer alguien con
el Redmi Pad SE + la impresora OFICHIDO en la mano** (no es posible desde
ningún entorno de desarrollo/nube, ver la sección de verificación):
1. `npx react-native run-android` con el tablet conectado.
2. Confirmar que la OFICHIDO aparece en "Dispositivos USB detectados" y
   agregar su vendor-id/product-id a `device_filter.xml` (instrucciones ahí).
3. Insertar un `PrintJob` de prueba (o usar el mock de este repo) y
   confirmar que sale un ticket físico impreso y que el trabajo se marca
   confirmado.

También sigue pendiente, del lado del repo de la POS: implementar
`PrintJob` y `/api/print-jobs/*` (ver "Dependencia pendiente en el backend
de la POS" más abajo) — sin eso, Print Bridge no tiene de dónde jalar
trabajos reales todavía.

## Investigación de librerías (Paso 24) — resultado

**No se encontró ninguna librería de React Native activa que combine**
soporte de impresora USB genérica **y** un método para mandar bytes ESC/POS
crudos (arbitrarios) — que es el requisito duro para reutilizar el ticket ya
armado en la POS (`lib/printer/receipt.ts`, con logo rasterizado, cambio de
fuente para folio/fecha, etc.):

| Librería | USB | Bytes crudos | Estado |
|---|---|---|---|
| `react-native-esc-pos-printer` (tr3v3r) | sí | no (solo Epson ePOS SDK, protocolo propietario) | mantenida, pero atada a impresoras Epson |
| `react-native-usb-escpos-printer` (Sunama) | sí | **no** — API revisada en código fuente (`RNUsbPrinterModule.java`): solo expone `printText`, `printColumn`, `printPic`, `printQRCode`, etc. Todo el armado de bytes ESC/POS pasa por un helper Java interno (`PrinterCommand`), nunca expuesto a JS | el adapter USB (permisos, bulk transfer) sí sirve de referencia |
| `react-native-thermal-receipt-printer` y forks | sí (Android) | no, mismo patrón que arriba (`printText`/`printBill`) | activa mantención en varios forks |
| `react-native-pos-printer` (gzero1) | **no** (USB listado como "Todo", sin implementar) | sí (encoder de comandos) | alfa, sin USB |
| `react-native-esc-pos` (leesiongchan) | no | no | archivada desde 2021 |

**Decisión:** módulo nativo Kotlin propio y mínimo
(`android/app/.../UsbPrinterModule.kt`), como alternativa explícitamente
prevista en el encargo si no había librería viable. Solo hace transporte USB
(enumerar dispositivos, pedir permiso, `bulkTransfer` de un `byte[]`); el
100% del formato del ticket vive en JS (`src/escpos/receipt.ts`), igual que
en la POS. Esto evita además quedar atado a un encoding de texto ajeno
(la mayoría de esas librerías fuerza GBK para el texto, pensado para
impresoras chinas de recibos, no para nuestro Latin-1 con acentos).

## Arquitectura

- `android/app/src/main/java/com/printbridge/app/UsbPrinterModule.kt` — USB
  Host API: `getDeviceList`, `isPrinterReady`, `requestPermission`,
  `printBytes(bytes)`. Detecta la impresora por clase USB "Printer" (7) o,
  si no hay ninguna así, el único dispositivo conectado.
- `src/escpos/receipt.ts` — puerto 1:1 de `lib/printer/receipt.ts` de la POS
  (mismo negocio, folio/fecha al final en Font B, items con modificadores,
  pago único o mixto con referencia, mensaje de cierre).
- `src/escpos/logoRasterCommand.ts` — el comando ESC/POS del logo
  (`assets/logo-bw.png` de la POS) **precalculado una sola vez** con el
  propio `lib/printer/logo.ts` de la POS y congelado como bytes fijos: React
  Native no trae `zlib`/`fs` de Node para decodificar el PNG en runtime. Si
  el logo cambia en la POS, hay que regenerar este archivo (ver comentario
  en el archivo).
- `src/api/printJobs.ts` — cliente de `GET /api/print-jobs/pending` y
  `POST /api/print-jobs/:id/confirm`.
- `src/usePrintBridge.ts` — orquesta polling (cada 4s) + impresión +
  confirmación + reintento manual.
- `src/screens/HomeScreen.tsx` — única pantalla: URL del servidor, estado de
  la impresora, estado del polling, último resultado, botón de reintento.

## ⚠️ Dependencia pendiente en el backend de la POS

`GET /api/print-jobs/pending` y `POST /api/print-jobs/:id/confirm`
**no existen todavía** en el repo de la POS — se verificó directamente en el
código (`lib/printer/print-order.ts` solo tiene el comentario "queda
pendiente encolarlo como PrintJob para que el bridge lo recoja"). No hay
modelo `PrintJob` en `prisma/schema.prisma`. Por instrucción explícita de
este paso **no se tocó el repo de la POS**, así que Print Bridge se
construyó contra el contrato documentado en `src/api/printJobs.ts`:

```
GET  {baseUrl}/api/print-jobs/pending
  -> 200 { jobs: Array<{ id: string, ticket: ReceiptData }> }  (o un array plano)

POST {baseUrl}/api/print-jobs/:id/confirm
  -> 200 (cualquier body) al confirmar impreso
```

`ReceiptData` es exactamente el mismo shape que ya devuelve
`GET /api/orders/:id/receipt` en la POS (folio, fecha, items con
modificadores, pagos con método/monto/referencia, total) — lo más simple
para implementar `/api/print-jobs/pending` en la POS sería una tabla
`PrintJob` con `orderId` + `status`, y reusar `loadOrderReceiptData` para
construir el campo `ticket` de cada trabajo pendiente.

**Antes de dar por terminado este paso en producción, alguien debe:**
1. Crear el modelo `PrintJob` (status: pending/printed) y los 2 endpoints en
   el repo de la POS.
2. Encolar un `PrintJob` cada vez que se cobra una orden (en vez de que
   `/api/print` intente imprimir directo, como hoy).
3. Confirmar que el shape de `ticket` coincide con `ReceiptData` de este
   proyecto (`src/escpos/receipt.ts`) — si cambia, hay que ajustar ambos.

## ✅ Verificación real hecha en este entorno

Este entorno no traía Android SDK/Java instalado, pero se instaló todo vía
Homebrew (`android-commandlinetools`, `openjdk@21`) y se corrió un ciclo
completo real, no solo type-check:

- **`./gradlew assembleDebug` compiló e incluyó `UsbPrinterModule.kt`**
  (BUILD SUCCESSFUL, solo warnings menores ya corregidos).
- **Se creó un AVD (Android 14, arm64, Pixel) y la app corrió en él**:
  se instaló el APK, se abrió, y renderizó la pantalla principal completa
  (título, campo de servidor, estado de impresora, switch de polling).
- **La impresora USB se reportó correctamente como "no detectada"** — el
  emulador no tiene un dispositivo USB físico adjunto, así que ese es el
  resultado correcto; confirma que `UsbPrinterModule.getDeviceList()` /
  `isPrinterReady()` se llaman de verdad desde JS sin crashear.
- **Polling end-to-end contra un servidor real**: se levantó un mock local
  (`scripts/mock-print-jobs-server.js`) con el contrato documentado abajo y
  un ticket de prueba con texto real (folio `F1TEST01`, ChoriDog, etc.). La
  app hizo `GET /api/print-jobs/pending` cada ~4s (confirmado en el log del
  servidor), mostró el folio real en pantalla, y al no haber impresora
  **mostró el error visible "Ticket F1TEST01: Impresora no detectada o sin
  permiso USB" sin confirmar el trabajo** (se verificó que el mock nunca
  recibió el POST de confirm) — exactamente el comportamiento pedido en el
  punto 6. El botón "Reintentar ticket F1TEST01" apareció y funcionó sin
  crashear al tocarlo.
- **Camino de ÉXITO (imprimir + confirmar) verificado con dependencias
  simuladas** (`__tests__/processPrintJob.test.ts`): la orquestación real
  (`src/processPrintJob.ts`) se extrajo de `usePrintBridge.ts` para poder
  inyectarle un `UsbPrinter`/`confirmJob` simulados y probar el flujo
  completo automatizado — no hay forma de tener una impresora térmica
  física en un entorno de CI, así que esta es la técnica estándar para
  verificar código de hardware sin hardware (igual que probar un cobro con
  una pasarela de pago simulada en vez de una tarjeta real). Los tests
  confirman: (a) con la impresora "lista", el ticket con texto real (folio,
  negocio, items) se manda a imprimir y **el trabajo se confirma por su id
  exacto**; (b) si la impresora no está lista, si falla la escritura USB, o
  si falla la confirmación por red, **nunca se llama a confirm sin haber
  impreso antes** — en los 3 casos de error se verifica explícitamente que
  `confirmJob` no se invocó (o si ya se había impreso, que sí se había
  llamado a imprimir primero).

**Lo único que de verdad no se pudo probar, porque requiere un objeto físico
que no existe en ningún entorno de nube (no es cuestión de herramientas ni
de esfuerzo)**: que la OFICHIDO real responda al `bulkTransfer` de
`UsbPrinterModule.kt` y saque papel impreso. Ver la sección siguiente para
ese último paso, que solo se puede hacer con el Redmi Pad SE + la impresora
conectados de verdad.

## Cómo probarlo con hardware real

```
cd PrintBridge
npm install
npx react-native run-android   # con el tablet conectado por USB-debug, o un emulador
```

1. **Obtener el vendor-id/product-id real de la OFICHIDO**: conectar la
   impresora por USB/OTG, abrir la app — la pantalla principal lista los
   dispositivos USB detectados con sus IDs. Opcionalmente, agregarlos a
   `android/app/src/main/res/xml/device_filter.xml` para que conectar la
   impresora abra la app automáticamente (ver comentario en ese archivo).
2. **Probar el polling sin esperar al backend real**: levantar un mock
   rápido (`json-server`, o una función serverless de prueba) que responda
   el contrato de arriba con un ticket de ejemplo, y poner esa URL en el
   campo de la app. También sirve insertar una fila de prueba directamente
   en la tabla `PrintJob` de la POS una vez exista.
3. Activar el switch de polling y confirmar que el ticket se imprime con
   texto real (nombre del negocio, folio, items) y que el trabajo se marca
   confirmado (deja de aparecer en `/pending`).
4. Para probar el flujo de error: desconectar la impresora a mitad de un
   ciclo — debe aparecer el error en pantalla y el botón "Reintentar".
