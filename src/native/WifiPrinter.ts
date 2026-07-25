// Wrapper tipado del módulo nativo Kotlin (ver
// android/.../WifiPrinterModule.kt). Solo transporte TCP: chequeo de
// disponibilidad y envío de bytes crudos. El armado del ticket sigue
// viviendo en src/escpos/receipt.ts, igual que para USB.
import { NativeModules } from "react-native";

type WifiPrinterModuleType = {
  checkConnection(ip: string, port: number): Promise<boolean>;
  printBytes(ip: string, port: number, bytes: number[]): Promise<boolean>;
};

const { WifiPrinterModule } = NativeModules as { WifiPrinterModule?: WifiPrinterModuleType };

if (!WifiPrinterModule) {
  console.warn(
    "WifiPrinterModule nativo no disponible: ¿corriendo en iOS, o falta reconstruir la app Android?"
  );
}

export const WifiPrinter: WifiPrinterModuleType = {
  checkConnection: (ip, port) =>
    WifiPrinterModule?.checkConnection(ip, port) ?? Promise.resolve(false),
  printBytes: (ip, port, bytes) =>
    WifiPrinterModule?.printBytes(ip, port, bytes) ??
    Promise.reject(new Error("WifiPrinterModule nativo no disponible")),
};
