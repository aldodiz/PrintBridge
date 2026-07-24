// Cliente del endpoint de cola de impresión de la POS.
//
// IMPORTANTE (ver reporte del Paso 24): /api/print-jobs/pending y
// /api/print-jobs/:id/confirm NO EXISTEN todavía en el repo de la POS al
// escribir esto (se verificó directamente en el código: print-order.ts solo
// deja el comentario "queda pendiente encolarlo como PrintJob"). Este
// archivo asume el contrato documentado abajo; hay que confirmarlo o
// ajustarlo cuando ese endpoint se implemente en la POS.
//
// Contrato asumido:
//   GET  {baseUrl}/api/print-jobs/pending
//     -> 200 { jobs: PendingPrintJob[] }  (o un array plano, se acepta cualquiera)
//   POST {baseUrl}/api/print-jobs/:id/confirm
//     -> 200 al confirmar impreso
import type { ReceiptData } from "../escpos/receipt";

export type PendingPrintJob = {
  /** id del PrintJob (no el id de la orden) — se usa para /confirm. */
  id: string;
  /** Mismo shape que ya devuelve GET /api/orders/:id/receipt en la POS. */
  ticket: ReceiptData;
};

export class PrintJobsApiError extends Error {}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function fetchPendingJobs(baseUrl: string): Promise<PendingPrintJob[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/print-jobs/pending`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new PrintJobsApiError(`No se pudo contactar ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new PrintJobsApiError(`GET /api/print-jobs/pending respondió ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body) ? body : (body.jobs ?? []);
}

export async function confirmJob(baseUrl: string, jobId: string): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/print-jobs/${jobId}/confirm`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST" });
  } catch (error) {
    throw new PrintJobsApiError(`No se pudo contactar ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new PrintJobsApiError(`POST /api/print-jobs/:id/confirm respondió ${response.status}`);
  }
}
