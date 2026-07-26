# Print Bridge

App Android de un solo propósito: recoge trabajos de impresión pendientes de
la POS (Pancherías Cuaqu) por HTTP y los manda a una impresora térmica
genérica ESC/POS (probado para OFICHIDO 58mm), por **USB/OTG o por WiFi**
(TCP directo al puerto crudo de la impresora, configurable desde la app).
Proyecto separado del repo de la POS — no depende de él en runtime, solo
reutiliza (portado a TypeScript) el mismo formato de ticket.

> Para el estado actual del trabajo, tareas pendientes y contexto de la
> sesión en curso, ver [`SESSION.md`](./SESSION.md). El historial de
> decisiones y cambios pasados está en [`CHANGELOG.md`](./CHANGELOG.md).
> Si vas a trabajar en este proyecto con un asistente de IA, leé
> [`AGENTS.md`](./AGENTS.md) primero.

## Propósito

- Reemplazar la impresión directa desde el navegador/servidor de la POS por
  un puente dedicado que corre en una tablet Android junto a la impresora.
- La POS encola trabajos de impresión (`PrintJob`) en vez de intentar
  imprimir ella misma; Print Bridge hace polling, imprime, y confirma.
- Soportar dos formas de conectar la impresora térmica sin cambiar el
  formato del ticket: **USB/OTG** (Android USB Host API) o **WiFi** (socket
  TCP crudo al puerto ESC/POS estándar, por defecto `9100`).
- Mostrar en todo momento el estado de conexión de la impresora (conectada/no
  conectada) para que quien opera la tablet pueda diagnosticar rápido.

## Tecnologías utilizadas

- **React Native 0.86** + **React 19** + **TypeScript 5**.
- **Kotlin** para los módulos nativos Android (`UsbPrinterModule`,
  `WifiPrinterModule`) — no hay librería de npm que exponga tanto transporte
  USB genérico como envío de bytes ESC/POS crudos (ver
  [CHANGELOG.md](./CHANGELOG.md) para el detalle de la investigación de
  librerías que llevó a esta decisión).
- **Android USB Host API** para el transporte USB; sockets `java.net.Socket`
  crudos para el transporte WiFi (no HTTP, protocolo raw ESC/POS por TCP).
- **`@react-native-async-storage/async-storage`** para persistir
  configuración local en el dispositivo (URL de la POS, método de impresión,
  IP/puerto WiFi).
- **Jest** + **react-test-renderer** para tests unitarios; **ESLint** +
  **Prettier** para estilo de código.
- **Gradle** (AGP + Kotlin) para el build Android; `compileSdk`/`targetSdk`
  36, `minSdk` 24 (ver `android/build.gradle`).

## Instalación

Requiere Node ≥ 22.11 (ver `engines` en `package.json`), y para compilar
Android: JDK 21 y Android SDK (`platform-tools`, `platforms;android-36`,
`build-tools;36.0.0`). En macOS, si no los tenés instalados:

```bash
brew install openjdk@21 android-commandlinetools
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "sdk.dir=$(brew --prefix)/share/android-commandlinetools" > android/local.properties
```

Luego, dependencias del proyecto:

```bash
cd PrintBridge
npm install
```

## Ejecución

```bash
npm start              # Metro bundler
npm run android         # build + instala en tablet/emulador conectado
npm test                # suite de Jest
npm run lint            # ESLint
```

Para compilar solo el APK debug sin lanzarlo:

```bash
cd android && ./gradlew assembleDebug
```

### Probarlo con hardware real

1. **USB**: conectar la impresora por USB/OTG, abrir la app — la pantalla
   principal lista los dispositivos USB detectados con su vendor-id/
   product-id. Opcionalmente agregarlos a
   `android/app/src/main/res/xml/device_filter.xml` para que conectar la
   impresora abra la app automáticamente.
2. **WiFi**: en la pantalla de Configurar, elegir método WiFi e ingresar la
   IP y puerto (default `9100`) de la impresora en la red local.
3. **Probar el polling sin esperar al backend real de la POS**: levantar
   `node scripts/mock-print-jobs-server.js` (implementa el contrato
   documentado en `src/api/printJobs.ts`) y poner `http://localhost:PUERTO`
   (o la IP de la máquina si es un dispositivo físico) como servidor de la
   POS en la app.
4. Activar el switch de polling y confirmar que el ticket se imprime con
   texto real y que el trabajo se marca confirmado (deja de aparecer en
   `/pending`). Para probar el flujo de error, desconectar la impresora a
   mitad de un ciclo — debe aparecer el error en pantalla y el botón
   "Reintentar".

## Estructura del proyecto

```
android/app/src/main/java/com/printbridge/app/
  UsbPrinterModule.kt     # transporte USB Host API + evento attach/detach
  UsbPrinterPackage.kt
  WifiPrinterModule.kt    # transporte TCP crudo (checkConnection, printBytes)
  WifiPrinterPackage.kt
  MainActivity.kt
  MainApplication.kt      # registra los dos ReactPackage nativos
src/
  api/printJobs.ts        # cliente GET /pending, POST /:id/confirm
  escpos/receipt.ts        # armado de bytes ESC/POS del ticket (puerto de la POS)
  escpos/logoRasterCommand.ts  # bytes fijos del logo, precalculados
  native/UsbPrinter.ts     # wrapper tipado del módulo nativo USB
  native/WifiPrinter.ts    # wrapper tipado del módulo nativo WiFi
  printerConfig.ts         # persistencia local: método USB/WiFi, IP, puerto
  connectionStatus.ts      # lógica pura: ¿está conectada la impresora activa?
  processPrintJob.ts        # orquestación de un trabajo: imprimir + confirmar
  usePrintBridge.ts         # hook: polling, estado, conexión, dependencias reales
  screens/HomeScreen.tsx     # pantalla principal: estado, polling, resultado
  screens/SettingsScreen.tsx # selector de método + IP/puerto WiFi
__tests__/                 # Jest: receipt, processPrintJob, connectionStatus, App
scripts/mock-print-jobs-server.js  # servidor mock del contrato de la POS
```

### Arquitectura de impresión

- El armado de bytes ESC/POS (`src/escpos/receipt.ts`) es **independiente
  del transporte**: no sabe ni le importa si el resultado se manda por USB o
  WiFi.
- `src/processPrintJob.ts` orquesta "arma ticket → imprime → confirma" con
  **inyección de dependencias** (`ensurePrinterReady`, `printBytes`,
  `confirmJob`); no conoce el método de transporte, solo llama a las
  funciones que le pasan. Esto permite testear el flujo completo con
  impresoras simuladas (no hay forma de tener hardware térmico real en CI).
- `src/usePrintBridge.ts` conecta esas dependencias a `UsbPrinter` o
  `WifiPrinter` según `printerConfig.method`, y mantiene el estado de
  conexión (chequeo periódico cada ~12s + eventos en tiempo real para USB).
- **Regla de error no negociable, igual para ambos métodos**: si falla la
  conexión o la impresión (USB no detectado, WiFi timeout/rechazado), el
  trabajo **nunca se confirma** — queda pendiente para reintentar. Se
  prefiere el riesgo de un duplicado ocasional sobre el de perder una venta
  sin ticket impreso.

### Contrato con el backend de la POS

`src/api/printJobs.ts` asume este contrato (documentado ahí mismo, y
replicado por `scripts/mock-print-jobs-server.js` para poder desarrollar sin
el backend real):

```
GET  {baseUrl}/api/print-jobs/pending
  -> 200 { jobs: Array<{ id: string, ticket: ReceiptData }> }  (o un array plano)

POST {baseUrl}/api/print-jobs/:id/confirm
  -> 200 (cualquier body) al confirmar impreso
```

`ReceiptData` es el mismo shape que devuelve `GET /api/orders/:id/receipt`
en el repo de la POS. **Este proyecto no toca el repo de la POS** — ver
[SESSION.md](./SESSION.md) para el estado de esa dependencia pendiente.

## Notas para un desarrollador nuevo

- No hay librería de npm viable para USB genérico + bytes ESC/POS crudos;
  por eso existen los módulos nativos Kotlin propios. Antes de agregar una
  librería de impresión térmica, revisar si de verdad expone un método para
  mandar un `byte[]` arbitrario (la mayoría no lo hace, ver CHANGELOG).
- El logo del ticket está precalculado como bytes fijos
  (`src/escpos/logoRasterCommand.ts`) porque React Native no trae `zlib`/`fs`
  de Node para decodificar el PNG en runtime. Si el logo cambia en la POS,
  hay que regenerar este archivo (ver comentario ahí).
- No hay forma de probar impresión física (USB o WiFi) en un entorno de
  desarrollo/CI — el patrón de este repo es testear la orquestación con
  dependencias simuladas (`__tests__/processPrintJob.test.ts`,
  `__tests__/connectionStatus.test.ts`), igual que se prueba un cobro con una
  pasarela de pago simulada en vez de una tarjeta real.
