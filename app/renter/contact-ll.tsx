import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, StatusBar, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

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
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

type LeaseRecord = { property?: { name?: string }; landlord?: { fullName?: string; email?: string } };

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(16);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

export default function ContactLL() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [lease,   setLease]   = useState<LeaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [subF,    setSF]      = useState(false);
  const [bodyF,   setBF]      = useState(false);

  const currentContact = { name: lease?.landlord?.fullName ?? "Landlord", color: TEAL, icon: "👤" };

  const loadLease = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/renter/lease`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load landlord details.");
      setLease(json?.data ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load landlord details.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadLease(); });

  const send = async () => {
    if (!subject.trim() || !body.trim() || !lease) return;
    setSending(true);
    setSendError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/renter/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not send message.");
      setSent(true);
      router.back();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => { hOp.value = withTiming(1, { duration: 350 }); hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }); }, []);
  const hStyle = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop: pt }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={s.hCenter}><Text style={s.hTitle}>Contact Landlord</Text><Text style={s.hSub}>Get in touch</Text></View>
        <View style={{ width: 38 }} />
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {loadError ? <Text style={{ color: DANGER }}>{loadError}</Text> : null}

          {/* Landlord profile card */}
          <FadeIn delay={0}>
            <View style={[s.card, { borderColor: `${TEAL}30` }]}>
              <View style={s.profileRow}>
                <View style={s.profileAvatar}><Text style={s.profileAvatarTxt}>LL</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.profileName}>{loading ? "Loading landlord…" : lease?.landlord?.fullName ?? "Landlord"}</Text>
                  <Text style={s.profileRole}>{lease?.property?.name ?? "Current tenancy"}</Text>
                </View>
              </View>
              <View style={s.profileDetails}>
                <View style={s.profileDetailRow}><Text style={s.profileDetailIcon}>✉️</Text><Text style={s.profileDetailTxt}>{lease?.landlord?.email ?? "Email unavailable"}</Text></View>
              </View>
            </View>
          </FadeIn>

          {/* Quick contact buttons */}
          <FadeIn delay={70}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Contact Directory</Text>
              <Text style={s.contactRole}>
                Messages are saved to your tenancy so you and your landlord can refer to the conversation later.
              </Text>
            </View>
          </FadeIn>

          {/* Send message form */}
          <FadeIn delay={140}>
            <View style={[s.card, { borderColor: `${currentContact.color}30` }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Text style={s.cardTitle}>Send Message</Text>
                <View style={[s.typeBadge, { backgroundColor: `${currentContact.color}18` }]}>
                  <Text>{currentContact.icon}</Text>
                  <Text style={[s.typeBadgeTxt, { color: currentContact.color }]}>{currentContact.name}</Text>
                </View>
              </View>

              {/* Recipient */}
              <Text style={s.fieldLbl}>Send To</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                <Text style={s.contactRole}>{currentContact.name} · {lease?.landlord?.email ?? "Email unavailable"}</Text>
              </View>

              <Text style={s.fieldLbl}>Subject</Text>
              <TextInput
                style={[s.input, subF && s.inputF]}
                placeholder="e.g. Rent payment query"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={subject} onChangeText={setSubject}
                onFocus={() => setSF(true)} onBlur={() => setSF(false)}
              />

              <Text style={[s.fieldLbl, { marginTop: 12 }]}>Message</Text>
              <TextInput
                style={[s.input, s.textArea, bodyF && s.inputF]}
                placeholder="Type your message here…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={body} onChangeText={setBody} multiline
                onFocus={() => setBF(true)} onBlur={() => setBF(false)}
              />
              <Text style={{ fontSize: 10, color: WHITE_40, textAlign: "right", marginTop: 4 }}>{body.length} characters</Text>

              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: currentContact.color }, (!subject.trim() || !body.trim() || sending || sent || loading || !lease) && { opacity: 0.6 }]}
                onPress={() => { void send(); }} activeOpacity={0.85}
                disabled={!subject.trim() || !body.trim() || sending || sent || loading || !lease}
              >
                <Text style={s.sendTxt}>{sent ? "Sent ✓" : sending ? "Sending…" : "Send Message  →"}</Text>
              </TouchableOpacity>
              {sendError ? <Text style={{ color: DANGER, marginTop: 10 }}>{sendError}</Text> : null}
            </View>
          </FadeIn>

        </ScrollView>
      </KeyboardAvoidingView>
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
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, letterSpacing: 0.2 },
  bt: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: `${TEAL}50` },
  profileAvatarTxt: { fontSize: 18, fontWeight: "800", color: WHITE },
  profileName: { fontSize: 17, fontWeight: "700", color: WHITE },
  profileRole: { fontSize: 12, color: WHITE_40, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SUCCESS },
  onlineTxt: { fontSize: 11, color: SUCCESS, fontWeight: "600" },
  profileActions: { flexDirection: "row", gap: 8 },
  profileActionBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  profileDetails: { gap: 8 },
  profileDetailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileDetailIcon: { fontSize: 14, width: 22 },
  profileDetailTxt: { fontSize: 13, color: WHITE_72, flex: 1 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  contactAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contactName: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  contactRole: { fontSize: 11, color: WHITE_40 },
  contactBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeTxt: { fontSize: 12, fontWeight: "700" },
  fieldLbl: { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  toChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05 },
  toChipTxt: { fontSize: 11, fontWeight: "600", color: WHITE_40 },
  input: { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE },
  textArea: { minHeight: 100, textAlignVertical: "top", lineHeight: 20 },
  inputF: { borderColor: TEAL },
  sendBtn: { borderRadius: 14, height: 50, alignItems: "center", justifyContent: "center", marginTop: 14 },
  sendTxt: { fontSize: 14, fontWeight: "800", color: WHITE, letterSpacing: 0.3 },
  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  hoursDay: { fontSize: 13, color: WHITE_72 },
  hoursTime: { fontSize: 13, fontWeight: "600", color: WHITE },
  emergencyBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: DANGER_BG, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${DANGER}25` },
  emergencyTitle: { fontSize: 13, fontWeight: "700", color: DANGER, marginBottom: 3 },
  emergencyBody: { fontSize: 12, color: WHITE_72, lineHeight: 17 },
  emergCallBtn: { backgroundColor: DANGER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "center" },
  emergCallTxt: { fontSize: 12, fontWeight: "700", color: WHITE },
  disputeBtn: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  disputeTxt: { fontSize: 12, fontWeight: "700" },
});
