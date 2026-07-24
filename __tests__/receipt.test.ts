// Espejo de lib/printer/receipt.test.ts de la POS: mismo criterio (texto
// real del negocio, folio, modificadores, pago mixto), para confirmar que
// el puerto a TypeScript plano no perdió nada del formato original.
import { buildReceiptBytes, type ReceiptData } from "../src/escpos/receipt";

const sampleReceipt: ReceiptData = {
  businessName: "Pancherías Cuaqu",
  addressLines: ["Fernando de Magallanes 11"],
  folio: "F1A2B3C4",
  createdAt: "2026-07-22T14:05:00.000Z",
  payments: [{ method: "efectivo", amount: 285, cashReceived: 300, changeGiven: 15, reference: null }],
  items: [
    {
      productName: "ChoriDog",
      quantity: 2,
      subtotal: 250,
      modifiers: [
        { name: "Queso gratinado", quantity: 0, priceDelta: 0 },
        { name: "Chorizo extra", quantity: 1, priceDelta: 20 },
      ],
    },
    { productName: "Refresco", quantity: 1, subtotal: 35, modifiers: [] },
  ],
  total: 285,
};

function bytesToLatin1(bytes: number[]): string {
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

describe("buildReceiptBytes (puerto de Print Bridge)", () => {
  it("empieza con ESC @ y termina con el corte de papel", () => {
    const bytes = buildReceiptBytes(sampleReceipt);
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(bytes.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("incluye el nombre real del negocio, folio, total y modificadores", () => {
    const text = bytesToLatin1(buildReceiptBytes(sampleReceipt));
    expect(text).toContain("Pancherías Cuaqu");
    expect(text).toContain("Folio: F1A2B3C4");
    expect(text).toContain("$285");
    expect(text).toContain("Sin Queso gratinado");
    expect(text).toContain("Chorizo extra x1 ($20)");
    expect(text).toContain("Gracias por tu compra, ¡vuelve pronto!");
  });

  it("incluye recibido y cambio en pago único de efectivo", () => {
    const text = bytesToLatin1(buildReceiptBytes(sampleReceipt));
    expect(text).toContain("Recibido");
    expect(text).toContain("$300");
    expect(text).toContain("Cambio");
    expect(text).toContain("$15");
  });

  it("pago mixto: muestra cada método con su monto y referencia, sin recibido/cambio", () => {
    const text = bytesToLatin1(
      buildReceiptBytes({
        ...sampleReceipt,
        payments: [
          { method: "efectivo", amount: 100, cashReceived: null, changeGiven: null, reference: null },
          {
            method: "tarjeta",
            amount: 185,
            cashReceived: null,
            changeGiven: null,
            reference: "Tarjeta •••1234 · Autorización 00552211",
          },
        ],
      })
    );
    expect(text).toContain("Pago mixto:");
    // El "•" (fuera de Latin-1, no imprimible en la térmica) se sanea a "*".
    expect(text).toContain("Ref: Tarjeta ***1234 · Autorización 00552211");
    expect(text).not.toContain("Recibido");
  });

  it("sanea caracteres fuera de Latin-1 en vez de corromperlos a un byte al azar", () => {
    const text = bytesToLatin1(
      buildReceiptBytes({
        ...sampleReceipt,
        payments: [
          {
            method: "tarjeta",
            amount: 285,
            cashReceived: null,
            changeGiven: null,
            reference: "Tarjeta •••9999 · Autorización 00000000",
          },
        ],
      })
    );
    expect(text).toContain("Ref: Tarjeta ***9999");
    expect(text).not.toContain("•"); // el bullet nunca debe llegar crudo
  });

  it("incluye el comando ESC/POS del logo (GS v 0) cerca del inicio", () => {
    const bytes = buildReceiptBytes(sampleReceipt);
    // GS v 0 = 0x1d 0x76 0x30
    const idx = bytes.findIndex(
      (b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30
    );
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(20); // justo después de ESC @ + centrar
  });
});
