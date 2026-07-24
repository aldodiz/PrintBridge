// Armado del ticket en comandos ESC/POS — puerto 1:1 de
// lib/printer/receipt.ts del repo de la POS (mismo negocio, mismo formato:
// logo, folio/fecha al final en Font B, items con modificadores
// desglosados, pago único o mixto con referencia, mensaje de cierre). Se
// portó a TypeScript plano (number[] en vez de Buffer, sin zlib/fs) porque
// React Native no tiene Node Buffer ni el runtime de Node por defecto. Si el
// formato del ticket cambia en la POS, hay que replicar el cambio aquí.
import { LOGO_RASTER_COMMAND } from "./logoRasterCommand";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const LINE_WIDTH = 32; // ancho típico de una impresora térmica de 58mm

export const BUSINESS_NAME = "Pancherías Cuaqu";
export const BUSINESS_ADDRESS_LINES = [
  "Fernando de Magallanes 11",
  "Costa Azul, Acapulco de Juárez, Gro.",
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export type ReceiptItemModifier = {
  name: string;
  /** Cantidad final pedida (0 = quitado). */
  quantity: number;
  priceDelta: number;
};

export type ReceiptItem = {
  productName: string;
  quantity: number;
  subtotal: number;
  modifiers: ReceiptItemModifier[];
};

/** Un pago de la orden (1 = pago único, 2 = pago mixto, ver Paso 23 de la POS). */
export type ReceiptPayment = {
  method: string;
  amount: number;
  /** Solo presentes cuando method es "efectivo" y es pago único (no mixto). */
  cashReceived: number | null;
  changeGiven: number | null;
  /** Últimos 4 + autorización (tarjeta) o clave de rastreo (transferencia); null en efectivo. */
  reference: string | null;
};

export type ReceiptData = {
  businessName: string;
  addressLines: string[];
  folio: string;
  /** ISO string (viene de JSON del API de la POS). */
  createdAt: string;
  payments: ReceiptPayment[];
  items: ReceiptItem[];
  total: number;
};

function formatMoney(amount: number): string {
  return `$${amount.toFixed(0)}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function twoColumns(left: string, right: string, width = LINE_WIDTH): string {
  const maxLeft = Math.max(width - right.length - 1, 1);
  const truncatedLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const padding = Math.max(width - truncatedLeft.length - right.length, 1);
  return `${truncatedLeft}${" ".repeat(padding)}${right}`;
}

const SEPARATOR = "-".repeat(LINE_WIDTH);

// La referencia de pago (Paso 21/23 de la POS) usa "•" (BULLET, U+2022) para
// tarjetas — fuera de Latin-1 (> 0xFF). Ni la impresora térmica (solo
// entiende su code page de 1 byte) ni un truncado ciego a 1 byte lo
// manejan bien (charCodeAt & 0xff lo corrompe en un carácter random). Se
// reemplaza por un asterisco antes de codificar: mismo problema existiría
// si se corrigiera solo aquí sin tocar la POS, así que se sanea en el punto
// de impresión (este archivo), no en el texto de origen.
const UNSAFE_CHAR_REPLACEMENTS: Record<string, string> = {
  "•": "*",
};

/** Codifica un string a bytes latin1 (mismo encoding que Buffer.from(s,
 * "latin1") en la POS): los caracteres del ticket (español con
 * acentos/¡/¿) caen dentro de Latin-1 (<= 0xFF). Cualquier caracter fuera de
 * ese rango que no esté en UNSAFE_CHAR_REPLACEMENTS se recorta a 1 byte
 * igual que en la POS (mismo comportamiento que Buffer.from(s, "latin1")),
 * mejor eso que reventar la impresión. */
function textBytes(s: string): number[] {
  const sanitized = s.replace(
    /[\u{0100}-\u{10FFFF}]/gu,
    (char) => UNSAFE_CHAR_REPLACEMENTS[char] ?? "?"
  );
  const bytes: number[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    bytes.push(sanitized.charCodeAt(i) & 0xff);
  }
  return bytes;
}

/** Arma el ticket completo como comandos ESC/POS listos para mandar por USB. */
export function buildReceiptBytes(data: ReceiptData): number[] {
  const bytes: number[] = [];
  const raw = (...b: number[]) => bytes.push(...b);
  const text = (s: string) => bytes.push(...textBytes(s));
  const line = (s = "") => {
    text(s);
    raw(LF);
  };

  raw(ESC, 0x40); // inicializar impresora

  raw(ESC, 0x61, 0x01); // centrar
  raw(...LOGO_RASTER_COMMAND); // logo del negocio (assets/logo-bw.png de la POS)
  line();

  raw(ESC, 0x45, 0x01); // negritas on
  line(data.businessName);
  raw(ESC, 0x45, 0x00); // negritas off
  for (const addressLine of data.addressLines) line(addressLine);
  line();

  raw(ESC, 0x61, 0x00); // alinear izquierda
  line(SEPARATOR);

  for (const item of data.items) {
    line(twoColumns(`${item.quantity}x ${item.productName}`, formatMoney(item.subtotal)));
    for (const modifier of item.modifiers) {
      const priceSuffix =
        modifier.priceDelta > 0 ? ` (${formatMoney(modifier.priceDelta)})` : "";
      const label =
        modifier.quantity === 0 ? `Sin ${modifier.name}` : `${modifier.name} x${modifier.quantity}`;
      line(`   ${label}${priceSuffix}`);
    }
  }

  line(SEPARATOR);
  raw(ESC, 0x45, 0x01);
  line(twoColumns("TOTAL", formatMoney(data.total)));
  raw(ESC, 0x45, 0x00);

  if (data.payments.length > 1) {
    // Pago mixto: cada método con su monto asignado y, si aplica, su
    // referencia — nunca "recibido"/cambio (el monto en efectivo es exacto).
    line("Pago mixto:");
    for (const payment of data.payments) {
      const label = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
      line(twoColumns(`  ${label}`, formatMoney(payment.amount)));
      if (payment.reference) line(`    Ref: ${payment.reference}`);
    }
  } else {
    const payment = data.payments[0];
    if (payment.cashReceived !== null && payment.changeGiven !== null) {
      line(twoColumns("Recibido", formatMoney(payment.cashReceived)));
      line(twoColumns("Cambio", formatMoney(payment.changeGiven)));
    }
    line(`Pago: ${PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}`);
    if (payment.reference) line(`Ref: ${payment.reference}`);
  }
  line(SEPARATOR);

  // Folio y fecha van al final, en fuente más chica (Font B).
  raw(ESC, 0x4d, 0x01); // seleccionar Font B (más chica)
  line(`Folio: ${data.folio}`);
  line(`Fecha: ${formatDate(data.createdAt)}`);
  raw(ESC, 0x4d, 0x00); // restaurar Font A

  raw(ESC, 0x61, 0x01); // centrar
  line("Gracias por tu compra, ¡vuelve pronto!");

  raw(LF, LF, LF);
  raw(GS, 0x56, 0x42, 0x00); // cortar papel (feed + corte parcial)

  return bytes;
}
