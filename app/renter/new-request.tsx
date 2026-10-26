import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, StatusBar, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";

const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const TEAL         = "#0D9488";
const TEAL_BG      = "rgba(13,148,136,0.12)";
const ACCENT_LIGHT = "#4A90D9";
const SUCCESS      = "#22C55E";
const SUCCESS_BG   = "rgba(34,197,94,0.12)";
const WARNING      = "#F59E0B";
const WARNING_BG   = "rgba(245,158,11,0.12)";
const DANGER       = "#F87171";
const DANGER_BG    = "rgba(248,113,113,0.12)";
const WHITE        = "#FFFFFF";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

const CATS = [
  { id: "plumbing",   label: "Plumbing",   icon: "🚿", color: ACCENT_LIGHT },
  { id: "electrical", label: "Electrical", icon: "⚡",  color: WARNING      },
  { id: "heating",    label: "Heating",    icon: "🔥", color: DANGER       },
  { id: "structural", label: "Structural", icon: "🏗️", color: "#A16207"   },
  { id: "appliance",  label: "Appliance",  icon: "🍳", color: TEAL         },
  { id: "pest",       label: "Pest",       icon: "🐛", color: "#7C3AED"   },
  { id: "security",   label: "Security",   icon: "🔒", color: SUCCESS      },
  { id: "other",      label: "Other",      icon: "🔧", color: WHITE_72     },
];

const PRIORITIES = [
  { id: "emergency", label: "Emergency",  desc: "Immediate risk to health or safety",  color: DANGER,       bg: DANGER_BG  },
  { id: "high",      label: "High",       desc: "Major issue, needs fast attention",    color: WARNING,      bg: WARNING_BG },
  { id: "medium",    label: "Medium",     desc: "Annoying but manageable for now",      color: ACCENT_LIGHT, bg: "rgba(74,144,217,0.12)" },
  { id: "low",       label: "Low",        desc: "Minor or cosmetic, non-urgent",        color: SUCCESS,      bg: SUCCESS_BG },
];

const OPEN_REQUESTS: { id: string; issue: string; color: string }[] = [];

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 430 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 430, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

export default function NewRequest() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [cat,  setCat]  = useState<string | null>(null);
  const [prio, setPrio] = useState("medium");
  const [title, setTitle] = useState("");
  const [desc,  setDesc]  = useState("");
  const [loc,   setLoc]   = useState("");
  const [access, setAccess] = useState("anytime");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [tf, setTF] = useState(false); const [df, setDF] = useState(false); const [lf, setLF] = useState(false);

  const cp = PRIORITIES.find(p => p.id === prio)!;

  const [submitRef, setSubmitRef] = useState<string | null>(null);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!cat)          e.cat   = "Please select a category.";
    if (!title.trim()) e.title = "Please describe the issue briefly.";
    if (!desc.trim())  e.desc  = "Please provide more detail.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { api, TokenStore } = await import("../../constants/api");
      const token = await TokenStore.getAccess();
      if (!token) { router.replace("/login"); return; }
      const res = await api.post("/api/renter/maintenance", {
        category:    cat,
        priority:    prio.toUpperCase(),
        title:       title.trim(),
        description: desc.trim(),
        location:    loc.trim() || undefined,
        accessNote:  access !== "anytime" ? access : undefined,
      });
      if (!res.success) {
        setErrors({ desc: res.error?.message ?? "Submission failed." });
        return;
      }
      // Use the reference returned by the backend if available
      const ref = (res.data as any)?.reference ?? `MR-${Math.floor(1000 + Math.random() * 9000)}`;
      setSubmitRef(ref);
      setDone(true);
    } catch {
      setErrors({ desc: "Network error — is the server running?" });
    } finally {
      setBusy(false);
    }
  };

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => { hOp.value = withTiming(1, { duration: 350 }); hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }); }, []);
  const hStyle = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));

  if (done) return (
    <View style={[s.root, { justifyContent: "center", alignItems: "center", padding: 24 }]}>
      <StatusBar barStyle="light-content" />
      <View style={s.succCard}>
        <View style={s.succIcon}><Text style={{ fontSize: 36 }}>✓</Text></View>
        <Text style={s.succTitle}>Request Submitted</Text>
        <Text style={[s.succRef, { color: TEAL }]}>Ref #{submitRef}</Text>
        <Text style={s.succBody}>Your request has been received. You'll be notified once a technician is assigned.</Text>
        <View style={s.succMeta}>
          {[["Issue", title, null], ["Priority", cp.label, cp.color], ["Category", CATS.find(c => c.id === cat)?.label ?? "", null]].map(([l, v, c]) => (
            <View key={l as string} style={s.succRow}><Text style={s.succLbl}>{l}</Text><Text style={[s.succVal, c ? { color: c as string } : {}]}>{v}</Text></View>
          ))}
        </View>
        <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} activeOpacity={0.85}><Text style={s.doneTxt}>Back to Dashboard</Text></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop: pt }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={s.hCenter}><Text style={s.hTitle}>New Request</Text><Text style={s.hSub}>Maintenance request</Text></View>
        <View style={{ width: 38 }} />
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <FadeIn delay={0}>
            <View style={s.openStrip}>
              <Text style={s.openLabel}>YOUR OPEN REQUESTS</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {OPEN_REQUESTS.length === 0 ? (
                  <Text style={{ color: WHITE_40, fontSize: 12 }}>No open requests</Text>
                ) : OPEN_REQUESTS.map(r => (
                  <View key={r.id} style={[s.openBadge, { borderColor: `${r.color}30`, backgroundColor: `${r.color}12` }]}>
                    <View style={[s.openDot, { backgroundColor: r.color }]} />
                    <Text style={[s.openTxt, { color: r.color }]} numberOfLines={1}>{r.issue}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>

          <FadeIn delay={70}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Category</Text>
              {errors.cat ? <Text style={s.errTxt}>{errors.cat}</Text> : null}
              <View style={s.catGrid}>
                {CATS.map(c => (
                  <TouchableOpacity key={c.id} onPress={() => setCat(c.id)} activeOpacity={0.75}
                    style={[s.catCard, cat === c.id && { borderColor: c.color, backgroundColor: `${c.color}18` }]}>
                    <Text style={{ fontSize: 22 }}>{c.icon}</Text>
                    <Text style={[s.catLbl, cat === c.id && { color: c.color }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </FadeIn>

          <FadeIn delay={140}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Priority Level</Text>
              {PRIORITIES.map((p, i) => (
                <TouchableOpacity key={p.id} onPress={() => setPrio(p.id)} activeOpacity={0.75}
                  style={[s.prioRow, i > 0 && s.bt, prio === p.id && { backgroundColor: p.bg, borderRadius: 10, marginHorizontal: -4, paddingHorizontal: 4 }]}>
                  <View style={[s.prioDot, { backgroundColor: p.color }]} />
                  <View style={{ flex: 1 }}><Text style={[s.prioLabel, prio === p.id && { color: p.color }]}>{p.label}</Text><Text style={s.prioDesc}>{p.desc}</Text></View>
                  <View style={[s.radio, prio === p.id && { borderColor: p.color, backgroundColor: p.color }]} />
                </TouchableOpacity>
              ))}
            </View>
          </FadeIn>

          <FadeIn delay={210}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Issue Details</Text>
              <Text style={s.fieldLbl}>Brief Title</Text>
              <TextInput style={[s.input, tf && s.inputF, errors.title && s.inputE]} placeholder="e.g. Kitchen tap dripping constantly" placeholderTextColor="rgba(255,255,255,0.25)" value={title} onChangeText={setTitle} onFocus={() => setTF(true)} onBlur={() => setTF(false)} />
              {errors.title ? <Text style={s.errTxt}>{errors.title}</Text> : null}
              <Text style={[s.fieldLbl, { marginTop: 12 }]}>Full Description</Text>
              <TextInput style={[s.input, s.textArea, df && s.inputF, errors.desc && s.inputE]} placeholder="Describe the problem — how long, how severe, any safety concerns…" placeholderTextColor="rgba(255,255,255,0.25)" value={desc} onChangeText={setDesc} multiline onFocus={() => setDF(true)} onBlur={() => setDF(false)} />
              {errors.desc ? <Text style={s.errTxt}>{errors.desc}</Text> : null}
              <Text style={[s.fieldLbl, { marginTop: 12 }]}>Location in Property</Text>
              <TextInput style={[s.input, lf && s.inputF]} placeholder="e.g. Main bathroom, second floor" placeholderTextColor="rgba(255,255,255,0.25)" value={loc} onChangeText={setLoc} onFocus={() => setLF(true)} onBlur={() => setLF(false)} />
            </View>
          </FadeIn>

          <FadeIn delay={280}>
            <View style={s.card}>
              <Text style={s.cardTitle}>Property Access</Text>
              {[{ id: "anytime", l: "Any time", s: "Contractor may enter with 24h notice" }, { id: "arranged", l: "Arranged visit", s: "I need to be present" }, { id: "weekend", l: "Weekends only", s: "Mon–Fri unavailable" }].map((a, i) => (
                <TouchableOpacity key={a.id} onPress={() => setAccess(a.id)} activeOpacity={0.75} style={[s.accessRow, i > 0 && s.bt]}>
                  <View style={[s.radio, access === a.id && s.radioTeal]} />
                  <View style={{ flex: 1 }}><Text style={[s.accessLbl, access === a.id && { color: WHITE }]}>{a.l}</Text><Text style={s.accessSub}>{a.s}</Text></View>
                </TouchableOpacity>
              ))}
            </View>
          </FadeIn>

          <FadeIn delay={340}>
            <View style={[s.card, { borderColor: `${TEAL}30` }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}><Text style={{ fontSize: 18 }}>💡</Text><Text style={s.cardTitle}>Tips for faster resolution</Text></View>
              {["Attach photos when possible — speeds up diagnosis.", "Emergency issues (gas, flooding) — call 999 first.", "Heating failures Nov–Mar: we aim to respond in 4 hours."].map((t, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 6 }}><Text style={{ color: TEAL, fontWeight: "700", fontSize: 13 }}>•</Text><Text style={{ color: WHITE_72, fontSize: 12, flex: 1, lineHeight: 18 }}>{t}</Text></View>
              ))}
            </View>
          </FadeIn>

          <FadeIn delay={390}>
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: cp.id === "emergency" ? DANGER : TEAL }, (busy || !cat || !title.trim()) && { opacity: 0.55 }]} onPress={submit} activeOpacity={0.85} disabled={busy || !cat || !title.trim()}>
              <Text style={s.submitTxt}>{busy ? "Submitting…" : "Submit Request"}</Text>
            </TouchableOpacity>
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
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 14, letterSpacing: 0.2 },
  bt: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  errTxt: { fontSize: 11, color: DANGER, marginBottom: 8 },
  openStrip: { backgroundColor: WHITE_08, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: WHITE_15 },
  openLabel: { fontSize: 10, fontWeight: "700", color: WHITE_40, letterSpacing: 1, textTransform: "uppercase" },
  openBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openTxt: { fontSize: 11, fontWeight: "600" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catCard: { width: "23%", flexGrow: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05, gap: 5 },
  catLbl: { fontSize: 10, fontWeight: "600", color: WHITE_40, textAlign: "center" },
  prioRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  prioDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  prioLabel: { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 2 },
  prioDesc: { fontSize: 11, color: WHITE_40 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: WHITE_40 },
  radioTeal: { borderColor: TEAL, backgroundColor: TEAL },
  fieldLbl: { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  input: { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE },
  textArea: { minHeight: 100, textAlignVertical: "top", lineHeight: 20 },
  inputF: { borderColor: TEAL },
  inputE: { borderColor: DANGER },
  accessRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  accessLbl: { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 2 },
  accessSub: { fontSize: 11, color: WHITE_40 },
  submitBtn: { borderRadius: 16, height: 54, alignItems: "center", justifyContent: "center" },
  submitTxt: { fontSize: 15, fontWeight: "800", color: WHITE, letterSpacing: 0.3 },
  succCard: { width: "100%", backgroundColor: WHITE_08, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: WHITE_15, alignItems: "center" },
  succIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: TEAL_BG, borderWidth: 2, borderColor: TEAL, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  succTitle: { fontSize: 22, fontWeight: "800", color: WHITE, marginBottom: 4 },
  succRef: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  succBody: { fontSize: 12, color: WHITE_72, textAlign: "center", lineHeight: 18, marginBottom: 20 },
  succMeta: { width: "100%", backgroundColor: WHITE_05, borderRadius: 12, padding: 14 },
  succRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  succLbl: { fontSize: 12, color: WHITE_40 },
  succVal: { fontSize: 12, fontWeight: "600", color: WHITE },
  doneBtn: { marginTop: 20, backgroundColor: TEAL, borderRadius: 14, height: 50, width: "100%", alignItems: "center", justifyContent: "center" },
  doneTxt: { fontSize: 15, fontWeight: "800", color: WHITE },
});
