// Lógica pura de "un trabajo de principio a fin": arma el ticket, imprime,
// confirma. Separada de usePrintBridge.ts (que solo maneja estado de React)
// para poder probar el camino de ÉXITO end-to-end con dependencias
// inyectadas/simuladas — nunca hay una impresora térmica real disponible en
// un entorno de CI/nube, así que esta es la forma estándar de verificar
// código de hardware sin hardware: se prueba la orquestación real con un
// UsbPrinter y un confirmJob simulados, igual que se prueba código de cobro
// con una pasarela de pago simulada en vez de una tarjeta real.
import { buildReceiptBytes } from "./escpos/receipt";
import type { PendingPrintJob } from "./api/printJobs";

export type ProcessJobDeps = {
  /** true si la impresora ya está lista para recibir bytes (detectada + con
   * permiso), pidiendo permiso si hace falta. */
  ensurePrinterReady: () => Promise<boolean>;
  printBytes: (bytes: number[]) => Promise<boolean>;
  confirmJob: (jobId: string) => Promise<void>;
};

export type ProcessJobResult = { ok: true } | { ok: false; message: string };

export async function processPrintJob(
  job: PendingPrintJob,
  deps: ProcessJobDeps
): Promise<ProcessJobResult> {
  const ready = await deps.ensurePrinterReady();
  if (!ready) {
    return { ok: false, message: "Impresora no detectada o sin permiso USB" };
  }

  let bytes: number[];
  try {
    bytes = buildReceiptBytes(job.ticket);
  } catch (error) {
    return { ok: false, message: `No se pudo armar el ticket: ${(error as Error).message}` };
  }

  try {
    await deps.printBytes(bytes);
  } catch (error) {
    return { ok: false, message: `Falló la impresión: ${(error as Error).message}` };
  }

  try {
    await deps.confirmJob(job.id);
  } catch (error) {
    // Se imprimió pero no se pudo confirmar: se deja como pendiente en el
    // servidor (nunca se confirma sin haber impreso). Puede reimprimirse en
    // el siguiente ciclo — se prefiere el riesgo de un duplicado ocasional
    // sobre el de nunca marcar la venta impresa.
    return {
      ok: false,
      message: `Se imprimió pero no se pudo confirmar: ${(error as Error).message}`,
    };
  }

  return { ok: true };
}
