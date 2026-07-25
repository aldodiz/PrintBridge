package com.printbridge.app

// Módulo nativo mínimo para mandar bytes ESC/POS crudos a una impresora
// térmica genérica conectada por USB/OTG (Android USB Host API).
//
// Por qué un módulo propio y no una librería de npm: ninguna librería RN de
// impresoras térmicas encontrada en la investigación previa (Paso 24) expone
// un método para mandar un byte[] arbitrario por USB — todas envuelven el
// ESC/POS en helpers de texto/imagen/QR predefinidos (printText, printBill,
// printPic, etc.), lo cual no sirve para reutilizar bytes ya armados con la
// misma lógica de ticket que la POS (lib/printer/receipt.ts). Este módulo
// solo hace la parte de transporte (USB Host: enumerar, pedir permiso,
// mandar bytes por bulk transfer); el armado del ticket vive en JS
// (src/escpos/receipt.ts), igual que en la POS.
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

private const val ACTION_USB_PERMISSION = "com.printbridge.app.USB_PERMISSION"
private const val EVENT_USB_STATE_CHANGED = "UsbDeviceStateChanged"
private const val BULK_TRANSFER_TIMEOUT_MS = 5000
private const val BULK_CHUNK_SIZE = 4096

class UsbPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val usbManager: UsbManager =
      reactContext.getSystemService(Context.USB_SERVICE) as UsbManager

  private var pendingPermissionPromise: Promise? = null
  private var pendingPermissionDevice: UsbDevice? = null

  private val permissionReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (ACTION_USB_PERMISSION != intent.action) return
          synchronized(this) {
            val device: UsbDevice? =
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                  intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                } else {
                  @Suppress("DEPRECATION") intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                }
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (device?.deviceName == pendingPermissionDevice?.deviceName) {
              pendingPermissionPromise?.resolve(granted)
              pendingPermissionPromise = null
              pendingPermissionDevice = null
            }
          }
        }
      }

  // Detecta conexión/desconexión del USB en tiempo real (no solo al abrir la
  // app o al hacer polling manual): emite un evento a JS cada vez que el
  // sistema reporta un dispositivo USB conectado o retirado, para que la
  // pantalla de estado se actualice sola sin esperar al próximo refresh.
  private val attachDetachReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          if (intent.action != UsbManager.ACTION_USB_DEVICE_ATTACHED &&
              intent.action != UsbManager.ACTION_USB_DEVICE_DETACHED) {
            return
          }
          reactApplicationContext
              .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit(EVENT_USB_STATE_CHANGED, null)
        }
      }

  init {
    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(
          permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(permissionReceiver, filter)
    }

    val attachDetachFilter =
        IntentFilter().apply {
          addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
          addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(
          attachDetachReceiver, attachDetachFilter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(attachDetachReceiver, attachDetachFilter)
    }
  }

  override fun getName(): String = "UsbPrinterModule"

  // Requerido por NativeEventEmitter de JS (RN se queja si un módulo emite
  // eventos pero no expone addListener/removeListeners); no hace falta lógica
  // propia porque el emit ya se dispara solo desde el BroadcastReceiver.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  override fun invalidate() {
    super.invalidate()
    try {
      reactApplicationContext.unregisterReceiver(permissionReceiver)
    } catch (e: IllegalArgumentException) {
      // ya estaba desregistrado, no pasa nada.
    }
    try {
      reactApplicationContext.unregisterReceiver(attachDetachReceiver)
    } catch (e: IllegalArgumentException) {
      // ya estaba desregistrado, no pasa nada.
    }
  }

  /** Todos los dispositivos USB conectados ahora mismo (haya o no permiso). */
  @ReactMethod
  fun getDeviceList(promise: Promise) {
    val result: WritableArray = Arguments.createArray()
    for (device in usbManager.deviceList.values) {
      val map: WritableMap = Arguments.createMap()
      map.putString("deviceName", device.deviceName)
      map.putInt("vendorId", device.vendorId)
      map.putInt("productId", device.productId)
      map.putBoolean("hasPermission", usbManager.hasPermission(device))
      map.putBoolean("looksLikePrinter", looksLikePrinter(device))
      result.pushMap(map)
    }
    promise.resolve(result)
  }

  /**
   * Detecta "la" impresora a usar: el primer dispositivo con una interfaz de
   * clase USB_CLASS_PRINTER (7, el estándar para impresoras USB), o si no hay
   * ninguna así, el único dispositivo conectado (caso típico: un tablet
   * dedicado con solo la impresora en el puerto OTG).
   */
  private fun findPrinterDevice(): UsbDevice? {
    val devices = usbManager.deviceList.values.toList()
    val byClass = devices.firstOrNull { looksLikePrinter(it) }
    if (byClass != null) return byClass
    return if (devices.size == 1) devices[0] else null
  }

  private fun looksLikePrinter(device: UsbDevice): Boolean {
    for (i in 0 until device.interfaceCount) {
      if (device.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_PRINTER) return true
    }
    return false
  }

  /** true si hay una impresora detectada Y ya tenemos permiso USB para usarla. */
  @ReactMethod
  fun isPrinterReady(promise: Promise) {
    val device = findPrinterDevice()
    promise.resolve(device != null && usbManager.hasPermission(device))
  }

  /**
   * Pide permiso USB para "la" impresora detectada (dispara el diálogo del
   * sistema la primera vez; en llamadas siguientes resuelve de inmediato si
   * ya se concedió). Resuelve `false` si no hay ningún dispositivo USB
   * conectado.
   */
  @ReactMethod
  fun requestPermission(promise: Promise) {
    val device = findPrinterDevice()
    if (device == null) {
      promise.resolve(false)
      return
    }
    if (usbManager.hasPermission(device)) {
      promise.resolve(true)
      return
    }

    synchronized(this) {
      pendingPermissionPromise = promise
      pendingPermissionDevice = device
    }
    val flags =
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S)
            PendingIntent.FLAG_MUTABLE
        else 0
    val permissionIntent =
        PendingIntent.getBroadcast(
            reactApplicationContext, 0, Intent(ACTION_USB_PERMISSION), flags)
    usbManager.requestPermission(device, permissionIntent)
  }

  /**
   * Manda bytes ESC/POS crudos (ya armados en JS, ver src/escpos/receipt.ts)
   * a la impresora detectada. Requiere permiso ya concedido (ver
   * requestPermission). Rechaza la promesa si no hay impresora, no hay
   * permiso, o falla la transferencia — nunca hay que interpretar un
   * rechazo aquí como "impreso".
   */
  @ReactMethod
  fun printBytes(bytes: ReadableArray, promise: Promise) {
    val device = findPrinterDevice()
    if (device == null) {
      promise.reject("NO_PRINTER", "No se detectó ninguna impresora USB conectada")
      return
    }
    if (!usbManager.hasPermission(device)) {
      promise.reject("NO_PERMISSION", "No hay permiso USB para la impresora; llama a requestPermission primero")
      return
    }

    var usbInterface: UsbInterface? = null
    var endpointOut: UsbEndpoint? = null
    for (i in 0 until device.interfaceCount) {
      val iface = device.getInterface(i)
      for (e in 0 until iface.endpointCount) {
        val endpoint = iface.getEndpoint(e)
        if (endpoint.direction == UsbConstants.USB_DIR_OUT &&
            endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
          usbInterface = iface
          endpointOut = endpoint
          break
        }
      }
      if (endpointOut != null) break
    }

    if (usbInterface == null || endpointOut == null) {
      promise.reject("NO_BULK_ENDPOINT", "La impresora no tiene un endpoint bulk OUT (¿cable o modo incorrecto?)")
      return
    }

    val connection: UsbDeviceConnection? = usbManager.openDevice(device)
    if (connection == null) {
      promise.reject("OPEN_FAILED", "No se pudo abrir la conexión USB con la impresora")
      return
    }

    try {
      if (!connection.claimInterface(usbInterface, true)) {
        promise.reject("CLAIM_FAILED", "No se pudo tomar la interfaz USB de la impresora")
        return
      }

      val data = ByteArray(bytes.size())
      for (i in 0 until bytes.size()) {
        data[i] = bytes.getInt(i).toByte()
      }

      var offset = 0
      while (offset < data.size) {
        val chunkSize = minOf(BULK_CHUNK_SIZE, data.size - offset)
        val chunk = data.copyOfRange(offset, offset + chunkSize)
        val sent =
            connection.bulkTransfer(endpointOut, chunk, chunk.size, BULK_TRANSFER_TIMEOUT_MS)
        if (sent < 0) {
          promise.reject("WRITE_FAILED", "Falló la escritura USB en el byte $offset de ${data.size}")
          return
        }
        offset += chunkSize
      }

      promise.resolve(true)
    } finally {
      try {
        connection.releaseInterface(usbInterface)
      } catch (e: Exception) {
        // no bloquea el resultado ya resuelto/rechazado arriba.
      }
      connection.close()
    }
  }
}
