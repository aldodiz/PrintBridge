// Configuración local del método de impresión (USB u WiFi), persistida en el
// dispositivo con AsyncStorage — no depende del servidor de la POS.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PrinterMethod = "usb" | "wifi";

export type PrinterConfig = {
  method: PrinterMethod;
  wifiIp: string;
  wifiPort: number;
};

export const DEFAULT_WIFI_PORT = 9100;

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  method: "usb",
  wifiIp: "",
  wifiPort: DEFAULT_WIFI_PORT,
};

const STORAGE_KEY = "printBridge.printerConfig";

export async function loadPrinterConfig(): Promise<PrinterConfig> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_PRINTER_CONFIG;
  try {
    const parsed = JSON.parse(stored);
    return {
      method: parsed.method === "wifi" ? "wifi" : "usb",
      wifiIp: typeof parsed.wifiIp === "string" ? parsed.wifiIp : "",
      wifiPort: Number.isFinite(parsed.wifiPort) ? parsed.wifiPort : DEFAULT_WIFI_PORT,
    };
  } catch {
    return DEFAULT_PRINTER_CONFIG;
  }
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
