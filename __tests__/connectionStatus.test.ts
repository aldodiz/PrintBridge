// Prueba la lógica de detección de estado (conectado/no conectado) para
// ambos métodos de impresión, con dependencias SIMULADAS — mismo patrón que
// processPrintJob.test.ts.
import { checkConnectionStatus, type ConnectionStatusDeps } from "../src/connectionStatus";
import type { PrinterConfig } from "../src/printerConfig";

function makeDeps(overrides: Partial<ConnectionStatusDeps> = {}): ConnectionStatusDeps {
  return {
    usbIsReady: jest.fn().mockResolvedValue(false),
    wifiCheckConnection: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("checkConnectionStatus — USB", () => {
  const usbConfig: PrinterConfig = { method: "usb", wifiIp: "", wifiPort: 9100 };

  it("reporta conectado cuando la impresora USB está lista", async () => {
    const deps = makeDeps({ usbIsReady: jest.fn().mockResolvedValue(true) });
    await expect(checkConnectionStatus(usbConfig, deps)).resolves.toBe(true);
    expect(deps.wifiCheckConnection).not.toHaveBeenCalled();
  });

  it("reporta no conectado cuando la impresora USB no está lista", async () => {
    const deps = makeDeps({ usbIsReady: jest.fn().mockResolvedValue(false) });
    await expect(checkConnectionStatus(usbConfig, deps)).resolves.toBe(false);
  });
});

describe("checkConnectionStatus — WiFi", () => {
  const wifiConfig: PrinterConfig = { method: "wifi", wifiIp: "192.168.1.50", wifiPort: 9100 };

  it("reporta conectado cuando el chequeo TCP responde ok", async () => {
    const deps = makeDeps({ wifiCheckConnection: jest.fn().mockResolvedValue(true) });
    await expect(checkConnectionStatus(wifiConfig, deps)).resolves.toBe(true);
    expect(deps.wifiCheckConnection).toHaveBeenCalledWith("192.168.1.50", 9100);
    expect(deps.usbIsReady).not.toHaveBeenCalled();
  });

  it("reporta no conectado si el chequeo TCP falla (timeout/rechazado)", async () => {
    const deps = makeDeps({ wifiCheckConnection: jest.fn().mockResolvedValue(false) });
    await expect(checkConnectionStatus(wifiConfig, deps)).resolves.toBe(false);
  });

  it("reporta no conectado sin lanzar si el chequeo TCP rechaza la promesa", async () => {
    const deps = makeDeps({
      wifiCheckConnection: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    await expect(checkConnectionStatus(wifiConfig, deps)).resolves.toBe(false);
  });

  it("reporta no conectado si no hay IP configurada, sin llamar al chequeo TCP", async () => {
    const deps = makeDeps();
    const noIpConfig: PrinterConfig = { method: "wifi", wifiIp: "", wifiPort: 9100 };
    await expect(checkConnectionStatus(noIpConfig, deps)).resolves.toBe(false);
    expect(deps.wifiCheckConnection).not.toHaveBeenCalled();
  });
});
