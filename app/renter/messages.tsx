import { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, StatusBar, KeyboardAvoidingView, ActivityIndicator,
  type ScrollViewInstance,
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
const SUCCESS      = "#22C55E";
const WARNING      = "#F59E0B";
const WARNING_BG   = "rgba(245,158,11,0.12)";
const DANGER       = "#F87171";
const DANGER_BG    = "rgba(248,113,113,0.12)";
const WHITE        = "#FFFFFF";
const WHITE_90     = "rgba(255,255,255,0.90)";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

type MessageRecord = { _id: string; body: string; subject?: string; senderRole: "LANDLORD" | "RENTER"; createdAt: string };
type LeaseRecord = { landlord?: { fullName?: string; email?: string } };

const LANDLORD_CONTACT = { id: "landlord", icon: "👤", color: TEAL };

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(16);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 400 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

export default function Messages() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [thread,  setThread]  = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [lease, setLease] = useState<LeaseRecord | null>(null);
  const [draft,   setDraft]   = useState("");
  const [iF,      setIF]      = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollViewInstance>(null);

  const contact = thread ? {
    ...LANDLORD_CONTACT,
    name: lease?.landlord?.fullName ?? "Landlord",
    email: lease?.landlord?.email,
  } : null;

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const headers = { Authorization: `Bearer ${token}` };
      const [leaseResponse, messageResponse] = await Promise.all([
        fetch(`${API_URL}/api/renter/lease`, { headers }),
        fetch(`${API_URL}/api/renter/messages`, { headers }),
      ]);
      const [leaseJson, messageJson] = await Promise.all([leaseResponse.json(), messageResponse.json()]);
      if (!leaseResponse.ok && leaseResponse.status !== 404) {
        throw new Error(leaseJson?.error?.message ?? "Could not load your lease.");
      }
      if (!messageResponse.ok && !(messageResponse.status === 404 && leaseResponse.status === 404)) {
        throw new Error(messageJson?.error?.message ?? "Could not load messages.");
      }
      setLease(leaseResponse.ok ? leaseJson?.data ?? null : null);
      setMessages(messageResponse.ok ? messageJson?.data ?? [] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadMessages(); });

  const send = async () => {
    if (!draft.trim() || !thread || sending) return;
    setSending(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/renter/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not send message.");
      setMessages((previous) => [...previous, json.data]);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => { hOp.value = withTiming(1, { duration: 350 }); hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }); }, []);
  const hStyle = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));

  // Thread view
  if (thread && contact) return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.thHeader, { paddingTop: pt }]}>
        <TouchableOpacity onPress={() => setThread(null)} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={[s.thAvatar, { backgroundColor: `${contact.color}22` }]}><Text style={{ fontSize: 18 }}>{contact.icon}</Text></View>
        <View style={{ flex: 1 }}>
        <Text style={s.thName}>{contact.name}</Text>
        <Text style={s.onlineTxt}>{contact.email ?? "Your landlord"}</Text>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {error ? <Text style={{ color: DANGER, textAlign: "center", marginTop: 10 }}>{error}</Text> : null}
          {loading ? <ActivityIndicator color={ACCENT_LIGHT} /> : messages.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
              <Text style={{ fontSize: 15, color: WHITE_40 }}>No messages yet.</Text>
              <Text style={{ fontSize: 13, color: WHITE_40, marginTop: 4 }}>Start the conversation below.</Text>
            </View>
          ) : (
            messages.map((m, i) => (
              <View key={m._id} style={[m.senderRole === "RENTER" ? s.bubbleMine : s.bubbleTheirs, { marginTop: i > 0 && messages[i - 1].senderRole === m.senderRole ? 3 : 12 }]}>
                {m.subject ? <Text style={{ fontSize: 12, fontWeight: "700", color: WHITE, marginBottom: 5 }}>{m.subject}</Text> : null}
                <Text style={{ fontSize: 14, lineHeight: 20, color: m.senderRole === "RENTER" ? WHITE : WHITE_90 }}>{m.body}</Text>
                <Text style={{ fontSize: 10, color: WHITE_40, marginTop: 4, textAlign: m.senderRole === "RENTER" ? "right" : "left" }}>{new Date(m.createdAt).toLocaleString("en-IN")}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput style={[s.msgInput, iF && s.msgInputF]} placeholder="Type a message…" placeholderTextColor="rgba(255,255,255,0.3)" value={draft} onChangeText={setDraft} multiline onFocus={() => setIF(true)} onBlur={() => setIF(false)} />
          <TouchableOpacity style={[s.sendBtn, { backgroundColor: draft.trim() ? TEAL : WHITE_08 }]} onPress={() => { void send(); }} activeOpacity={0.85} disabled={!draft.trim() || sending || !lease}>
            <Text style={{ fontSize: 26, fontWeight: "700", lineHeight: 30, color: draft.trim() ? WHITE : WHITE_40 }}>›</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  // Inbox view
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop: pt }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={s.hTitle}>Messages</Text>
        </View>
        <View style={{ width: 38 }} />
      </Animated.View>
      <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]} showsVerticalScrollIndicator={false}>
        <FadeIn delay={0}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Conversations</Text>
            {error ? <Text style={{ color: DANGER }}>{error}</Text> : loading ? <ActivityIndicator color={ACCENT_LIGHT} /> : !lease ? (
              <Text style={{ color: WHITE_40 }}>A landlord conversation is available after an active lease is assigned.</Text>
            ) : (
              <TouchableOpacity onPress={() => setThread(LANDLORD_CONTACT.id)} activeOpacity={0.75} style={s.inboxRow}>
                <View style={[s.inboxAvatar, { backgroundColor: `${LANDLORD_CONTACT.color}20` }]}>
                  <Text style={{ fontSize: 20 }}>{LANDLORD_CONTACT.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.inboxName}>{lease.landlord?.fullName ?? "Landlord"}</Text>
                  <Text style={s.inboxPreview} numberOfLines={1}>
                    {messages.length ? messages[messages.length - 1].body : "Tap to start a conversation"}
                  </Text>
                </View>
                {messages.length > 0 ? <Text style={{ fontSize: 10, color: WHITE_40 }}>{new Date(messages[messages.length - 1].createdAt).toLocaleDateString("en-IN")}</Text> : null}
              </TouchableOpacity>
            )}
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
  hCenter: { alignItems: "center", flex: 1 },
  hTitle: { fontSize: 16, fontWeight: "700", color: WHITE },
  unreadPill: { marginTop: 3, backgroundColor: `${TEAL}30`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  unreadTxt: { fontSize: 10, fontWeight: "700", color: TEAL },
  body: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 14, letterSpacing: 0.2 },
  bt: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  inboxRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  inboxAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  onlineBadge: { position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: SUCCESS, borderWidth: 2, borderColor: BRAND_BLUE },
  inboxName: { fontSize: 14, fontWeight: "700", color: WHITE_72 },
  inboxPreview: { fontSize: 12, color: WHITE_40 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT_LIGHT, flexShrink: 0 },
  emergBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emergTxt: { fontSize: 13, fontWeight: "700" },
  thHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  thAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  thName: { fontSize: 15, fontWeight: "700", color: WHITE },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineTxt: { fontSize: 11, color: WHITE_40 },
  callBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  bubbleMine: { maxWidth: "78%", alignSelf: "flex-end", backgroundColor: TEAL, borderRadius: 18, borderBottomRightRadius: 4, padding: 12 },
  bubbleTheirs: { maxWidth: "78%", alignSelf: "flex-start", backgroundColor: WHITE_08, borderRadius: 18, borderBottomLeftRadius: 4, padding: 12 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: BRAND_DEEP, borderTopWidth: 1, borderTopColor: WHITE_08 },
  msgInput: { flex: 1, backgroundColor: WHITE_05, borderRadius: 20, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: WHITE, maxHeight: 100 },
  msgInputF: { borderColor: TEAL },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
