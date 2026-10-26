import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
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
const ACCENT       = "#3B6FA8";
const ACCENT_LIGHT = "#4A90D9";
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

const INSPECTION_TABS = ["Scheduled", "In Progress", "Completed"] as const;
type InspTab = typeof INSPECTION_TABS[number];

type PropertyOption = { _id: string; name: string; status: string };
type InspectionRecord = {
  _id: string;
  property: { _id?: string; name?: string; addressLine1?: string; city?: string } | string;
  lease?: { firstName?: string; lastName?: string } | string | null;
  scheduledAt: string;
  inspector?: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
  type: string;
  result: string | null;
  checklistCompleted?: string[];
};

const CHECKLIST_CATEGORIES = [
  { name: "General Condition",  items: ["Walls & ceilings intact", "Floors undamaged", "Windows functional", "Doors & locks working"] },
  { name: "Kitchen",            items: ["Appliances working", "Oven & hob clean", "Cupboards intact", "Plumbing leak-free"] },
  { name: "Bathroom",           items: ["Sanitaryware intact", "Shower/bath functional", "Extractor fan working", "Sealant intact"] },
  { name: "Safety",             items: ["Smoke alarms tested", "CO detectors present", "Fire door compliant", "Electrical panel accessible"] },
  { name: "Exterior",           items: ["Garden/yard maintained", "Bins accessible", "Gutters clear", "External lighting working"] },
];

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Field({ label, placeholder, value, onChangeText }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={[f.input, focused && f.focused]}
        placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)"
        value={value} onChangeText={onChangeText}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      />
    </View>
  );
}
const f = StyleSheet.create({
  wrap:   { marginBottom: 16 },
  label:  { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  input:  { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE },
  focused:{ borderColor: ACCENT_LIGHT },
});

function statusColor(s: string) {
  if (s === "Scheduled" || s === "SCHEDULED") return ACCENT_LIGHT;
  if (s === "In Progress" || s === "IN_PROGRESS") return WARNING;
  return SUCCESS;
}
function resultColor(r: string | null) {
  if (r === "Pass") return SUCCESS;
  if (r === "Fail") return DANGER;
  return WHITE_40;
}

export default function Inspections() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [activeTab,      setActiveTab]     = useState<InspTab>("Scheduled");
  const [showSchedule,   setShowSchedule]  = useState(false);
  const [selectedProp,   setSelectedProp]  = useState<string | null>(null);
  const [inspType,       setInspType]      = useState("Routine");
  const [date,           setDate]          = useState("");
  const [time,           setTime]          = useState("");
  const [inspector,      setInspector]     = useState("");
  const [checklistOpen,  setChecklistOpen] = useState<string | null>(null);
  const [checked,        setChecked]       = useState<string[]>([]);
  const [properties,     setProperties]    = useState<PropertyOption[]>([]);
  const [inspections,    setInspections]   = useState<InspectionRecord[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [loadError,      setLoadError]     = useState("");
  const [actionError,    setActionError]   = useState("");
  const [saving,         setSaving]        = useState(false);

  const statusForTab = (tab: InspTab) => tab === "Scheduled" ? "SCHEDULED" : tab === "In Progress" ? "IN_PROGRESS" : "COMPLETED";
  const filteredInspections = inspections.filter(i => i.status === statusForTab(activeTab));

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load inspection data.");
      setProperties(json?.data?.properties ?? []);
      const inspectionResponse = await fetch(`${API_URL}/api/landlord/inspections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const inspectionJson = await inspectionResponse.json();
      if (!inspectionResponse.ok) throw new Error(inspectionJson?.error?.message ?? "Could not load inspections.");
      setInspections(inspectionJson?.data ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load inspection data.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadData(); });

  const toggleCheck = (item: string) =>
    setChecked(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);

  const totalItems = CHECKLIST_CATEGORIES.reduce((a, c) => a + c.items.length, 0);

  const scheduleInspection = async () => {
    if (!selectedProp || !date.trim() || !time.trim()) return;
    setSaving(true);
    setActionError("");
    try {
      const [day, month, year] = date.split("/").map(Number);
      const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!day || !month || !year || !match) throw new Error("Enter date as DD/MM/YYYY and time as HH:MM AM/PM.");
      let hours = Number(match[1]);
      if (match[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
      if (match[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
      const scheduledAt = new Date(year, month - 1, day, hours, Number(match[2]));
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Enter a valid inspection date and time.");
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propertyId: selectedProp, type: inspType, scheduledAt: scheduledAt.toISOString(), inspector }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not schedule inspection.");
      setShowSchedule(false);
      setDate("");
      setTime("");
      setInspector("");
      await loadData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not schedule inspection.");
    } finally {
      setSaving(false);
    }
  };

  const completeInspection = async () => {
    if (!checklistOpen || checked.length < totalItems) return;
    setSaving(true);
    setActionError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/inspections/${checklistOpen}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "COMPLETED", checklistCompleted: checked }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not update inspection.");
      setChecklistOpen(null);
      await loadData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update inspection.");
    } finally {
      setSaving(false);
    }
  };

  const startInspection = async (inspectionId: string) => {
    setSaving(true);
    setActionError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/landlord/inspections/${inspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not start inspection.");
      await loadData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start inspection.");
    } finally {
      setSaving(false);
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

      {/* Header */}
      <Animated.View style={[s.header, { paddingTop }, hStyle]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={s.hTitle}>Inspections</Text>
          <Text style={s.hSub}>Property condition tracking</Text>
        </View>
        <View style={{ width: 38 }} />
      </Animated.View>

      {/* KPI strip */}
      <Animated.View style={[s.kpiStrip, hStyle]}>
        {[
          { label: "Scheduled",    count: inspections.filter(i => i.status === "SCHEDULED").length,   color: ACCENT_LIGHT },
          { label: "In Progress",  count: inspections.filter(i => i.status === "IN_PROGRESS").length,  color: WARNING      },
          { label: "Completed",    count: inspections.filter(i => i.status === "COMPLETED").length,    color: SUCCESS      },
          { label: "Overdue",      count: inspections.filter(i => i.status !== "COMPLETED" && new Date(i.scheduledAt) < new Date()).length, color: DANGER },
        ].map((k) => (
          <View key={k.label} style={s.kpiStripItem}>
            <Text style={[s.kpiStripVal, { color: k.color }]}>{k.count}</Text>
            <Text style={s.kpiStripLbl}>{k.label}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Tab bar */}
      <Animated.View style={[s.tabBar, hStyle]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabInner}>
          {INSPECTION_TABS.map((t) => (
            <TouchableOpacity key={t} style={[s.tab, activeTab === t && s.tabActive]} onPress={() => setActiveTab(t)} activeOpacity={0.75}>
              <Text style={[s.tabTxt, activeTab === t && s.tabTxtActive]}>{t}</Text>
              <View style={[s.tabCount, activeTab === t && s.tabCountActive]}>
                <Text style={[s.tabCountTxt, activeTab === t && { color: WHITE }]}>
                  {inspections.filter(i => i.status === statusForTab(t)).length}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadData(); }} tintColor={ACCENT_LIGHT} />}>
          {loadError || actionError ? <Text style={{ color: DANGER }}>{loadError || actionError}</Text> : null}

          {/* Schedule new inspection CTA */}
          <FadeIn delay={0}>
            <TouchableOpacity style={s.scheduleBtn} onPress={() => setShowSchedule(!showSchedule)} activeOpacity={0.85}>
              <Text style={s.scheduleBtnTxt}>{showSchedule ? "✕  Cancel" : "+ Schedule New Inspection"}</Text>
            </TouchableOpacity>
          </FadeIn>

          {/* Schedule form */}
          {showSchedule && (
            <FadeIn delay={0}>
              <View style={s.card}>
                <Text style={s.cardTitle}>Schedule Inspection</Text>

                {/* Inspection type */}
                <Text style={f.label}>Type</Text>
                <View style={s.chipRow}>
                  {["Routine", "Move-in", "Pre-exit", "Emergency"].map((t) => (
                    <TouchableOpacity key={t} onPress={() => setInspType(t)} activeOpacity={0.75}
                      style={[s.chip, inspType === t && s.chipActive]}>
                      <Text style={[s.chipTxt, inspType === t && s.chipTxtActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Property */}
                <Text style={[f.label, { marginTop: 12 }]}>Property</Text>
                {properties.map((p, i) => (
                  <TouchableOpacity key={p._id} onPress={() => setSelectedProp(p._id)} activeOpacity={0.75}
                    style={[s.propRow, i > 0 && s.borderTop, selectedProp === p._id && s.propRowActive]}>
                    <View style={[s.radio, selectedProp === p._id && s.radioActive]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.propName, selectedProp === p._id && { color: WHITE }]}>{p.name}</Text>
                      <Text style={s.propSub}>{p.status === "OCCUPIED" ? "Occupied" : "Vacant"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {properties.length === 0 && <Text style={{ color: WHITE_40 }}>No properties available.</Text>}

                {/* Date / time / inspector */}
                <View style={{ marginTop: 12 }}>
                  <View style={s.twoCol}>
                    <View style={{ flex: 1 }}><Field label="Date (DD/MM/YYYY)" placeholder="22/12/2026" value={date} onChangeText={setDate} /></View>
                    <View style={{ flex: 1 }}><Field label="Time" placeholder="10:00 AM" value={time} onChangeText={setTime} /></View>
                  </View>
                  <Field label="Inspector Name" placeholder="Mike Ross" value={inspector} onChangeText={setInspector} />
                </View>

                <TouchableOpacity
                  style={[s.confirmBtn, (!selectedProp || !date || !time || saving) && { opacity: 0.5 }]}
                  onPress={() => { void scheduleInspection(); }} activeOpacity={0.85}
                  disabled={!selectedProp || !date || !time || saving}
                >
                  <Text style={s.confirmTxt}>{saving ? "Saving…" : "Confirm Inspection"}</Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          )}

          {/* Inspection list */}
          {loading ? <ActivityIndicator color={ACCENT_LIGHT} /> : filteredInspections.length === 0 ? (
            <FadeIn delay={80}>
              <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🔍</Text>
                <Text style={{ fontSize: 14, color: WHITE_40 }}>No {activeTab.toLowerCase()} inspections</Text>
              </View>
            </FadeIn>
          ) : (
            <FadeIn delay={80}>
              <View style={s.card}>
                {filteredInspections.map((insp, i) => (
                  <View key={insp._id} style={[s.inspItem, i > 0 && s.borderTop]}>
                    <View style={s.inspTop}>
                      <View style={[s.typePill, { backgroundColor: `${statusColor(insp.status)}18` }]}>
                        <Text style={[s.typePillTxt, { color: statusColor(insp.status) }]}>{insp.type} · {insp.status.replace("_", " ")}</Text>
                      </View>
                      {insp.result && (
                        <View style={[s.resultBadge, { backgroundColor: `${resultColor(insp.result)}20` }]}>
                          <Text style={[s.resultTxt, { color: resultColor(insp.result) }]}>{insp.result}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.inspProp}>{typeof insp.property === "object" ? insp.property?.name ?? "Property" : "Property"}</Text>
                    {insp.lease && typeof insp.lease === "object" ? <Text style={s.inspTenant}>{insp.lease.firstName} {insp.lease.lastName}</Text> : null}
                    <View style={s.inspMeta}>
                      <Text style={s.inspMetaTxt}>📅 {new Date(insp.scheduledAt).toLocaleString("en-IN")}</Text>
                      {insp.inspector ? <Text style={s.inspMetaTxt}>👤 {insp.inspector}</Text> : null}
                    </View>
                    {insp.status === "SCHEDULED" && (
                      <TouchableOpacity style={s.startChecklistBtn} onPress={() => { void startInspection(insp._id); }} activeOpacity={0.8} disabled={saving}>
                        <Text style={s.startChecklistTxt}>{saving ? "Updating…" : "Start Inspection"}</Text>
                      </TouchableOpacity>
                    )}
                    {insp.status === "IN_PROGRESS" && (
                      <TouchableOpacity style={s.startChecklistBtn} onPress={() => { setChecklistOpen(insp._id); setChecked(insp.checklistCompleted ?? []); }} activeOpacity={0.8}>
                        <Text style={s.startChecklistTxt}>Start Checklist</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </FadeIn>
          )}

          {/* Inline checklist when started */}
          {checklistOpen && (
            <FadeIn delay={0}>
              <View style={[s.card, { borderColor: `${WARNING}30` }]}>
                <View style={s.checklistHeader}>
                  <Text style={s.cardTitle}>Inspection Checklist</Text>
                  <TouchableOpacity onPress={() => setChecklistOpen(null)} activeOpacity={0.7}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.checklistProgress}>
                  <View style={[s.checklistBar, { width: `${Math.round((checked.length / totalItems) * 100)}%` }]} />
                </View>
                <Text style={s.checklistPct}>{checked.length}/{totalItems} items complete</Text>

                {CHECKLIST_CATEGORIES.map((cat) => (
                  <View key={cat.name} style={{ marginTop: 14 }}>
                    <Text style={s.catTitle}>{cat.name}</Text>
                    {cat.items.map((item, j) => (
                      <TouchableOpacity key={item} onPress={() => toggleCheck(item)} activeOpacity={0.7}
                        style={[s.checkItem, j > 0 && s.borderTop]}>
                        <View style={[s.checkbox, checked.includes(item) && s.checkboxDone]}>
                          {checked.includes(item) && <Text style={s.checkMark}>✓</Text>}
                        </View>
                        <Text style={[s.checkLbl, checked.includes(item) && s.checkLblDone]}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}

                <TouchableOpacity style={[s.completeBtn, checked.length < totalItems && { opacity: 0.5 }]}
                  onPress={() => { void completeInspection(); }} activeOpacity={0.85} disabled={checked.length < totalItems || saving}>
                  <Text style={s.completeTxt}>
                    {checked.length < totalItems ? `${totalItems - checked.length} items remaining` : saving ? "Saving…" : "Mark Complete  ✓"}
                  </Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          )}

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

  kpiStrip:     { flexDirection: "row", backgroundColor: BRAND_DEEP, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  kpiStripItem: { flex: 1, alignItems: "center", gap: 3 },
  kpiStripVal:  { fontSize: 18, fontWeight: "800" },
  kpiStripLbl:  { fontSize: 9, color: WHITE_40, letterSpacing: 0.3, textAlign: "center" },

  tabBar:      { backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  tabInner:    { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  tab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: WHITE_05, flexDirection: "row", alignItems: "center", gap: 6 },
  tabActive:   { backgroundColor: ACCENT },
  tabTxt:      { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  tabTxtActive:{ color: WHITE, fontWeight: "700" },
  tabCount:    { width: 18, height: 18, borderRadius: 9, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  tabCountActive: { backgroundColor: "rgba(255,255,255,0.20)" },
  tabCountTxt: { fontSize: 9, fontWeight: "800", color: WHITE_40 },

  body:    { flex: 1 },
  content: { padding: 16, gap: 14 },
  card:    { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, letterSpacing: 0.2 },
  twoCol:  { flexDirection: "row", gap: 12 },
  borderTop: { borderTopWidth: 1, borderTopColor: WHITE_08 },

  scheduleBtn:    { backgroundColor: ACCENT, borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center" },
  scheduleBtnTxt: { fontSize: 14, fontWeight: "700", color: WHITE },

  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05 },
  chipActive:  { borderColor: DANGER, backgroundColor: DANGER_BG },
  chipTxt:     { fontSize: 12, fontWeight: "600", color: WHITE_40 },
  chipTxtActive: { color: DANGER },

  propRow:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  propRowActive:{ backgroundColor: `${ACCENT_LIGHT}10`, borderRadius: 8 },
  propName:     { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 2 },
  propSub:      { fontSize: 11, color: WHITE_40 },
  radio:        { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: WHITE_40 },
  radioActive:  { borderColor: ACCENT_LIGHT, backgroundColor: ACCENT_LIGHT },

  confirmBtn:  { backgroundColor: DANGER, borderRadius: 14, height: 48, alignItems: "center", justifyContent: "center", marginTop: 12 },
  confirmTxt:  { fontSize: 14, fontWeight: "700", color: WHITE },

  inspItem:    { paddingVertical: 14 },
  inspTop:     { flexDirection: "row", gap: 8, marginBottom: 6 },
  typePill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typePillTxt: { fontSize: 10, fontWeight: "700" },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  resultTxt:   { fontSize: 10, fontWeight: "700" },
  inspProp:    { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 2 },
  inspTenant:  { fontSize: 12, color: WHITE_72, marginBottom: 6 },
  inspMeta:    { flexDirection: "row", gap: 16 },
  inspMetaTxt: { fontSize: 11, color: WHITE_40 },
  startChecklistBtn: { marginTop: 10, backgroundColor: `${WARNING}20`, borderRadius: 10, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${WARNING}30` },
  startChecklistTxt: { fontSize: 12, fontWeight: "700", color: WARNING },

  checklistHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  closeBtn:         { fontSize: 16, color: WHITE_40, padding: 4 },
  checklistProgress:{ height: 4, backgroundColor: WHITE_08, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  checklistBar:     { height: 4, backgroundColor: SUCCESS, borderRadius: 2 },
  checklistPct:     { fontSize: 11, color: WHITE_40, marginBottom: 8 },
  catTitle:         { fontSize: 12, fontWeight: "700", color: ACCENT_LIGHT, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 },
  checkItem:        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  checkbox:         { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: WHITE_15, alignItems: "center", justifyContent: "center" },
  checkboxDone:     { backgroundColor: SUCCESS, borderColor: SUCCESS },
  checkMark:        { fontSize: 11, color: WHITE, fontWeight: "800" },
  checkLbl:         { fontSize: 13, color: WHITE_72, flex: 1 },
  checkLblDone:     { color: WHITE_40, textDecorationLine: "line-through" },
  completeBtn:      { marginTop: 16, backgroundColor: SUCCESS, borderRadius: 14, height: 48, alignItems: "center", justifyContent: "center" },
  completeTxt:      { fontSize: 14, fontWeight: "700", color: WHITE },
});
