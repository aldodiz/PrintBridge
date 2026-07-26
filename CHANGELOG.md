# CHANGELOG

Historial de cambios y decisiones pasadas, retirado de `SESSION.md` a medida
que deja de ser "estado vigente". Orden cronológico ascendente (más viejo
arriba). No es un changelog de versiones semánticas — es historial de
trabajo por sesión/paso.

## Paso 24 — USB únicamente (versión inicial)

**Investigación de librerías (resultado):** no se encontró ninguna librería
de React Native activa que combine soporte de impresora USB genérica **y**
un método para mandar bytes ESC/POS crudos (arbitrarios) — requisito duro
para reutilizar el ticket ya armado en la POS (`lib/printer/receipt.ts`, con
logo rasterizado, cambio de fuente para folio/fecha, etc.):

| Librería | USB | Bytes crudos | Estado |
|---|---|---|---|
| `react-native-esc-pos-printer` (tr3v3r) | sí | no (solo Epson ePOS SDK, protocolo propietario) | mantenida, pero atada a impresoras Epson |
| `react-native-usb-escpos-printer` (Sunama) | sí | **no** — API revisada en código fuente (`RNUsbPrinterModule.java`): solo expone `printText`, `printColumn`, `printPic`, `printQRCode`, etc. Todo el armado de bytes ESC/POS pasa por un helper Java interno (`PrinterCommand`), nunca expuesto a JS | el adapter USB (permisos, bulk transfer) sí sirve de referencia |
| `react-native-thermal-receipt-printer` y forks | sí (Android) | no, mismo patrón que arriba (`printText`/`printBill`) | activa mantención en varios forks |
| `react-native-pos-printer` (gzero1) | **no** (USB listado como "Todo", sin implementar) | sí (encoder de comandos) | alfa, sin USB |
| `react-native-esc-pos` (leesiongchan) | no | no | archivada desde 2021 |

**Decisión:** módulo nativo Kotlin propio y mínimo
(`android/app/.../UsbPrinterModule.kt`). Solo hace transporte USB (enumerar
dispositivos, pedir permiso, `bulkTransfer` de un `byte[]`); el 100% del
formato del ticket vive en JS (`src/escpos/receipt.ts`), igual que en la
POS. Evita quedar atado a un encoding de texto ajeno (la mayoría de esas
librerías fuerza GBK, pensado para impresoras chinas de recibos, no para
nuestro Latin-1 con acentos).

**Hecho y verificado en ese entorno:** código, compilación Gradle real
(`./gradlew assembleDebug` → BUILD SUCCESSFUL), ejecución en emulador
Android (AVD Android 14 arm64 Pixel: se instaló el APK, se abrió, renderizó
la pantalla principal completa), polling end-to-end contra un servidor mock
real (`scripts/mock-print-jobs-server.js`, ticket de prueba folio
`F1TEST01`), camino de éxito y de fallo con tests automatizados
(`__tests__/processPrintJob.test.ts`, dependencias `UsbPrinter`/`confirmJob`
simuladas), manejo de errores, reintento manual. La impresora USB se reportó
correctamente como "no detectada" en el emulador (sin dispositivo físico
adjunto) — confirma que `getDeviceList()`/`isPrinterReady()` se llaman de
verdad desde JS sin crashear.

**Quedó pendiente (requiere hardware físico — Redmi Pad SE + impresora
OFICHIDO):** `npx react-native run-android` con el tablet conectado,
confirmar que la OFICHIDO aparece en "Dispositivos USB detectados" y agregar
su vendor-id/product-id a `device_filter.xml`, insertar un `PrintJob` de
prueba real y confirmar que sale un ticket físico impreso y que el trabajo
se marca confirmado.

**Dependencia pendiente en el backend de la POS** (verificada directamente
en el código de ese repo, no tocado): `GET /api/print-jobs/pending` y
`POST /api/print-jobs/:id/confirm` no existían — `lib/printer/print-order.ts`
solo tenía el comentario "queda pendiente encolarlo como PrintJob". No hay
modelo `PrintJob` en `prisma/schema.prisma`. Print Bridge se construyó
contra el contrato documentado en `src/api/printJobs.ts` (ver README).

## Paso 26 — soporte dual USB/WiFi + estado de conexión en tiempo real (2026-07-25)

**Qué se agregó respecto al Paso 24:**

- **Configuración** (`src/screens/SettingsScreen.tsx`, accesible desde
  "⚙️ Configurar" en la pantalla principal): selector USB/WiFi. Si se elige
  WiFi, aparecen los campos IP y puerto (default `9100`). Se persiste
  localmente con `AsyncStorage` (`src/printerConfig.ts`), no en el backend.
- **Transporte WiFi**: módulo nativo nuevo `WifiPrinterModule.kt` — mismo
  principio que `UsbPrinterModule.kt` (solo transporte, el armado de bytes
  ESC/POS sigue 100% en JS): abre un socket TCP crudo al `ip:puerto`
  configurado, manda el `byte[]` ya armado, cierra el socket.
  `checkConnection(ip, puerto)` hace lo mismo sin mandar bytes, solo para
  saber si la impresora responde.
- **`processPrintJob.ts` no cambió de forma**: ya usaba inyección de
  dependencias (`ensurePrinterReady`, `printBytes`, `confirmJob`), así que
  agregar WiFi fue conectar esas mismas dependencias a `WifiPrinterModule`
  en vez de `UsbPrinterModule` según el método configurado (ver
  `usePrintBridge.ts`, `processJob`). Manejo de error idéntico en ambos
  métodos: si falla la conexión, nunca se confirma el trabajo.
- **Estado de conexión en tiempo real** (`src/connectionStatus.ts` +
  `usePrintBridge.ts`): punto verde/rojo para el método activo en la
  pantalla principal.
  - **USB**: `UsbPrinterModule.kt` ahora escucha
    `ACTION_USB_DEVICE_ATTACHED`/`DETACHED` del sistema y emite un evento a
    JS (`UsbDeviceStateChanged`) apenas se conecta o desconecta el cable.
  - **WiFi**: chequeo periódico cada 12s, abre y cierra un socket corto sin
    imprimir nada.
  - Se muestra también estado del chequeo, hora del último chequeo, y hora
    del último trabajo impreso con éxito. Botón "Probar conexión" fuerza un
    chequeo inmediato.

**Tests nuevos** (mismo patrón de dependencias simuladas que ya usaba
`processPrintJob.test.ts` para USB):

- `__tests__/processPrintJob.test.ts` — bloque "camino WiFi": éxito, timeout,
  conexión rechazada; se verifica que nunca se llama a `confirmJob` sin
  haber impreso antes.
- `__tests__/connectionStatus.test.ts` — `checkConnectionStatus` con mocks
  para USB (listo/no listo) y WiFi (responde/timeout/rechaza/sin IP).

**Verificación real hecha en este paso:** se instaló JDK 21 + Android
command-line tools vía Homebrew (entorno nuevo, sin SDK previo).
`npx tsc --noEmit` sin errores, `npx jest` 21/21 tests en verde, `npx eslint`
sin errores (solo 2 warnings de estilo preexistentes). `./gradlew
assembleDebug` → **BUILD SUCCESSFUL en 7m30s, 125 tareas ejecutadas**,
incluyendo la compilación real de `WifiPrinterModule.kt`,
`WifiPrinterPackage.kt`, y `UsbPrinterModule.kt` con el receiver de
attach/detach nuevo.

**Quedó pendiente (requiere hardware físico):**
1. USB: mismo pendiente del Paso 24 (confirmar con la OFICHIDO real).
2. WiFi: no se tuvo acceso a una impresora térmica con interfaz de red (o
   adaptador serial-a-WiFi) en el entorno de desarrollo de este paso —
   pendiente confirmar que el punto de estado cambia de color en tiempo real
   con la impresora real, y que un ticket real sale impreso.
