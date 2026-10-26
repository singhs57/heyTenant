import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, StatusBar, KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const ACCENT       = "#3B6FA8";
const ACCENT_LIGHT = "#4A90D9";
const SUCCESS      = "#22C55E";
const SUCCESS_BG   = "rgba(34,197,94,0.12)";
const WARNING      = "#F59E0B";
const WARNING_BG   = "rgba(245,158,11,0.12)";
const DANGER       = "#F87171";
const DANGER_BG    = "rgba(248,113,113,0.12)";
const PURPLE       = "#8B5CF6";
const WHITE        = "#FFFFFF";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

const NOTICE_TYPES = [
  { id: "general",     label: "General",       icon: "📢", color: ACCENT_LIGHT, bg: `${ACCENT_LIGHT}18` },
  { id: "rent",        label: "Rent Reminder", icon: "💰", color: WARNING,      bg: WARNING_BG           },
  { id: "inspection",  label: "Inspection",    icon: "🔍", color: PURPLE,       bg: `${PURPLE}18`        },
  { id: "maintenance", label: "Maintenance",   icon: "🔧", color: WARNING,      bg: WARNING_BG           },
  { id: "legal",       label: "Legal Notice", icon: "⚠️", color: DANGER,       bg: DANGER_BG            },
  { id: "welcome",     label: "Welcome",       icon: "🏠", color: SUCCESS,      bg: SUCCESS_BG           },
];

const RECIPIENTS = [
  { id: "all",      label: "All Active Tenants",  count: null },
  { id: "custom",   label: "Select Individually",  count: null },
];

type TenantRecord = {
  tenant?: { _id: string; fullName?: string };
  property?: { name?: string };
  status?: string;
};

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  rent:        { subject: "Rent Payment Reminder", body: "Dear Tenant,\n\nThis is a reminder to review the rent amount and due date set out in your rental agreement. Please contact me if you have any questions.\n\nRegards,\nYour Landlord" },
  inspection:  { subject: "Property Inspection", body: "Dear Tenant,\n\nPlease contact me to coordinate a suitable date and time for a property inspection.\n\nRegards,\nYour Landlord" },
  maintenance: { subject: "Planned Maintenance Notice", body: "Dear Tenant,\n\nPlease see the maintenance details and timing below. Contact me if you need to discuss access arrangements.\n\nRegards,\nYour Landlord" },
  legal:       { subject: "Tenancy Notice", body: "Dear Tenant,\n\nPlease review the details in this notice and your rental agreement. Notice periods and requirements depend on applicable Indian law and your state or union territory. Please seek qualified local advice where needed.\n\nRegards,\nYour Landlord" },
  welcome:     { subject: "Welcome to Your New Home!", body: "Dear Tenant,\n\nWe are delighted to welcome you to your new home!\n\nYour tenancy commences __/__/____. Please find attached your tenancy agreement and move-in checklist.\n\nWarm regards,\nProperty Management" },
  general:     { subject: "", body: "" },
};

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function SendNotice() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [noticeType, setNoticeType] = useState("general");
  const [recipient,  setRecipient]  = useState("all");
  const [selected,   setSelected]   = useState<string[]>([]);
  const [subject,    setSubject]    = useState("");
  const [body,       setBody]       = useState("");
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [tenants,    setTenants]    = useState<TenantRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState("");
  const [sendError,  setSendError]  = useState("");
  const [subFocused, setSubFocused] = useState(false);
  const [bodyFocused,setBodyFocused] = useState(false);

  const currentType = NOTICE_TYPES.find(n => n.id === noticeType)!;

  const applyTemplate = (id: string) => {
    const t = TEMPLATES[id];
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const toggleTenant = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load tenants.");
      setTenants((json?.data ?? []).filter((tenant: TenantRecord) => tenant.status === "ACTIVE" && tenant.tenant?._id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load tenants.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadTenants(); });

  const handleSend = async () => {
    const tenantIds = recipient === "all"
      ? tenants.map((tenant) => tenant.tenant!._id)
      : selected;
    if (!tenantIds.length || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantIds, type: noticeType, subject: subject.trim(), body: body.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not publish notice.");
      setSent(true);
      router.back();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not publish notice.");
    } finally {
      setSending(false);
    }
  };

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => {
    hOp.value = withTiming(1, { duration: 350 });
    hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, []);
  const hStyle = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={s.hTitle}>Send Notice</Text>
          <Text style={s.hSub}>Compose & send to tenants</Text>
        </View>
        <View style={{ width: 38 }} />
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadTenants(); }} tintColor={ACCENT_LIGHT} />}>
          {loadError ? <Text style={{ color: DANGER }}>{loadError}</Text> : null}

          {/* Notice type */}
          <FadeIn delay={0}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Notice Type</Text>
              <View style={s.typeGrid}>
                {NOTICE_TYPES.map((t) => (
                  <TouchableOpacity key={t.id} onPress={() => { setNoticeType(t.id); applyTemplate(t.id); }} activeOpacity={0.75}
                    style={[s.typeCard, noticeType === t.id && { borderColor: t.color, backgroundColor: t.bg }]}>
                    <Text style={s.typeIcon}>{t.icon}</Text>
                    <Text style={[s.typeLabel, noticeType === t.id && { color: t.color }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </FadeIn>

          {/* Recipients */}
          <FadeIn delay={80}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Recipients</Text>
              {loading ? <ActivityIndicator color={ACCENT_LIGHT} /> : RECIPIENTS.map((r, i) => (
                <TouchableOpacity key={r.id} onPress={() => setRecipient(r.id)} activeOpacity={0.75}
                  style={[s.recipRow, i > 0 && s.borderTop]}>
                  <View style={[s.radio, recipient === r.id && s.radioActive]} />
                  <Text style={[s.recipLabel, recipient === r.id && { color: WHITE }]}>{r.label}</Text>
                  {r.count !== null && (
                    <View style={[s.countBadge, recipient === r.id && s.countBadgeActive]}>
                      <Text style={[s.countTxt, recipient === r.id && { color: ACCENT_LIGHT }]}>{r.count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {recipient === "custom" && (
                <View style={{ marginTop: 12 }}>
                  {tenants.length === 0 ? <Text style={{ color: WHITE_40 }}>No active tenants available.</Text> : tenants.map((t, i) => {
                    const id = t.tenant!._id;
                    return <TouchableOpacity key={id} onPress={() => toggleTenant(id)} activeOpacity={0.75}
                      style={[s.tenantRow, i > 0 && s.borderTop, selected.includes(id) && s.tenantActive]}>
                      <View style={[s.checkbox, selected.includes(id) && s.checkboxActive]}>
                        {selected.includes(id) && <Text style={s.checkMark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tenantName, selected.includes(id) && { color: WHITE }]}>{t.tenant?.fullName ?? "Tenant"}</Text>
                        <Text style={s.tenantUnit}>{t.property?.name ?? "Property"}</Text>
                      </View>
                    </TouchableOpacity>;
                  })}
                </View>
              )}
            </View>
          </FadeIn>

          {/* Compose */}
          <FadeIn delay={160}>
            <View style={[s.card, { borderColor: `${currentType.color}35` }]}>
              <View style={s.composeHead}>
                <View style={[s.typeBadge, { backgroundColor: currentType.bg }]}>
                  <Text>{currentType.icon}</Text>
                  <Text style={[s.typeBadgeTxt, { color: currentType.color }]}>{currentType.label}</Text>
                </View>
                <Text style={s.cardTitle}>Compose</Text>
              </View>
              <Text style={s.fieldLabel}>Subject</Text>
              <TextInput
                style={[s.subInput, subFocused && s.inputFocused]}
                placeholder="Notice subject…" placeholderTextColor="rgba(255,255,255,0.25)"
                value={subject} onChangeText={setSubject}
                onFocus={() => setSubFocused(true)} onBlur={() => setSubFocused(false)}
              />
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Message</Text>
              <TextInput
                style={[s.bodyInput, bodyFocused && s.inputFocused]}
                placeholder="Write your notice here…" placeholderTextColor="rgba(255,255,255,0.25)"
                value={body} onChangeText={setBody} multiline
                onFocus={() => setBodyFocused(true)} onBlur={() => setBodyFocused(false)}
              />
              <Text style={s.charCount}>{body.length} characters</Text>
            </View>
          </FadeIn>

          {/* Preview */}
          {(subject.length > 0 || body.length > 0) && (
            <FadeIn delay={220}>
              <View style={s.previewCard}>
                <Text style={s.previewHeading}>📋 Preview</Text>
                <Text style={s.previewTo}>
                  To: {RECIPIENTS.find(r => r.id === recipient)?.label}
                  {recipient === "custom" ? ` (${selected.length} selected)` : ` (${tenants.length} active tenants)`}
                </Text>
                <Text style={s.previewSubject}>{subject || "(No subject)"}</Text>
                <Text style={s.previewBody} numberOfLines={4}>{body || "(No body)"}</Text>
              </View>
            </FadeIn>
          )}

          {/* Send */}
          <FadeIn delay={280}>
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: currentType.color }, (sending || sent || !subject.trim() || !body.trim() || (recipient === "custom" ? selected.length === 0 : tenants.length === 0)) && { opacity: 0.6 }]}
              onPress={handleSend} activeOpacity={0.85}
              disabled={sending || sent || !subject.trim() || !body.trim() || (recipient === "custom" ? selected.length === 0 : tenants.length === 0)}
            >
              <Text style={s.sendTxt}>{sent ? "Published ✓" : sending ? "Publishing…" : "Publish Notice  →"}</Text>
            </TouchableOpacity>
            {sendError ? <Text style={{ color: DANGER, textAlign: "center" }}>{sendError}</Text> : null}
          </FadeIn>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BRAND_BLUE },
  header:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 24, color: WHITE, lineHeight: 28 },
  hCenter: { alignItems: "center" },
  hTitle:  { fontSize: 16, fontWeight: "700", color: WHITE },
  hSub:    { fontSize: 11, color: WHITE_40, marginTop: 1 },
  body:    { flex: 1 },
  content: { padding: 16, gap: 14 },
  card:    { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle:  { fontSize: 14, fontWeight: "700", color: WHITE, letterSpacing: 0.2 },
  typeGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  typeCard:   { width: "31%", flexGrow: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05, gap: 6 },
  typeIcon:   { fontSize: 22 },
  typeLabel:  { fontSize: 11, fontWeight: "600", color: WHITE_40, textAlign: "center" },
  borderTop:  { borderTopWidth: 1, borderTopColor: WHITE_08 },
  recipRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  recipLabel: { flex: 1, fontSize: 13, fontWeight: "500", color: WHITE_72 },
  radio:      { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: WHITE_40 },
  radioActive:{ borderColor: ACCENT_LIGHT, backgroundColor: ACCENT_LIGHT },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: WHITE_05 },
  countBadgeActive: { backgroundColor: `${ACCENT_LIGHT}20` },
  countTxt:   { fontSize: 11, fontWeight: "700", color: WHITE_40 },
  tenantRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderRadius: 8 },
  tenantActive: { backgroundColor: `${ACCENT_LIGHT}10` },
  tenantName: { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 1 },
  tenantUnit: { fontSize: 11, color: WHITE_40 },
  checkbox:   { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: WHITE_15, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: ACCENT_LIGHT, borderColor: ACCENT_LIGHT },
  checkMark:  { fontSize: 11, color: WHITE, fontWeight: "800" },
  composeHead:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  typeBadge:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeTxt: { fontSize: 12, fontWeight: "700" },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  subInput:   { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: WHITE },
  bodyInput:  { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: WHITE_72, minHeight: 140, textAlignVertical: "top", lineHeight: 20 },
  inputFocused: { borderColor: ACCENT_LIGHT },
  charCount:  { fontSize: 10, color: WHITE_40, textAlign: "right", marginTop: 6 },
  previewCard:{ backgroundColor: WHITE_05, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: WHITE_08 },
  previewHeading: { fontSize: 12, fontWeight: "700", color: WHITE_40, marginBottom: 8, letterSpacing: 0.5 },
  previewTo:  { fontSize: 11, color: ACCENT_LIGHT, marginBottom: 4 },
  previewSubject: { fontSize: 13, fontWeight: "700", color: WHITE, marginBottom: 6 },
  previewBody:{ fontSize: 12, color: WHITE_72, lineHeight: 18 },
  sendBtn:    { borderRadius: 16, height: 54, alignItems: "center", justifyContent: "center" },
  sendTxt:    { fontSize: 15, fontWeight: "800", color: WHITE, letterSpacing: 0.3 },
});
