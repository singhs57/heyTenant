import { useCallback, useState } from "react";
import {
  ActivityIndicator, Image, Platform, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND = "#1A3C5E";
const DEEP = "#122B44";
const TEAL = "#0D9488";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.58)";
const BORDER = "rgba(255,255,255,0.12)";
const DANGER = "#F87171";
const SUCCESS = "#22C55E";

type MeterReading = {
  _id: string;
  period: string;
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  ratePerUnit: number;
  chargeAmount: number;
  photoMimeType: string;
  updatedAt: string;
  tenant?: { fullName?: string; email?: string };
  lease?: { property?: { name?: string; addressLine1?: string; city?: string } };
};

export default function ElectricityReadings() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [photoStatus, setPhotoStatus] = useState<Record<string, "loading" | "loaded" | "error">>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadReadings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("Not authenticated.");
      setToken(accessToken);
      const response = await fetch(`${API_URL}/api/landlord/electricity-readings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load meter readings.");
      setReadings(json?.data ?? []);
      setPhotoStatus({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load meter readings.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadReadings(); });

  const review = async (readingId: string, decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && (reasons[readingId]?.trim().length ?? 0) < 5) {
      setError("Enter a rejection reason of at least 5 characters.");
      return;
    }
    setBusyId(readingId);
    setError("");
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/electricity-readings/${readingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          decision,
          rejectionReason: decision === "REJECTED" ? reasons[readingId]?.trim() : undefined,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not review meter reading.");
      await loadReadings();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review meter reading.");
    } finally {
      setBusyId(null);
    }
  };

  const topPadding = Math.max(insets.top + 8, Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 8 : 32);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Electricity Readings</Text>
          <Text style={styles.subtitle}>Review meter photos before billing</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 28, 40) }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadReadings(); }} tintColor={TEAL} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && readings.length === 0 ? <ActivityIndicator color={TEAL} /> : null}
        {!loading && readings.length === 0 && !error ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>No readings awaiting review</Text>
            <Text style={styles.muted}>New renter meter submissions will appear here.</Text>
          </View>
        ) : null}
        {readings.map((reading) => {
          const property = reading.lease?.property;
          return (
            <View key={reading._id} style={styles.card}>
              <Text style={styles.tenant}>{reading.tenant?.fullName ?? "Renter"}</Text>
              <Text style={styles.muted}>{property?.name ?? "Property"} · {reading.period}</Text>
              <Text style={styles.muted}>{property?.addressLine1 ?? ""}{property?.city ? `, ${property.city}` : ""}</Text>
              {token ? (
                <Image
                  key={`${reading._id}-${reading.updatedAt}`}
                  source={{
                    uri: `${API_URL}/api/landlord/electricity-readings/${reading._id}/photo?v=${encodeURIComponent(reading.updatedAt)}`,
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={styles.photo}
                  resizeMode="contain"
                  accessibilityLabel="Submitted electricity meter photo"
                  onLoad={() => setPhotoStatus((current) => ({ ...current, [reading._id]: "loaded" }))}
                  onError={() => setPhotoStatus((current) => ({ ...current, [reading._id]: "error" }))}
                />
              ) : null}
              {photoStatus[reading._id] !== "loaded" ? (
                <Text style={photoStatus[reading._id] === "error" ? styles.error : styles.muted}>
                  {photoStatus[reading._id] === "error" ? "Could not load the meter photo. Retry before approving." : "Loading meter photo…"}
                </Text>
              ) : null}
              <View style={styles.readingBox}>
                <Text style={styles.readingText}>Previous verified: {reading.previousReading}</Text>
                <Text style={styles.readingText}>Current reading: {reading.currentReading}</Text>
                <Text style={styles.readingText}>Units: {reading.unitsConsumed.toLocaleString("en-IN")}</Text>
                <Text style={styles.charge}>Electricity: ₹{reading.chargeAmount.toLocaleString("en-IN")} ({reading.ratePerUnit}/unit)</Text>
              </View>
              <TextInput
                value={reasons[reading._id] ?? ""}
                onChangeText={(value) => setReasons((current) => ({ ...current, [reading._id]: value }))}
                placeholder="Reason required if rejecting"
                placeholderTextColor={MUTED}
                style={styles.input}
                maxLength={500}
              />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => { void review(reading._id, "REJECTED"); }}
                  disabled={busyId !== null}
                >
                  <Text style={styles.actionText}>{busyId === reading._id ? "Saving…" : "Reject"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => { void review(reading._id, "APPROVED"); }}
                  disabled={busyId !== null || photoStatus[reading._id] !== "loaded"}
                  accessibilityState={{ disabled: busyId !== null || photoStatus[reading._id] !== "loaded" }}
                >
                  <Text style={styles.actionText}>{busyId === reading._id ? "Saving…" : "Approve reading"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, backgroundColor: DEEP, borderBottomWidth: 1, borderBottomColor: BORDER },
  backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  backText: { color: WHITE, fontSize: 24 },
  headerText: { alignItems: "center" },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 11, marginTop: 2 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 16 },
  tenant: { color: WHITE, fontSize: 15, fontWeight: "700", marginBottom: 5 },
  muted: { color: MUTED, fontSize: 12, lineHeight: 18 },
  photo: { width: "100%", height: 240, marginTop: 14, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 12 },
  readingBox: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", gap: 5 },
  readingText: { color: MUTED, fontSize: 12 },
  charge: { color: SUCCESS, fontSize: 13, fontWeight: "700", marginTop: 4 },
  input: { marginTop: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: WHITE, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rejectButton: { backgroundColor: DANGER },
  approveButton: { backgroundColor: TEAL },
  actionText: { color: WHITE, fontSize: 13, fontWeight: "700" },
  error: { color: DANGER, fontSize: 13, marginBottom: 4 },
  emptyTitle: { color: WHITE, fontSize: 15, fontWeight: "700", marginBottom: 8 },
});
