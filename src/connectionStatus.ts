// Lógica pura de "¿la impresora del método activo está accesible ahora
// mismo?" — separada de usePrintBridge.ts (que solo maneja estado de React)
// para poder probar los dos métodos (USB, WiFi) con dependencias simuladas,
// igual patrón que processPrintJob.ts.
import type { PrinterConfig } from "./printerConfig";

export type ConnectionStatusDeps = {
  usbIsReady: () => Promise<boolean>;
  wifiCheckConnection: (ip: string, port: number) => Promise<boolean>;
};

/**
 * Nunca lanza: un chequeo de estado que falla (timeout, IP inválida, etc.)
 * simplemente significa "no conectado", no un error que deba interrumpir el
 * polling de estado.
 */
export async function checkConnectionStatus(
  config: PrinterConfig,
  deps: ConnectionStatusDeps
): Promise<boolean> {
  try {
    if (config.method === "usb") {
      return await deps.usbIsReady();
    }
    if (!config.wifiIp) return false;
    return await deps.wifiCheckConnection(config.wifiIp, config.wifiPort);
  } catch {
    return false;
  }
}
