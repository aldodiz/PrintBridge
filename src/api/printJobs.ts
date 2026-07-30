// Cliente del endpoint de cola de impresión de la POS.
//
// Contrato (ya implementado en el repo de la POS, ver
// lib/printer/print-jobs.ts y app/api/print-jobs/*):
//   GET  {baseUrl}/api/print-jobs/pending
//     -> 200 { jobs: PendingPrintJob[] }  (o un array plano, se acepta cualquiera)
//     -> 401 si falta o no coincide el header del token
//   POST {baseUrl}/api/print-jobs/:id/confirm
//     -> 200 al confirmar impreso
//     -> 401 si falta o no coincide el header del token
//
// Ambas rutas están fuera del login normal de la POS (el dispositivo que
// imprime no tiene sesión de cajero) y en su lugar exigen un token
// compartido en el header "X-Print-Bridge-Token", que debe coincidir con la
// env var PRINT_BRIDGE_TOKEN configurada en el backend.
import type { ReceiptData } from "../escpos/receipt";

const TOKEN_HEADER = "X-Print-Bridge-Token";

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

export async function fetchPendingJobs(baseUrl: string, token: string): Promise<PendingPrintJob[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/print-jobs/pending`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { [TOKEN_HEADER]: token } });
  } catch (error) {
    throw new PrintJobsApiError(`No se pudo contactar ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new PrintJobsApiError(`GET /api/print-jobs/pending respondió ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body) ? body : (body.jobs ?? []);
}

export async function confirmJob(baseUrl: string, token: string, jobId: string): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/print-jobs/${jobId}/confirm`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { [TOKEN_HEADER]: token } });
  } catch (error) {
    throw new PrintJobsApiError(`No se pudo contactar ${url}: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new PrintJobsApiError(`POST /api/print-jobs/:id/confirm respondió ${response.status}`);
  }
}
