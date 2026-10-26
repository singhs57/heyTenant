import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
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
const PURPLE       = "#8B5CF6";
const WHITE        = "#FFFFFF";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

const CATEGORIES = [
  { id: "all",       label: "All"          },
  { id: "legal",     label: "Legal"        },
  { id: "receipts",  label: "Receipts"     },
  { id: "safety",    label: "Safety"       },
  { id: "inventory", label: "Inventory"    },
] as const;
type CatId = typeof CATEGORIES[number]["id"];

type DocumentRecord = {
  _id: string;
  name: string;
  category: CatId;
  size: number;
  mimeType: string;
  createdAt: string;
};
const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  legal: { icon: "📄", color: ACCENT_LIGHT },
  receipts: { icon: "🧾", color: TEAL },
  safety: { icon: "🔒", color: SUCCESS },
  inventory: { icon: "🏠", color: PURPLE },
  other: { icon: "📎", color: WHITE_72 },
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(16);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

function statusBg(s: string | null) {
  if (!s) return null;
  if (s === "Current" || s === "Valid" || s === "Protected" || s === "B Rated") return SUCCESS_BG;
  if (s === "Action needed") return WARNING_BG;
  return null;
}
function statusTxtColor(s: string | null) {
  if (!s) return WHITE_40;
  if (s === "Current" || s === "Valid" || s === "Protected" || s === "B Rated") return SUCCESS;
  if (s === "Action needed") return WARNING;
  if (s === "Late") return DANGER;
  return WHITE_40;
}

export default function Documents() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);
  const [activeCat, setActiveCat] = useState<CatId>("all");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const filtered = activeCat === "all" ? documents : documents.filter(d => d.category === activeCat);
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/renter/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not load documents.");
      setDocuments(json?.data ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadDocuments(); });

  const downloadDocument = async (document: DocumentRecord) => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      if (!FileSystem.cacheDirectory) throw new Error("Local download storage is unavailable.");
      const localUri = `${FileSystem.cacheDirectory}${document._id}-${encodeURIComponent(document.name)}`;
      const result = await FileSystem.downloadAsync(
        `${API_URL}/api/renter/documents/${document._id}/file`,
        localUri,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result.status < 200 || result.status >= 300) throw new Error("Could not download document.");
      if (!(await Sharing.isAvailableAsync())) throw new Error("Document sharing is unavailable on this device.");
      await Sharing.shareAsync(result.uri, { mimeType: document.mimeType });
    } catch (error) {
      Alert.alert("Document unavailable", error instanceof Error ? error.message : "Could not download document.");
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
        <View style={s.hCenter}><Text style={s.hTitle}>Documents</Text><Text style={s.hSub}>{filtered.length} files</Text></View>
        <View style={{ width: 38 }} />
      </Animated.View>

      {/* Category filter */}
      <Animated.View style={[s.filterBar, hStyle]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterInner}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c.id} onPress={() => setActiveCat(c.id)} activeOpacity={0.75}
              style={[s.filterChip, activeCat === c.id && s.filterChipActive]}>
              <Text style={[s.filterTxt, activeCat === c.id && s.filterTxtActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadDocuments(); }} tintColor={ACCENT_LIGHT} />}>

        {/* Action needed banner */}
        {activeCat === "all" && (
          <FadeIn delay={60}>
            <View style={s.storageCard}>
              <Text style={s.storageTitle}>Shared documents</Text>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
                {CATEGORIES.filter(c => c.id !== "all").map(({ id, label }) => (
                  <View key={id} style={{ alignItems: "center", gap: 3 }}>
                    <Text style={{ fontSize: 16 }}>{CATEGORY_STYLE[id].icon}</Text>
                    <Text style={{ fontSize: 10, color: WHITE_40 }}>{documents.filter(doc => doc.category === id).length} files</Text>
                    <Text style={{ fontSize: 9, color: WHITE_40 }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeIn>
        )}

        {/* Document list */}
        <FadeIn delay={activeCat === "all" ? 120 : 0}>
          <View style={s.card}>
            <Text style={s.cardTitle}>{activeCat === "all" ? "All Documents" : CATEGORIES.find(c => c.id === activeCat)?.label} ({filtered.length})</Text>
            {loadError ? <Text style={{ color: DANGER, textAlign: "center", paddingVertical: 16 }}>{loadError}</Text> : loading ? (
              <ActivityIndicator color={ACCENT_LIGHT} />
            ) : filtered.length === 0 ? (
              <Text style={{ color: WHITE_40, fontSize: 13, textAlign: "center", paddingVertical: 20 }}>No documents yet</Text>
            ) : filtered.map((doc, i) => (
              <TouchableOpacity key={doc._id} style={[s.docRow, i > 0 && s.bt]} activeOpacity={0.75}>
            <View style={[s.docIconBox, { backgroundColor: `${CATEGORY_STYLE[doc.category]?.color ?? WHITE_72}18` }]}>
              <Text style={{ fontSize: 22 }}>{CATEGORY_STYLE[doc.category]?.icon ?? "📎"}</Text>
            </View>
            <View style={s.docBody}>
              <Text style={s.docName} numberOfLines={1}>{doc.name}</Text>
              <Text style={s.docMeta}>{new Date(doc.createdAt).toLocaleDateString("en-IN")} · {formatSize(doc.size)}</Text>
              <Text style={s.docMeta}>{CATEGORIES.find(category => category.id === doc.category)?.label ?? "Other"}</Text>
            </View>
            <View style={s.docActions}>
              <TouchableOpacity style={s.docActionBtn} onPress={() => { void downloadDocument(doc); }} activeOpacity={0.7}><Text style={{ fontSize: 16 }}>⬇️</Text></TouchableOpacity>
            </View>
              </TouchableOpacity>
            ))}
          </View>
        </FadeIn>

        {/* Request document */}
        <FadeIn delay={activeCat === "all" ? 180 : 80}>
          <TouchableOpacity style={s.requestDocBtn} activeOpacity={0.8} onPress={() => router.push("/renter/contact-ll")}>
            <Text style={{ fontSize: 18 }}>📤</Text>
            <Text style={s.requestDocTxt}>Request a Document from Landlord</Text>
          </TouchableOpacity>
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
  filterBar: { backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  filterInner: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: WHITE_05, borderWidth: 1, borderColor: WHITE_15 },
  filterChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  filterTxt: { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  filterTxtActive: { color: WHITE, fontWeight: "700" },
  body: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 14, letterSpacing: 0.2 },
  bt: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  actionBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: WARNING_BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${WARNING}30` },
  actionBannerTitle: { fontSize: 13, fontWeight: "700", color: WARNING, marginBottom: 3 },
  actionBannerBody: { fontSize: 12, color: WHITE_72 },
  actionBannerBtn: { backgroundColor: WARNING, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  actionBannerBtnTxt: { fontSize: 12, fontWeight: "700", color: WHITE },
  storageCard: { backgroundColor: WHITE_08, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  storageTitle: { fontSize: 13, fontWeight: "600", color: WHITE_72 },
  storageSub: { fontSize: 12, color: WHITE_40 },
  storageTrack: { height: 6, backgroundColor: WHITE_05, borderRadius: 3, overflow: "hidden" },
  storageFill: { height: 6, backgroundColor: TEAL, borderRadius: 3 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  docIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  docBody: { flex: 1 },
  docName: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 3 },
  docMeta: { fontSize: 11, color: WHITE_40, marginBottom: 4 },
  docStatusBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  docStatusTxt: { fontSize: 10, fontWeight: "700" },
  docActions: { flexDirection: "row", gap: 6 },
  docActionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: WHITE_05, alignItems: "center", justifyContent: "center" },
  requestDocBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: WHITE_08, borderRadius: 16, height: 52, borderWidth: 1, borderColor: WHITE_15 },
  requestDocTxt: { fontSize: 14, fontWeight: "600", color: WHITE_72 },
});
