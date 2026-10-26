import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, RefreshControl, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";
import { RENT_PAYMENT_DUE_DAY } from "../../lib/rentSchedule";

const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const ACCENT_LIGHT = "#4A90D9";
const TEAL         = "#0D9488";
const TEAL_BG      = "rgba(13,148,136,0.12)";
const SUCCESS      = "#22C55E";
const SUCCESS_BG   = "rgba(34,197,94,0.12)";
const WARNING      = "#F59E0B";
const WARNING_BG   = "rgba(245,158,11,0.12)";
const DANGER       = "#F87171";
const DANGER_BG    = "rgba(248,113,113,0.12)";
const PURPLE       = "#8B5CF6";
const PURPLE_BG    = "rgba(139,92,246,0.12)";
const WHITE        = "#FFFFFF";
const WHITE_90     = "rgba(255,255,255,0.90)";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(16);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

type LeaseInfoData = {
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  notes?: string;
  property?: {
    name: string;
    addressLine1: string;
    city: string;
    postcode: string;
    propertyType: string;
    bedrooms: number;
    depositAmount?: number;
  };
};

function LeaseTimeline({ lease }: { lease: LeaseInfoData | null }) {
  const now = Date.now();
  const start = lease ? new Date(lease.leaseStart).getTime() : 0;
  const end = lease ? new Date(lease.leaseEnd).getTime() : 0;
  const progress = end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  return (
    <View>
      <View style={{ height: 8, backgroundColor: WHITE_08, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ width: `${progress}%`, height: 8, backgroundColor: TEAL, borderRadius: 4 }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ fontSize: 11, color: WHITE_40 }}>{lease ? new Date(lease.leaseStart).toLocaleDateString("en-IN") : "—"}</Text>
        <Text style={{ fontSize: 11, fontWeight: "700", color: WHITE_40 }}>{lease ? `${Math.round(progress)}% elapsed` : "No active lease"}</Text>
        <Text style={{ fontSize: 11, color: WHITE_40, fontWeight: "700" }}>{lease ? new Date(lease.leaseEnd).toLocaleDateString("en-IN") : "—"}</Text>
      </View>
    </View>
  );
}

export default function LeaseInfo() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);
  const [lease, setLease] = useState<LeaseInfoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLease = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) { setError("Not authenticated."); return; }
      const response = await fetch(`${API_URL}/api/renter/lease`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (response.status === 404) { setLease(null); return; }
      if (!response.ok) { setError(json?.error?.message ?? "Failed to load lease details."); return; }
      setLease(json?.data ?? null);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void fetchLease(); });

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => { hOp.value = withTiming(1, { duration: 350 }); hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }); }, []);
  const hStyle = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop: pt }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={s.hCenter}><Text style={s.hTitle}>Lease Info</Text><Text style={s.hSub}>Tenancy details & terms</Text></View>
        <View style={{ width: 38 }} />
      </Animated.View>

      <ScrollView
        style={s.body}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void fetchLease(); }} tintColor={TEAL} />}
      >
        {error ? <Text style={{ color: DANGER, textAlign: "center" }}>{error}</Text> : null}
        {loading && !lease ? <ActivityIndicator color={TEAL} /> : null}


        {/* Property summary */}
        <FadeIn delay={60}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Property</Text>
            <View style={s.propRow}>
              <View style={s.propIconBox}><Text style={{ fontSize: 28 }}>🏢</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.propName}>{lease?.property?.name ?? "No property assigned"}</Text>
                <Text style={s.propAddr}>{lease?.property
                  ? `${lease.property.addressLine1}, ${lease.property.city} ${lease.property.postcode}`
                  : error || "No active lease is linked to this account."}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  {lease ? <View style={[s.propTag, { backgroundColor: TEAL_BG }]}><Text style={[s.propTagTxt, { color: TEAL }]}>Active Lease</Text></View> : null}
                  {lease?.property?.propertyType ? <View style={[s.propTag, { backgroundColor: PURPLE_BG }]}><Text style={[s.propTagTxt, { color: PURPLE }]}>{lease.property.propertyType}</Text></View> : null}
                  {lease?.property?.bedrooms ? <View style={[s.propTag, { backgroundColor: WHITE_08 }]}><Text style={[s.propTagTxt, { color: WHITE_40 }]}>{lease.property.bedrooms} BHK</Text></View> : null}
                </View>
              </View>
            </View>
          </View>
        </FadeIn>

        {/* Lease term timeline */}
        <FadeIn delay={120}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Lease Period</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 16 }}>
              {[
                ["Start", lease ? new Date(lease.leaseStart).toLocaleDateString("en-IN") : "—", WHITE_72],
                ["End", lease ? new Date(lease.leaseEnd).toLocaleDateString("en-IN") : "—", WHITE_40],
                ["Due day", lease ? `Day ${RENT_PAYMENT_DUE_DAY}` : "—", TEAL],
              ].map(([l, v, c]) => (
                <View key={l as string} style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: c as string }}>{v}</Text>
                  <Text style={{ fontSize: 10, color: WHITE_40 }}>{l}</Text>
                </View>
              ))}
            </View>
            <LeaseTimeline lease={lease} />
          </View>
        </FadeIn>

        {/* Financial terms */}
        <FadeIn delay={180}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Financial Terms</Text>
            {[
              ["Monthly Rent", lease ? `₹${lease.monthlyRent.toLocaleString("en-IN")}` : "—", WARNING, "Payable from the 1st, due by the 10th"],
              ["Security Deposit", lease ? `₹${(lease.property?.depositAmount ?? 0).toLocaleString("en-IN")}` : "—", ACCENT_LIGHT, "Amount recorded on the property"],
            ].map(([l, v, c, sub], i) => (
              <View key={l as string} style={[s.finRow, i > 0 && s.bt]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.finLabel}>{l}</Text>
                  <Text style={s.finSub}>{sub}</Text>
                </View>
                <Text style={[s.finValue, { color: c as string }]}>{v}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* Key clauses */}
        <FadeIn delay={240}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Agreement Notes</Text>
            <Text style={s.clauseBody}>{lease?.notes?.trim() || "No additional lease clauses have been recorded in the app. Check your signed rental agreement for the applicable terms."}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Indian Tenancy References</Text>
            <Text style={s.clauseBody}>Tenancy rules can vary by state and Union Territory. These national references are informational; check the applicable local law and your signed agreement.</Text>
            <TouchableOpacity onPress={() => Linking.openURL("https://mohua.gov.in/upload/uploadfiles/files/Model_Tenancy_Act_2021.pdf")} style={{ paddingTop: 12 }}>
              <Text style={{ color: ACCENT_LIGHT, fontWeight: "600" }}>Model Tenancy Act, 2021 (MoHUA) ↗</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BLUE },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 24, color: WHITE, lineHeight: 28 },
  hCenter: { alignItems: "center" },
  hTitle: { fontSize: 16, fontWeight: "700", color: WHITE },
  hSub: { fontSize: 11, color: WHITE_40, marginTop: 1 },
  body: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 14, letterSpacing: 0.2 },
  bt: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  twoCol: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  renewalAlert: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: DANGER_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: `${DANGER}30` },
  renewalTitle: { fontSize: 13, fontWeight: "700", color: DANGER, marginBottom: 4 },
  renewalBody: { fontSize: 12, color: WHITE_72, lineHeight: 17 },
  propRow: { flexDirection: "row", gap: 14 },
  propIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: WHITE_15, flexShrink: 0 },
  propName: { fontSize: 15, fontWeight: "700", color: WHITE, marginBottom: 3 },
  propAddr: { fontSize: 12, color: WHITE_40, lineHeight: 17 },
  propTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  propTagTxt: { fontSize: 10, fontWeight: "700" },
  finRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11 },
  finLabel: { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 2 },
  finSub: { fontSize: 11, color: WHITE_40 },
  finValue: { fontSize: 15, fontWeight: "800" },
  clauseRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  clauseTitle: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 3 },
  clauseBody: { fontSize: 12, color: WHITE_72, lineHeight: 17 },
  respRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  respDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  respTxt: { fontSize: 12, color: WHITE_72 },
  ctaRow: { flexDirection: "row", gap: 12 },
  ctaBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ctaTxt: { fontSize: 13, fontWeight: "700", color: WHITE },
});
