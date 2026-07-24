// Orquesta todo el flujo: polling a la POS, armado del ticket, impresión por
// USB, y confirmación. Vive separado de la UI (HomeScreen) para que la
// pantalla solo se preocupe de mostrar estado.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { UsbPrinter, type UsbDeviceInfo } from "./native/UsbPrinter";
import { confirmJob, fetchPendingJobs, type PendingPrintJob } from "./api/printJobs";
import { processPrintJob } from "./processPrintJob";

const BASE_URL_STORAGE_KEY = "printBridge.baseUrl";
const POLL_INTERVAL_MS = 4000;

export type LastResult =
  | { status: "idle" }
  | { status: "printing"; folio: string }
  | { status: "success"; folio: string }
  | { status: "error"; folio?: string; message: string };

export function usePrintBridge() {
  const [baseUrl, setBaseUrlState] = useState("");
  const [baseUrlLoaded, setBaseUrlLoaded] = useState(false);
  const [polling, setPolling] = useState(false);
  const [usbReady, setUsbReady] = useState(false);
  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [lastResult, setLastResult] = useState<LastResult>({ status: "idle" });
  const [failedJob, setFailedJob] = useState<PendingPrintJob | null>(null);

  // Evita que dos ciclos de polling se pisen si uno tarda más que el
  // intervalo (impresora lenta, red lenta).
  const processingRef = useRef(false);
  const baseUrlRef = useRef("");

  useEffect(() => {
    AsyncStorage.getItem(BASE_URL_STORAGE_KEY).then((stored) => {
      if (stored) {
        setBaseUrlState(stored);
        baseUrlRef.current = stored;
      }
      setBaseUrlLoaded(true);
    });
  }, []);

  const setBaseUrl = useCallback((value: string) => {
    setBaseUrlState(value);
    baseUrlRef.current = value;
    AsyncStorage.setItem(BASE_URL_STORAGE_KEY, value).catch(() => {
      // no crítico: si falla persistir, solo se pierde el valor al reabrir.
    });
  }, []);

  const refreshUsbStatus = useCallback(async () => {
    const [devices, ready] = await Promise.all([
      UsbPrinter.getDeviceList(),
      UsbPrinter.isPrinterReady(),
    ]);
    setUsbDevices(devices);
    setUsbReady(ready);
    return ready;
  }, []);

  useEffect(() => {
    refreshUsbStatus();
  }, [refreshUsbStatus]);

  /** Procesa UN trabajo: arma bytes, pide permiso si falta, imprime, confirma.
   * La orquestación real vive en processPrintJob.ts (con dependencias
   * inyectadas, testeada ahí con un UsbPrinter simulado); aquí solo se
   * conectan las dependencias reales y se refleja el resultado en estado. */
  const processJob = useCallback(
    async (job: PendingPrintJob): Promise<boolean> => {
      setLastResult({ status: "printing", folio: job.ticket.folio });

      const result = await processPrintJob(job, {
        ensurePrinterReady: async () => {
          const ready = await refreshUsbStatus();
          if (ready) return true;
          return UsbPrinter.requestPermission();
        },
        printBytes: (bytes) => UsbPrinter.printBytes(bytes),
        confirmJob: (jobId) => confirmJob(baseUrlRef.current, jobId),
      });

      if (!result.ok) {
        setLastResult({ status: "error", folio: job.ticket.folio, message: result.message });
        setFailedJob(job);
        return false;
      }

      setLastResult({ status: "success", folio: job.ticket.folio });
      setFailedJob(null);
      return true;
    },
    [refreshUsbStatus]
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
    usbReady,
    usbDevices,
    refreshUsbStatus,
    lastResult,
    failedJob,
    retryFailedJob,
  };
}
