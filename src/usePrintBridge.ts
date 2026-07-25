// Orquesta todo el flujo: polling a la POS, armado del ticket, impresión por
// USB o WiFi (según configuración), confirmación, y el chequeo periódico de
// estado de conexión de la impresora. Vive separado de la UI (HomeScreen)
// para que la pantalla solo se preocupe de mostrar estado.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { UsbPrinter, subscribeToUsbDeviceChanges, type UsbDeviceInfo } from "./native/UsbPrinter";
import { WifiPrinter } from "./native/WifiPrinter";
import { confirmJob, fetchPendingJobs, type PendingPrintJob } from "./api/printJobs";
import { processPrintJob } from "./processPrintJob";
import { checkConnectionStatus } from "./connectionStatus";
import {
  DEFAULT_PRINTER_CONFIG,
  loadPrinterConfig,
  savePrinterConfig,
  type PrinterConfig,
} from "./printerConfig";

const BASE_URL_STORAGE_KEY = "printBridge.baseUrl";
const POLL_INTERVAL_MS = 4000;
const CONNECTION_CHECK_INTERVAL_MS = 12000;

export type LastResult =
  | { status: "idle" }
  | { status: "printing"; folio: string }
  | { status: "success"; folio: string }
  | { status: "error"; folio?: string; message: string };

export function usePrintBridge() {
  const [baseUrl, setBaseUrlState] = useState("");
  const [baseUrlLoaded, setBaseUrlLoaded] = useState(false);
  const [polling, setPolling] = useState(false);
  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [lastResult, setLastResult] = useState<LastResult>({ status: "idle" });
  const [failedJob, setFailedJob] = useState<PendingPrintJob | null>(null);

  const [printerConfig, setPrinterConfigState] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG);
  const [printerConfigLoaded, setPrinterConfigLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<Date | null>(null);

  // Evita que dos ciclos de polling se pisen si uno tarda más que el
  // intervalo (impresora lenta, red lenta).
  const processingRef = useRef(false);
  const baseUrlRef = useRef("");
  const printerConfigRef = useRef(printerConfig);

  useEffect(() => {
    AsyncStorage.getItem(BASE_URL_STORAGE_KEY).then((stored) => {
      if (stored) {
        setBaseUrlState(stored);
        baseUrlRef.current = stored;
      }
      setBaseUrlLoaded(true);
    });
  }, []);

  useEffect(() => {
    loadPrinterConfig().then((config) => {
      setPrinterConfigState(config);
      printerConfigRef.current = config;
      setPrinterConfigLoaded(true);
    });
  }, []);

  const setBaseUrl = useCallback((value: string) => {
    setBaseUrlState(value);
    baseUrlRef.current = value;
    AsyncStorage.setItem(BASE_URL_STORAGE_KEY, value).catch(() => {
      // no crítico: si falla persistir, solo se pierde el valor al reabrir.
    });
  }, []);

  const setPrinterConfig = useCallback((config: PrinterConfig) => {
    setPrinterConfigState(config);
    printerConfigRef.current = config;
    savePrinterConfig(config).catch(() => {
      // no crítico: si falla persistir, solo se pierde el valor al reabrir.
    });
  }, []);

  const refreshUsbStatus = useCallback(async () => {
    const [devices, ready] = await Promise.all([
      UsbPrinter.getDeviceList(),
      UsbPrinter.isPrinterReady(),
    ]);
    setUsbDevices(devices);
    return ready;
  }, []);

  useEffect(() => {
    refreshUsbStatus();
  }, [refreshUsbStatus]);

  /** Chequeo de estado de conexión (no imprime nada): usado por el polling
   * periódico de la pantalla principal y por el botón "Probar conexión". */
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setCheckingConnection(true);
    try {
      const [ok] = await Promise.all([
        checkConnectionStatus(printerConfigRef.current, {
          usbIsReady: refreshUsbStatus,
          wifiCheckConnection: (ip, port) => WifiPrinter.checkConnection(ip, port),
        }),
      ]);
      setConnected(ok);
      setLastCheckedAt(new Date());
      return ok;
    } finally {
      setCheckingConnection(false);
    }
  }, [refreshUsbStatus]);

  // Chequeo periódico de estado (cada ~12s), independiente del polling de
  // trabajos de impresión — corre siempre que la config ya cargó, para que
  // la pantalla principal muestre el estado real sin que el operador tenga
  // que activar nada.
  useEffect(() => {
    if (!printerConfigLoaded) return;
    checkConnection();
    const interval = setInterval(checkConnection, CONNECTION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [printerConfigLoaded, printerConfig.method, printerConfig.wifiIp, printerConfig.wifiPort, checkConnection]);

  // Detección en tiempo real de conexión/desconexión USB (además del
  // polling periódico de arriba, que cubre también el caso WiFi).
  useEffect(() => {
    return subscribeToUsbDeviceChanges(() => {
      if (printerConfigRef.current.method === "usb") checkConnection();
    });
  }, [checkConnection]);

  /** Procesa UN trabajo: arma bytes, pide permiso si falta, imprime, confirma.
   * La orquestación real vive en processPrintJob.ts (con dependencias
   * inyectadas, testeada ahí con impresoras USB/WiFi simuladas); aquí solo se
   * conectan las dependencias reales (según el método configurado) y se
   * refleja el resultado en estado. */
  const processJob = useCallback(
    async (job: PendingPrintJob): Promise<boolean> => {
      setLastResult({ status: "printing", folio: job.ticket.folio });

      const config = printerConfigRef.current;
      const result = await processPrintJob(job, {
        ensurePrinterReady:
          config.method === "usb"
            ? async () => {
                const ready = await refreshUsbStatus();
                if (ready) return true;
                return UsbPrinter.requestPermission();
              }
            : async () => WifiPrinter.checkConnection(config.wifiIp, config.wifiPort),
        printBytes:
          config.method === "usb"
            ? (bytes) => UsbPrinter.printBytes(bytes)
            : (bytes) => WifiPrinter.printBytes(config.wifiIp, config.wifiPort, bytes),
        confirmJob: (jobId) => confirmJob(baseUrlRef.current, jobId),
      });

      if (!result.ok) {
        setLastResult({ status: "error", folio: job.ticket.folio, message: result.message });
        setFailedJob(job);
        checkConnection();
        return false;
      }

      setLastResult({ status: "success", folio: job.ticket.folio });
      setFailedJob(null);
      setLastSuccessAt(new Date());
      setConnected(true);
      return true;
    },
    [refreshUsbStatus, checkConnection]
  );

  const pollOnce = useCallback(async () => {
    if (processingRef.current) return;
    if (!baseUrlRef.current) return;
    processingRef.current = true;
    try {
      const jobs = await fetchPendingJobs(baseUrlRef.current);
      for (const job of jobs) {
        const ok = await processJob(job);
        if (!ok) break; // no seguir martillando si la impresora está mal
      }
    } catch (error) {
      setLastResult({ status: "error", message: (error as Error).message });
    } finally {
      processingRef.current = false;
    }
  }, [processJob]);

  useEffect(() => {
    if (!polling) return;
    pollOnce();
    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, pollOnce]);

  const retryFailedJob = useCallback(() => {
    if (failedJob) processJob(failedJob);
  }, [failedJob, processJob]);

  return {
    baseUrl,
    baseUrlLoaded,
    setBaseUrl,
    polling,
    setPolling,
    usbDevices,
    refreshUsbStatus,
    lastResult,
    failedJob,
    retryFailedJob,
    printerConfig,
    printerConfigLoaded,
    setPrinterConfig,
    connected,
    checkingConnection,
    lastCheckedAt,
    lastSuccessAt,
    checkConnection,
  };
}
