import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePrintBridge } from "../usePrintBridge";

function StatusDot({ ok }: { ok: boolean }) {
  return <View style={[styles.dot, { backgroundColor: ok ? "#22c55e" : "#ef4444" }]} />;
}

export function HomeScreen() {
  const {
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
  } = usePrintBridge();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Print Bridge</Text>
        <Text style={styles.subtitle}>Puente de impresión USB — Pancherías Cuaqu</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Servidor de la POS</Text>
          <TextInput
            style={styles.input}
            placeholder="https://tu-dominio.vercel.app"
            autoCapitalize="none"
            autoCorrect={false}
            value={baseUrl}
            onChangeText={setBaseUrl}
            editable={baseUrlLoaded}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <StatusDot ok={usbReady} />
            <Text style={styles.cardTitle}>
              Impresora USB: {usbReady ? "detectada y lista" : "no detectada"}
            </Text>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={refreshUsbStatus}>
            <Text style={styles.secondaryButtonText}>Volver a revisar</Text>
          </TouchableOpacity>
          {usbDevices.length > 0 && (
            <View style={styles.deviceList}>
              {usbDevices.map((device) => (
                <Text key={device.deviceName} style={styles.deviceText}>
                  {device.looksLikePrinter ? "🖨️ " : "· "}
                  {device.deviceName} (vendorId {device.vendorId}, productId {device.productId})
                  {device.hasPermission ? " · con permiso" : " · sin permiso"}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <StatusDot ok={polling} />
            <Text style={styles.cardTitle}>
              Polling: {polling ? "activo" : "inactivo"}
            </Text>
            <Switch
              value={polling}
              onValueChange={setPolling}
              disabled={!baseUrl}
              style={styles.switch}
            />
          </View>
          {!baseUrl && (
            <Text style={styles.hint}>Configura el servidor de la POS arriba para activar el polling.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Último resultado</Text>
          {lastResult.status === "idle" && <Text style={styles.hint}>Sin trabajos todavía.</Text>}
          {lastResult.status === "printing" && (
            <Text style={styles.pending}>Imprimiendo ticket {lastResult.folio}…</Text>
          )}
          {lastResult.status === "success" && (
            <Text style={styles.success}>Ticket {lastResult.folio} impreso y confirmado ✓</Text>
          )}
          {lastResult.status === "error" && (
            <Text style={styles.error}>
              {lastResult.folio ? `Ticket ${lastResult.folio}: ` : ""}
              {lastResult.message}
            </Text>
          )}
        </View>

        {failedJob && (
          <TouchableOpacity style={styles.retryButton} onPress={retryFailedJob}>
            <Text style={styles.retryButtonText}>
              Reintentar ticket {failedJob.ticket.folio}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  scroll: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#f8fafc" },
  subtitle: { fontSize: 14, color: "#94a3b8", marginBottom: 8 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#f8fafc" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  switch: { marginLeft: "auto" },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryButtonText: { color: "#f8fafc", fontWeight: "500" },
  deviceList: { gap: 4 },
  deviceText: { color: "#94a3b8", fontSize: 13 },
  hint: { color: "#94a3b8", fontSize: 13 },
  pending: { color: "#facc15", fontSize: 14 },
  success: { color: "#22c55e", fontSize: 14, fontWeight: "600" },
  error: { color: "#ef4444", fontSize: 14, fontWeight: "600" },
  retryButton: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
