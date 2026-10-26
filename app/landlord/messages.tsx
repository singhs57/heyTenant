import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND = "#1A3C5E";
const DEEP = "#122B44";
const TEAL = "#0D9488";
const BLUE = "#4A90D9";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.55)";
const BORDER = "rgba(255,255,255,0.12)";
const RED = "#F87171";
type TenantRecord = { _id: string; status?: string; tenant?: { _id: string; fullName?: string }; property?: { name?: string } };
type MessageRecord = { _id: string; body: string; subject?: string; senderRole: "LANDLORD" | "RENTER"; createdAt: string };

export default function LandlordMessages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const headers = { Authorization: `Bearer ${token}` };
      const tenantResponse = await fetch(`${API_URL}/api/landlord/tenants`, { headers });
      const tenantJson = await tenantResponse.json();
      if (!tenantResponse.ok) throw new Error(tenantJson?.error?.message ?? "Could not load tenants.");
      const activeTenants: TenantRecord[] = (tenantJson?.data ?? []).filter(
        (tenant: TenantRecord) => tenant.status === "ACTIVE" && tenant.tenant?._id
      );
      setTenants(activeTenants);
      const selected = activeTenants.some((tenant) => tenant.tenant?._id === tenantId)
        ? tenantId
        : activeTenants[0]?.tenant?._id ?? "";
      setTenantId(selected);
      if (!selected) {
        setMessages([]);
        return;
      }
      const messageResponse = await fetch(
        `${API_URL}/api/landlord/messages?tenantId=${encodeURIComponent(selected)}`,
        { headers }
      );
      const messageJson = await messageResponse.json();
      if (!messageResponse.ok) throw new Error(messageJson?.error?.message ?? "Could not load messages.");
      setMessages(messageJson?.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [getToken, tenantId]);

  useStableFocusEffect(() => { void loadData(); });

  const chooseTenant = async (id: string) => {
    setTenantId(id);
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/messages?tenantId=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load messages.");
      setMessages(json?.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!tenantId || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, body: draft.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not send message.");
      setMessages((items) => [...items, json.data]);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const selectedTenant = tenants.find((tenant) => tenant.tenant?._id === tenantId);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { paddingTop: Math.max(insets.top + 8, Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 8 : 32) }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></TouchableOpacity>
        <View style={{ alignItems: "center" }}><Text style={s.title}>Tenant Messages</Text><Text style={s.subtitle}>Saved tenancy conversations</Text></View>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView
        style={s.body}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadData(); }} tintColor={BLUE} />}
      >
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.card}>
          <Text style={s.section}>Active tenants</Text>
          {tenants.length === 0 && !loading ? <Text style={s.muted}>No active tenants available.</Text> : tenants.map((tenant) => {
            const id = tenant.tenant!._id;
            return (
              <TouchableOpacity key={id} onPress={() => { void chooseTenant(id); }} style={[s.tenantRow, tenantId === id && s.selected]}>
                <Text style={[s.tenantName, tenantId === id && { color: WHITE }]}>{tenant.tenant?.fullName ?? "Tenant"}</Text>
                <Text style={s.muted}>{tenant.property?.name ?? "Property"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {selectedTenant ? (
          <View style={s.card}>
            <Text style={s.section}>{selectedTenant.tenant?.fullName ?? "Tenant"} · {selectedTenant.property?.name ?? "Property"}</Text>
            {loading ? <ActivityIndicator color={BLUE} /> : messages.length === 0 ? <Text style={s.muted}>No messages yet.</Text> : messages.map((message) => (
              <View key={message._id} style={[s.message, message.senderRole === "LANDLORD" ? s.mine : s.theirs]}>
                {message.subject ? <Text style={s.subject}>{message.subject}</Text> : null}
                <Text style={s.messageText}>{message.body}</Text>
                <Text style={s.time}>{message.senderRole === "LANDLORD" ? "You · " : "Tenant · "}{new Date(message.createdAt).toLocaleString("en-IN")}</Text>
              </View>
            ))}
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={s.composer}>
                <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor={MUTED} multiline style={s.input} />
                <TouchableOpacity onPress={() => { void send(); }} disabled={!draft.trim() || sending} style={[s.sendButton, (!draft.trim() || sending) && { opacity: 0.5 }]}>
                  {sending ? <ActivityIndicator color={WHITE} /> : <Text style={s.sendText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, backgroundColor: DEEP, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  backText: { color: WHITE, fontSize: 24 },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 11, marginTop: 2 },
  body: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 16 },
  section: { color: WHITE, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  tenantRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
  tenantName: { color: MUTED, fontSize: 13, fontWeight: "600" },
  selected: { backgroundColor: "rgba(13,148,136,0.12)" },
  muted: { color: MUTED, fontSize: 12, marginTop: 3 },
  error: { color: RED, fontSize: 13 },
  message: { maxWidth: "90%", borderRadius: 14, padding: 12, marginTop: 8 },
  mine: { backgroundColor: TEAL, alignSelf: "flex-end" },
  theirs: { backgroundColor: "rgba(255,255,255,0.08)", alignSelf: "flex-start" },
  subject: { color: WHITE, fontWeight: "700", marginBottom: 4 },
  messageText: { color: WHITE, fontSize: 13, lineHeight: 18 },
  time: { color: "rgba(255,255,255,0.65)", fontSize: 9, marginTop: 5 },
  composer: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 14 },
  input: { flex: 1, minHeight: 44, maxHeight: 100, color: WHITE, backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  sendButton: { height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  sendText: { color: WHITE, fontWeight: "700" },
});
