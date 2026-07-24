// Prueba el camino de ÉXITO completo (imprimir + confirmar) y los de fallo,
// con un UsbPrinter y un confirmJob SIMULADOS — no hay forma de tener una
// impresora térmica física en un entorno de pruebas automatizado/de nube,
// así que esta es la verificación real y repetible de la orquestación
// "imprime bytes reales -> confirma vía POST" (puntos 4 y 5 del Paso 24).
// Es la misma técnica que probar un flujo de cobro con una pasarela de pago
// simulada en vez de una tarjeta real: se verifica la lógica de la app, no
// el hardware/servicio de terceros en sí.
import { processPrintJob, type ProcessJobDeps } from "../src/processPrintJob";
import type { PendingPrintJob } from "../src/api/printJobs";

const sampleJob: PendingPrintJob = {
  id: "job-42",
  ticket: {
    businessName: "Pancherías Cuaqu",
    addressLines: ["Fernando de Magallanes 11"],
    folio: "F1TEST01",
    createdAt: "2026-07-24T21:00:00.000Z",
    payments: [{ method: "efectivo", amount: 155, cashReceived: 200, changeGiven: 45, reference: null }],
    items: [
      { productName: "ChoriDog", quantity: 1, subtotal: 120, modifiers: [] },
      { productName: "Refresco", quantity: 1, subtotal: 35, modifiers: [] },
    ],
    total: 155,
  },
};

function makeDeps(overrides: Partial<ProcessJobDeps> = {}): {
  deps: ProcessJobDeps;
  calls: { printBytes: number[][]; confirmJob: string[] };
} {
  const calls = { printBytes: [] as number[][], confirmJob: [] as string[] };
  const deps: ProcessJobDeps = {
    ensurePrinterReady: jest.fn().mockResolvedValue(true),
    printBytes: jest.fn(async (bytes: number[]) => {
      calls.printBytes.push(bytes);
      return true;
    }),
    confirmJob: jest.fn(async (jobId: string) => {
      calls.confirmJob.push(jobId);
    }),
    ...overrides,
  };
  return { deps, calls };
}

describe("processPrintJob — camino de éxito (imprimir + confirmar)", () => {
  it("arma el ticket con texto real, lo manda a imprimir y confirma el trabajo por su id", async () => {
    const { deps, calls } = makeDeps();

    const result = await processPrintJob(sampleJob, deps);

    expect(result).toEqual({ ok: true });

    // Se mandaron bytes de verdad a "la impresora" (mockeada), con el
    // contenido real del ticket (folio, negocio), no un stub vacío.
    expect(calls.printBytes).toHaveLength(1);
    const printedBytes = calls.printBytes[0];
    expect(printedBytes.length).toBeGreaterThan(100);
    const printedText = printedBytes.map((b) => String.fromCharCode(b)).join("");
    expect(printedText).toContain("Pancherías Cuaqu");
    expect(printedText).toContain("Folio: F1TEST01");
    expect(printedText).toContain("ChoriDog");

    // Se confirmó exactamente ESE trabajo (por id), exactamente una vez.
    expect(calls.confirmJob).toEqual(["job-42"]);
  });

  it("no confirma si la impresora no está lista (no detectada / sin permiso)", async () => {
    const { deps, calls } = makeDeps({ ensurePrinterReady: jest.fn().mockResolvedValue(false) });

    const result = await processPrintJob(sampleJob, deps);

    expect(result).toEqual({ ok: false, message: "Impresora no detectada o sin permiso USB" });
    expect(calls.printBytes).toHaveLength(0);
    expect(calls.confirmJob).toHaveLength(0);
  });

  it("no confirma si falla la escritura USB (impresora sin papel, desconectada a medio camino, etc.)", async () => {
    const { deps, calls } = makeDeps({
      printBytes: jest.fn().mockRejectedValue(new Error("WRITE_FAILED")),
    });

    const result = await processPrintJob(sampleJob, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Falló la impresión");
    expect(calls.confirmJob).toHaveLength(0); // nunca se confirma sin haber impreso
  });

  it("si imprime pero falla la confirmación por red, lo reporta como error (queda pendiente para reintentar)", async () => {
    const { deps, calls } = makeDeps({
      confirmJob: jest.fn().mockRejectedValue(new Error("network down")),
    });

    const result = await processPrintJob(sampleJob, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("no se pudo confirmar");
    expect(calls.printBytes).toHaveLength(1); // sí llegó a imprimir
  });
});
