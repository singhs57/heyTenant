import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND = "#1A3C5E";
const DEEP = "#122B44";
const TEAL = "#0D9488";
const BLUE = "#4A90D9";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.55)";
const BORDER = "rgba(255,255,255,0.12)";
const CATEGORIES = ["legal", "receipts", "safety", "inventory", "other"] as const;
type Category = typeof CATEGORIES[number];
type TenantRecord = { status?: string; tenant?: { _id: string; fullName?: string }; property?: { name?: string } };
type DocumentRecord = { _id: string; name: string; category: Category; size: number; mimeType: string; createdAt: string; tenant?: { fullName?: string } };

export default function LandlordDocuments() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [category, setCategory] = useState<Category>("legal");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const headers = { Authorization: `Bearer ${token}` };
      const [tenantResponse, documentResponse] = await Promise.all([
        fetch(`${API_URL}/api/landlord/tenants`, { headers }),
        fetch(`${API_URL}/api/landlord/documents`, { headers }),
      ]);
      const [tenantJson, documentJson] = await Promise.all([tenantResponse.json(), documentResponse.json()]);
      if (!tenantResponse.ok || !documentResponse.ok) {
        throw new Error(tenantJson?.error?.message ?? documentJson?.error?.message ?? "Could not load documents.");
      }
      setTenants((tenantJson?.data ?? []).filter((tenant: TenantRecord) => tenant.status === "ACTIVE" && tenant.tenant?._id));
      setDocuments(documentJson?.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void loadData(); });

  const upload = async () => {
    if (!selectedTenant) {
      Alert.alert("Choose a tenant", "Select an active tenant before uploading a document.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 10 * 1024 * 1024) throw new Error("Documents must be 10 MB or smaller.");
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      setUploading(true);
      setError("");
      const fileResponse = await fetch(asset.uri);
      if (!fileResponse.ok) throw new Error("Could not read the selected file.");
      const extension = asset.name.split(".").pop()?.toLowerCase();
      const mimeType = asset.mimeType ?? ({
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
      const file = new Blob([await fileResponse.arrayBuffer()], { type: mimeType });
      const form = new FormData();
      form.append("file", file, asset.name);
      form.append("tenantId", selectedTenant);
      form.append("category", category);
      const response = await fetch(`${API_URL}/api/landlord/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not upload document.");
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload document.");
    } finally {
      setUploading(false);
    }
  };

  const download = async (document: DocumentRecord) => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      if (!FileSystem.cacheDirectory) throw new Error("Local download storage is unavailable.");
      const result = await FileSystem.downloadAsync(
        `${API_URL}/api/landlord/documents/${document._id}/file`,
        `${FileSystem.cacheDirectory}${document._id}-${encodeURIComponent(document.name)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (result.status < 200 || result.status >= 300) throw new Error("Could not download document.");
      if (!(await Sharing.isAvailableAsync())) throw new Error("Document sharing is unavailable on this device.");
      await Sharing.shareAsync(result.uri, { mimeType: document.mimeType });
    } catch (downloadError) {
      Alert.alert("Document unavailable", downloadError instanceof Error ? downloadError.message : "Could not download document.");
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { paddingTop: Math.max(insets.top + 8, Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 8 : 32) }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={s.title}>Shared Documents</Text>
          <Text style={s.subtitle}>Upload documents for active tenants</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView
        style={s.body}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void loadData(); }} tintColor={BLUE} />}
      >
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.card}>
          <Text style={s.section}>Upload a document</Text>
          <Text style={s.label}>Tenant</Text>
          {tenants.length === 0 ? (
            <Text style={s.muted}>No active tenants found.</Text>
          ) : tenants.map((tenant) => {
            const id = tenant.tenant!._id;
            return (
              <TouchableOpacity key={id} onPress={() => setSelectedTenant(id)} style={[s.row, selectedTenant === id && s.selected]}>
                <View style={[s.radio, selectedTenant === id && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{tenant.tenant?.fullName ?? "Tenant"}</Text>
                  <Text style={s.muted}>{tenant.property?.name ?? "Property"}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={[s.label, { marginTop: 14 }]}>Category</Text>
          <View style={s.chips}>
            {CATEGORIES.map((item) => (
              <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[s.chip, category === item && s.chipOn]}>
                <Text style={[s.chipText, category === item && { color: WHITE }]}>{item[0].toUpperCase() + item.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => { void upload(); }} disabled={uploading || loading || tenants.length === 0} style={[s.button, (uploading || loading || tenants.length === 0) && { opacity: 0.55 }]}>
            {uploading ? <ActivityIndicator color={WHITE} /> : <Text style={s.buttonText}>Choose File and Upload</Text>}
          </TouchableOpacity>
          <Text style={s.muted}>PDF, JPEG, PNG, WebP, or Word document · 10 MB maximum</Text>
        </View>
        <View style={s.card}>
          <Text style={s.section}>Uploaded documents ({documents.length})</Text>
          {loading && documents.length === 0 ? <ActivityIndicator color={BLUE} /> : documents.length === 0 ? (
            <Text style={s.muted}>No documents have been uploaded.</Text>
          ) : documents.map((document) => (
            <TouchableOpacity key={document._id} onPress={() => { void download(document); }} style={s.documentRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{document.name}</Text>
                <Text style={s.muted}>{document.tenant?.fullName ?? "Tenant"} · {document.category} · {new Date(document.createdAt).toLocaleDateString("en-IN")} · {Math.ceil(document.size / 1024)} KB</Text>
              </View>
              <Text style={s.download}>Download</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  section: { fontSize: 15, color: WHITE, fontWeight: "700", marginBottom: 14 },
  label: { color: MUTED, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  selected: { backgroundColor: "rgba(13,148,136,0.15)" },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: MUTED },
  radioOn: { backgroundColor: TEAL, borderColor: TEAL },
  itemTitle: { color: WHITE, fontSize: 13, fontWeight: "600" },
  muted: { color: MUTED, fontSize: 11, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: BORDER },
  chipOn: { backgroundColor: TEAL, borderColor: TEAL },
  chipText: { color: MUTED, fontSize: 11 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  buttonText: { color: WHITE, fontWeight: "700", fontSize: 14 },
  error: { color: "#F87171", fontSize: 13 },
  documentRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: BORDER },
  download: { color: BLUE, fontSize: 12, fontWeight: "700" },
});
