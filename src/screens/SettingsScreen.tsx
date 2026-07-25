import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { DEFAULT_WIFI_PORT, type PrinterConfig, type PrinterMethod } from "../printerConfig";

type Props = {
  printerConfig: PrinterConfig;
  onChange: (config: PrinterConfig) => void;
  onClose: () => void;
};

export function SettingsScreen({ printerConfig, onChange, onClose }: Props) {
  const setMethod = (method: PrinterMethod) => onChange({ ...printerConfig, method });
  const setWifiIp = (wifiIp: string) => onChange({ ...printerConfig, wifiIp });
  const setWifiPort = (text: string) => {
    const port = parseInt(text, 10);
    onChange({ ...printerConfig, wifiPort: Number.isFinite(port) ? port : DEFAULT_WIFI_PORT });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Configuración de impresión</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Método de impresión</Text>
        <View style={styles.methodRow}>
          <TouchableOpacity
            style={[styles.methodButton, printerConfig.method === "usb" && styles.methodButtonActive]}
            onPress={() => setMethod("usb")}
          >
            <Text style={styles.methodButtonText}>USB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodButton, printerConfig.method === "wifi" && styles.methodButtonActive]}
            onPress={() => setMethod("wifi")}
          >
            <Text style={styles.methodButtonText}>WiFi</Text>
          </TouchableOpacity>
        </View>
        {printerConfig.method === "usb" && (
          <Text style={styles.hint}>
            Detección automática por USB/OTG — sin configuración adicional.
          </Text>
        )}
      </View>

      {printerConfig.method === "wifi" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Impresora WiFi</Text>
          <Text style={styles.label}>IP de la impresora</Text>
          <TextInput
            style={styles.input}
            placeholder="192.168.1.50"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numeric"
            value={printerConfig.wifiIp}
            onChangeText={setWifiIp}
          />
          <Text style={styles.label}>Puerto</Text>
          <TextInput
            style={styles.input}
            placeholder={String(DEFAULT_WIFI_PORT)}
            keyboardType="numeric"
            value={String(printerConfig.wifiPort)}
            onChangeText={setWifiPort}
          />
          <Text style={styles.hint}>
            Puerto crudo ESC/POS estándar: {DEFAULT_WIFI_PORT}. Cambiar solo si la impresora usa
            otro.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Listo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#f8fafc", marginBottom: 8 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#f8fafc" },
  methodRow: { flexDirection: "row", gap: 10 },
  methodButton: {
    flex: 1,
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  methodButtonActive: { backgroundColor: "#2563eb" },
  methodButtonText: { color: "#f8fafc", fontWeight: "600" },
  label: { color: "#94a3b8", fontSize: 13 },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { color: "#94a3b8", fontSize: 13 },
  closeButton: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  closeButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
