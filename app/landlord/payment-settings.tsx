import { useCallback, useState } from "react";
import {
  ActivityIndicator, Image, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND_BLUE = "#1A3C5E";
const BRAND_DEEP = "#122B44";
const TEAL = "#0D9488";
const ACCENT_LIGHT = "#4A90D9";
const WHITE = "#FFFFFF";
const WHITE_72 = "rgba(255,255,255,0.72)";
const WHITE_40 = "rgba(255,255,255,0.40)";
const WHITE_15 = "rgba(255,255,255,0.15)";
const WHITE_08 = "rgba(255,255,255,0.08)";

type PaymentDetails = { upiId: string; hasQrCode: boolean };

export default function LandlordPaymentSettings() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const [upiId, setUpiId] = useState("");
  const [hasQrCode, setHasQrCode] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [authToken, setAuthToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated.");
        return;
      }
      setAuthToken(token);
      const response = await fetch(`${API_URL}/api/landlord/payment-details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Could not load UPI payment details.");
        return;
      }
      const details = json?.data as PaymentDetails;
      setUpiId(details.upiId ?? "");
      setHasQrCode(Boolean(details.hasQrCode));
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void fetchDetails(); });

  const saveUpiId = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated.");
        return;
      }
      const response = await fetch(`${API_URL}/api/landlord/payment-details/upi-id`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ upiId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Could not save your UPI ID.");
        return;
      }
      setUpiId(json?.data?.upiId ?? upiId.trim());
      setMessage("UPI ID saved.");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSaving(false);
    }
  };

  const uploadQr = async () => {
    setError("");
    setMessage("");
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
      setError("UPI QR images must be 5 MB or smaller.");
      return;
    }
    if (!asset.mimeType || !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) {
      setError("Choose a JPEG, PNG or WebP QR image.");
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated.");
        return;
      }
      const sourceResponse = await fetch(asset.uri);
      if (!sourceResponse.ok) throw new Error("Could not read the selected QR image.");
      const sourceBlob = await sourceResponse.blob();
      const imageBlob = sourceBlob.type === asset.mimeType
        ? sourceBlob
        : new Blob([sourceBlob], { type: asset.mimeType });
      const formData = new FormData();
      formData.append("upiQr", imageBlob, asset.name || "upi-qr");
      const response = await fetch(`${API_URL}/api/landlord/payment-details/qr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Could not upload your UPI QR image.");
        return;
      }
      setHasQrCode(true);
      setAuthToken(token);
      setQrVersion(Date.now());
      setMessage("UPI QR code uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the QR image.");
    } finally {
      setSaving(false);
    }
  };

  const removeQr = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const token = await getToken();
      if (!token) {
        setError("Not authenticated.");
        return;
      }
      const response = await fetch(`${API_URL}/api/landlord/payment-details/qr`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Could not remove your UPI QR image.");
        return;
      }
      setHasQrCode(false);
      setMessage("UPI QR code removed.");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSaving(false);
    }
  };

  const paddingTop = Platform.OS === "android"
    ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32)
    : Math.max(insets.top + 8, 32);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backArrow}>{"\u2039"}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>UPI Payment Details</Text>
          <Text style={styles.subtitle}>Details shown to your renters</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 28, 40) }]}>
        {loading ? <ActivityIndicator color={TEAL} /> : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your UPI ID</Text>
              <Text style={styles.help}>
                Renters can pay directly to this ID. Check it carefully; payments sent using UPI go to this account.
              </Text>
              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="name@bank"
                placeholderTextColor={WHITE_40}
                style={styles.input}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={() => { void saveUpiId(); }} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save UPI ID"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment QR Code</Text>
              <Text style={styles.help}>
                Upload a clear UPI QR image for renters who want to scan and pay from another device.
              </Text>
              {hasQrCode ? (
                <Image
                  source={{
                    uri: `${API_URL}/api/landlord/payment-details/qr?v=${qrVersion}`,
                    headers: { Authorization: `Bearer ${authToken}` },
                  }}
                  resizeMode="contain"
                  style={styles.qrImage}
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Text style={{ fontSize: 32 }}>{"\uD83D\uDCF7"}</Text>
                  <Text style={styles.qrPlaceholderText}>No QR code uploaded</Text>
                </View>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => { void uploadQr(); }} disabled={saving}>
                <Text style={styles.secondaryButtonText}>{saving ? "Working…" : hasQrCode ? "Replace QR Code" : "Upload QR Code"}</Text>
              </TouchableOpacity>
              {hasQrCode ? (
                <TouchableOpacity style={styles.removeButton} onPress={() => { void removeQr(); }} disabled={saving}>
                  <Text style={styles.removeButtonText}>Remove QR Code</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.notice}>
          UPI payments are made outside HeyTenant. Renters will submit a payment request after paying, and you must verify receipt before confirming it in your dashboard.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BLUE },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 24, color: WHITE, lineHeight: 28 },
  headerCenter: { alignItems: "center" },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  subtitle: { color: WHITE_40, fontSize: 11, marginTop: 2 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle: { color: WHITE, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  help: { color: WHITE_40, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: WHITE_15, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: WHITE, backgroundColor: "rgba(255,255,255,0.04)", fontSize: 14 },
  primaryButton: { marginTop: 12, backgroundColor: TEAL, borderRadius: 12, padding: 13, alignItems: "center" },
  primaryButtonText: { color: WHITE, fontWeight: "700", fontSize: 13 },
  secondaryButton: { backgroundColor: WHITE_08, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, padding: 13, alignItems: "center" },
  secondaryButtonText: { color: ACCENT_LIGHT, fontWeight: "700", fontSize: 13 },
  qrImage: { width: 220, height: 220, alignSelf: "center", marginVertical: 8, backgroundColor: WHITE, borderRadius: 12 },
  qrPlaceholder: { height: 160, borderWidth: 1, borderColor: WHITE_15, borderStyle: "dashed", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  qrPlaceholderText: { color: WHITE_40, fontSize: 12 },
  removeButton: { alignItems: "center", padding: 12 },
  removeButtonText: { color: "#F87171", fontSize: 12, fontWeight: "600" },
  error: { color: "#F87171", textAlign: "center", fontSize: 12 },
  message: { color: "#22C55E", textAlign: "center", fontSize: 12 },
  notice: { color: WHITE_72, fontSize: 12, lineHeight: 18, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 13 },
});
