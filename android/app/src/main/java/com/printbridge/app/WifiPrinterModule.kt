package com.printbridge.app

// Módulo nativo mínimo para mandar bytes ESC/POS crudos a una impresora
// térmica genérica accesible por red local (TCP/IP directo al puerto de
// impresión crudo, típicamente 9100 — el mismo protocolo "raw socket" que
// usan casi todas las impresoras térmicas ESC/POS con interfaz de red).
//
// Mismo principio que UsbPrinterModule: este módulo solo hace transporte
// (abrir el socket, mandar el byte[], cerrarlo); el armado del ticket sigue
// viviendo en JS (src/escpos/receipt.ts) y no cambia según el método.
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

private const val CONNECT_TIMEOUT_MS = 5000
private const val CHECK_TIMEOUT_MS = 3000

class WifiPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WifiPrinterModule"

  /**
   * Chequeo corto de disponibilidad: abre y cierra un socket TCP al puerto
   * configurado, sin mandar ningún byte. Nunca rechaza la promesa — resuelve
   * true/false, para que la pantalla de estado lo pueda llamar cada pocos
   * segundos sin tratarlo como un error de impresión.
   */
  @ReactMethod
  fun checkConnection(ip: String, port: Double, promise: Promise) {
    var socket: Socket? = null
    try {
      socket = Socket()
      socket.connect(InetSocketAddress(ip, port.toInt()), CHECK_TIMEOUT_MS)
      promise.resolve(true)
    } catch (e: IOException) {
      promise.resolve(false)
    } catch (e: IllegalArgumentException) {
      // IP/puerto con formato inválido.
      promise.resolve(false)
    } finally {
      try {
        socket?.close()
      } catch (e: IOException) {
        // no importa, ya se resolvió la promesa arriba.
      }
    }
  }

  /**
   * Manda bytes ESC/POS crudos (ya armados en JS) a la impresora por TCP.
   * Rechaza la promesa si falla la conexión o la escritura — nunca hay que
   * interpretar un rechazo aquí como "impreso".
   */
  @ReactMethod
  fun printBytes(ip: String, port: Double, bytes: ReadableArray, promise: Promise) {
    var socket: Socket? = null
    try {
      socket = Socket()
      try {
        socket.connect(InetSocketAddress(ip, port.toInt()), CONNECT_TIMEOUT_MS)
      } catch (e: SocketTimeoutException) {
        promise.reject("TIMEOUT", "Tiempo de espera agotado conectando a $ip:${port.toInt()}")
        return
      } catch (e: IOException) {
        promise.reject(
            "CONNECTION_REFUSED", "No se pudo conectar a $ip:${port.toInt()}: ${e.message}")
        return
      }

      val data = ByteArray(bytes.size())
      for (i in 0 until bytes.size()) {
        data[i] = bytes.getInt(i).toByte()
      }

      try {
        socket.getOutputStream().write(data)
        socket.getOutputStream().flush()
      } catch (e: IOException) {
        promise.reject("WRITE_FAILED", "Falló el envío por WiFi: ${e.message}")
        return
      }

      promise.resolve(true)
    } finally {
      try {
        socket?.close()
      } catch (e: IOException) {
        // no bloquea el resultado ya resuelto/rechazado arriba.
      }
    }
  }
}
