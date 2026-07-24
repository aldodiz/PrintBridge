// Wrapper tipado del módulo nativo Kotlin (ver android/.../UsbPrinterModule.kt).
// Solo transporte USB: enumerar dispositivos, pedir permiso, mandar bytes
// crudos. El armado del ticket vive en src/escpos/receipt.ts.
import { NativeModules } from "react-native";

export type UsbDeviceInfo = {
  deviceName: string;
  vendorId: number;
  productId: number;
  hasPermission: boolean;
  looksLikePrinter: boolean;
};

type UsbPrinterModuleType = {
  getDeviceList(): Promise<UsbDeviceInfo[]>;
  isPrinterReady(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  printBytes(bytes: number[]): Promise<boolean>;
};

const { UsbPrinterModule } = NativeModules as { UsbPrinterModule?: UsbPrinterModuleType };

if (!UsbPrinterModule) {
  // Pasa en iOS (no soportado, ver README) o si el autolinking falló — mejor
  // fallar claro aquí que con un `undefined is not a function` más abajo.
  console.warn(
    "UsbPrinterModule nativo no disponible: ¿corriendo en iOS, o falta reconstruir la app Android?"
  );
}

export const UsbPrinter: UsbPrinterModuleType = {
  getDeviceList: () => UsbPrinterModule?.getDeviceList() ?? Promise.resolve([]),
  isPrinterReady: () => UsbPrinterModule?.isPrinterReady() ?? Promise.resolve(false),
  requestPermission: () => UsbPrinterModule?.requestPermission() ?? Promise.resolve(false),
  printBytes: (bytes: number[]) =>
    UsbPrinterModule?.printBytes(bytes) ??
    Promise.reject(new Error("UsbPrinterModule nativo no disponible")),
};
