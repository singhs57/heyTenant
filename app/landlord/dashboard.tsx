import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Clipboard,
  Modal,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useUser, useAuth, useClerk } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import type { LandlordDashboardData } from "../../types/landlordDashboard";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BRAND_BLUE = "#1A3C5E";
const BRAND_DEEP = "#122B44";
const ACCENT = "#3B6FA8";
const ACCENT_LIGHT = "#4A90D9";
const SUCCESS = "#22C55E";
const SUCCESS_BG = "rgba(34,197,94,0.12)";
const WARNING = "#F59E0B";
const WARNING_BG = "rgba(245,158,11,0.12)";
const DANGER = "#F87171";
const DANGER_BG = "rgba(248,113,113,0.12)";
const PURPLE = "#8B5CF6";
const WHITE = "#FFFFFF";
const WHITE_90 = "rgba(255,255,255,0.90)";
const WHITE_72 = "rgba(255,255,255,0.72)";
const WHITE_40 = "rgba(255,255,255,0.40)";
const WHITE_20 = "rgba(255,255,255,0.20)";
const WHITE_15 = "rgba(255,255,255,0.15)";
const WHITE_08 = "rgba(255,255,255,0.08)";
const WHITE_05 = "rgba(255,255,255,0.05)";

// ─── Static data ──────────────────────────────────────────────────────────────
const QUICK_STATS = [
  { label: "Properties", icon: "\uD83C\uDFE2", color: ACCENT_LIGHT, bg: "rgba(74,144,217,0.15)" },
  { label: "Tenants", icon: "\uD83D\uDC65", color: SUCCESS, bg: SUCCESS_BG },
  { label: "Maintenance", icon: "\uD83D\uDD27", color: WARNING, bg: WARNING_BG },
  { label: "Vacancies", icon: "\uD83D\uDEAA", color: DANGER, bg: DANGER_BG },
];

function priorityColor(p: string) {
  if (p === "High") return DANGER;
  if (p === "Medium") return WARNING;
  return SUCCESS;
}
function statusColor(s: string) {
  if (s === "Open") return DANGER;
  if (s === "In Progress") return WARNING;
  return ACCENT_LIGHT;
}

// ─── FadeIn wrapper ───────────────────────────────────────────────────────────
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 450 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value, transform: [{ translateY: translateY.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action && <Text style={sh.action}>{action}</Text>}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 15, fontWeight: "700", color: WHITE, letterSpacing: 0.2 },
  action: { fontSize: 12, fontWeight: "600", color: ACCENT_LIGHT },
});

// ─── Occupancy bar chart ──────────────────────────────────────────────────────
function OccupancyChart({
  totalRooms,
  occupiedRooms,
}: {
  totalRooms: number;
  occupiedRooms: number;
}) {
  const vacantRooms = totalRooms - occupiedRooms;
  const occupiedPercentage = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;
  const vacantPercentage = totalRooms > 0 ? 100 - occupiedPercentage : 0;

  return (
    <View>
      {totalRooms === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyTxt}>Add properties to see occupancy.</Text>
        </View>
      ) : <>
        <View style={s.occupancyTrack}>
          {occupiedRooms > 0 && <View style={[s.occupancyOccupied, { width: `${occupiedPercentage}%` }]} />}
          {vacantRooms > 0 && <View style={[s.occupancyVacant, { width: `${vacantPercentage}%` }]} />}
        </View>
        <View style={s.occupancyLegend}>
          <View style={s.occupancyLegendItem}>
            <View style={[s.occupancyDot, { backgroundColor: ACCENT_LIGHT }]} />
            <Text style={s.occupancyLegendText}>Occupied</Text>
            <Text style={s.occupancyLegendValue}>{occupiedRooms}</Text>
          </View>
          <View style={s.occupancyLegendItem}>
            <View style={[s.occupancyDot, { backgroundColor: DANGER }]} />
            <Text style={s.occupancyLegendText}>Vacant</Text>
            <Text style={s.occupancyLegendValue}>{vacantRooms}</Text>
          </View>
        </View>
        <Text style={s.occupancyCaption}>
          {Math.round(occupiedPercentage)}% of {totalRooms} rooms currently occupied
        </Text>
      </>}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Inline Mini Calendar ─────────────────────────────────────────────────────
const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function MiniCalendar({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const initYear = parsed?.getFullYear() ?? today.getFullYear();
  const initMonth = parsed?.getMonth() ?? today.getMonth();

  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [open, setOpen] = useState(false);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const select = (day: number) => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${year}-${mm}-${dd}`);
    setOpen(false);
  };

  const selDay = parsed && parsed.getFullYear() === year && parsed.getMonth() === month ? parsed.getDate() : null;
  const todayDay = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null;

  const WHITE = "#FFFFFF";
  const WHITE_40 = "rgba(255,255,255,0.40)";
  const WHITE_15 = "rgba(255,255,255,0.15)";
  const WHITE_08 = "rgba(255,255,255,0.08)";
  const WHITE_05 = "rgba(255,255,255,0.05)";
  const ACCENT = "#3B6FA8";
  const ACCENT_LIGHT = "#4A90D9";
  const SUCCESS = "#22C55E";

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.72)", marginBottom: 6, letterSpacing: 0.3 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
        style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, borderWidth: 1, borderColor: open ? ACCENT_LIGHT : WHITE_15, paddingHorizontal: 12, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text style={{ fontSize: 14, color: value ? WHITE : "rgba(255,255,255,0.25)" }}>
          {value || "Select date"}
        </Text>
        <Text style={{ fontSize: 14, color: WHITE_40 }}>📅</Text>
      </TouchableOpacity>

      {open && (
        <View style={{ backgroundColor: "#122B44", borderRadius: 14, borderWidth: 1, borderColor: WHITE_15, marginTop: 6, padding: 12, overflow: "hidden" }}>
          {/* Month / year navigation */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <TouchableOpacity onPress={prevMonth} style={{ padding: 6 }} activeOpacity={0.7}>
              <Text style={{ color: WHITE, fontSize: 18, fontWeight: "700" }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ color: WHITE, fontWeight: "700", fontSize: 14 }}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={{ padding: 6 }} activeOpacity={0.7}>
              <Text style={{ color: WHITE, fontSize: 18, fontWeight: "700" }}>›</Text>
            </TouchableOpacity>
          </View>
          {/* Day headers */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {DAYS_SHORT.map(d => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: WHITE_40 }}>{d}</Text>
              </View>
            ))}
          </View>
          {/* Day grid */}
          {Array.from({ length: cells.length / 7 }).map((_, row) => (
            <View key={row} style={{ flexDirection: "row", marginBottom: 2 }}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                const isSel = day !== null && day === selDay;
                const isToday = day !== null && day === todayDay;
                return (
                  <TouchableOpacity
                    key={col}
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8,
                      backgroundColor: isSel ? ACCENT_LIGHT : isToday ? "rgba(74,144,217,0.15)" : "transparent"
                    }}
                    onPress={() => day !== null && select(day)}
                    activeOpacity={day !== null ? 0.7 : 1}
                    disabled={day === null}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: isSel ? "800" : "400",
                      color: isSel ? WHITE : isToday ? ACCENT_LIGHT : day !== null ? "rgba(255,255,255,0.85)" : "transparent"
                    }}>
                      {day ?? ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type TenantRecord = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  property?: { name: string; addressLine1: string; city: string; roomNumber?: string };
  tenant?: { fullName: string; email: string; landlordCode: string };
};

type PropertyRecord = {
  _id: string;
  name: string;
  addressLine1: string;
  city: string;
  postcode: string;
  propertyType: string;
  furnishing: string;
  bedrooms: number;
  bathrooms?: number;
  monthlyRent: number;
  depositAmount?: number;
  status: "VACANT" | "OCCUPIED";
  amenities?: string[];
  description?: string;
  roomNumber?: number;
};

type RenterRecord = {
  _id: string;
  fullName: string;
  email: string;
  landlordCode: string;
};

export default function LandlordDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const handleSignOut = async () => {
    await signOut();
    router.replace("/welcome");
  };
  const [activeTab, setActiveTab] = useState<"overview" | "properties" | "tenants" | "finance">("overview");
  const [dashboard, setDashboard] = useState<LandlordDashboardData | null>(null);
  const [landlordCodeCopied, setLandlordCodeCopied] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState("");

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const token = await getToken();
      if (!token) { setDashboardError("Not authenticated."); return; }
      const res = await fetch(`${API_URL}/api/landlord/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDashboardError(json?.error?.message ?? "Failed to load portfolio data.");
        return;
      }
      setDashboard(json?.data ?? null);
    } catch {
      setDashboardError("Network error — is the server running?");
    } finally {
      setDashboardLoading(false);
    }
  }, [getToken]);

  const confirmRentPayment = async (paymentId: string) => {
    setConfirmingPaymentId(paymentId);
    setPaymentActionError("");
    try {
      const token = await getToken();
      if (!token) {
        setPaymentActionError("Not authenticated.");
        return;
      }
      const response = await fetch(`${API_URL}/api/landlord/payments/${paymentId}/confirm`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setPaymentActionError(json?.error?.message ?? "Could not confirm this payment.");
        return;
      }
      await fetchDashboard();
    } catch {
      setPaymentActionError("Network error — is the server running?");
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  // ── Tenants state ──────────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantsError, setTenantsError] = useState("");

  const fetchTenants = useCallback(async () => {
    setTenantsLoading(true);
    setTenantsError("");
    try {
      const token = await getToken();
      if (!token) { setTenantsError("Not authenticated."); return; }
      const res = await fetch(`${API_URL}/api/landlord/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setTenantsError(json?.error?.message ?? "Failed to load tenants.");
        return;
      }
      setTenants(json?.data ?? []);
    } catch {
      setTenantsError("Network error — is the server running?");
    } finally {
      setTenantsLoading(false);
    }
  }, [getToken]);

  // ── Properties state ───────────────────────────────────────────────────────
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  const [propsError, setPropsError] = useState("");

  const fetchProperties = useCallback(async () => {
    setPropsLoading(true);
    setPropsError("");
    try {
      const token = await getToken();
      if (!token) { setPropsError("Not authenticated."); return; }
      const res = await fetch(`${API_URL}/api/landlord/properties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setPropsError(json?.error?.message ?? "Failed to load properties."); return; }
      setProperties(json?.data ?? []);
      setPropertiesLoaded(true);
    } catch {
      setPropsError("Network error — is the server running?");
    } finally {
      setPropsLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => {
    void Promise.all([fetchProperties(), fetchDashboard(), fetchTenants()]);
  });

  // ── Allocate modal state ───────────────────────────────────────────────────
  const [allocateTarget, setAllocateTarget] = useState<PropertyRecord | null>(null);
  const [allocRenterId, setAllocRenterId] = useState("");
  const [allocLeaseStart, setAllocLeaseStart] = useState("");
  const [allocLeaseEnd, setAllocLeaseEnd] = useState("");
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [allocError, setAllocError] = useState("");

  // Build unique renter list for the allocate picker from all tenants data
  const renterPickerList: RenterRecord[] = tenants
    .map(t => {
      if (t.tenant) {
        return { _id: String((t.tenant as any)?._id ?? t._id), fullName: t.tenant.fullName, email: t.tenant.email, landlordCode: t.tenant.landlordCode };
      }
      return null;
    })
    .filter((r): r is RenterRecord => r !== null)
    .filter((r, i, arr) => arr.findIndex(x => x._id === r._id) === i); // dedup

  const openAllocateModal = (prop: PropertyRecord) => {
    setAllocateTarget(prop);
    setAllocRenterId("");
    setAllocLeaseStart("");
    setAllocLeaseEnd("");
    setAllocError("");
  };

  const handleAllocate = async () => {
    if (!allocateTarget) return;
    if (!allocRenterId) { setAllocError("Please select a renter."); return; }
    if (!allocLeaseStart) { setAllocError("Lease start date is required (YYYY-MM-DD)."); return; }
    if (!allocLeaseEnd) { setAllocError("Lease end date is required (YYYY-MM-DD)."); return; }
    setAllocSubmitting(true);
    setAllocError("");
    try {
      const token = await getToken();
      if (!token) { setAllocError("Not authenticated."); setAllocSubmitting(false); return; }
      const res = await fetch(`${API_URL}/api/landlord/properties/${allocateTarget._id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ renterId: allocRenterId, leaseStart: allocLeaseStart, leaseEnd: allocLeaseEnd }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setAllocError(json?.error?.message ?? "Failed to allocate property.");
        setAllocSubmitting(false);
        return;
      }
      // Refresh both lists
      setAllocateTarget(null);
      await Promise.all([fetchProperties(), fetchTenants()]);
    } catch {
      setAllocError("Network error — is the server running?");
      setAllocSubmitting(false);
    }
  };

  const displayName = user?.fullName ?? user?.username ?? "there";
  const initials = user?.fullName ? getInitials(user.fullName) : (user?.username?.slice(0, 2).toUpperCase() ?? "?");
  const totalRooms = properties.length;
  const occupiedRooms = properties.filter((property) => property.status === "OCCUPIED").length;
  const occupancyPercentage = totalRooms > 0
    ? Math.round((occupiedRooms / totalRooms) * 100)
    : 0;

  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(-16);
  useEffect(() => {
    headerOpacity.value = withTiming(1, { duration: 400 });
    headerTranslateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, []);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value, transform: [{ translateY: headerTranslateY.value }],
  }));

  const paddingTop = Platform.OS === "android"
    ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32)
    : Math.max(insets.top + 8, 32);

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "properties", label: "Properties" },
    { id: "tenants", label: "Tenants" },
    { id: "finance", label: "Finance" },
  ] as const;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <Animated.View style={[s.header, { paddingTop }, headerStyle]}>
        <TouchableOpacity style={s.hLeft} onPress={() => router.push("/landlord/profile")} activeOpacity={0.8}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
          <View>
            <Text style={s.greeting}>{getGreeting()}</Text>
            <Text style={s.userName}>{displayName}</Text>
          </View>
        </TouchableOpacity>
        <View style={s.hRight}>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnTxt}>{"\uD83D\uDD14"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnTxt}>{"\u2699\uFE0F"}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Tab bar */}
      <Animated.View style={[s.tabBar, headerStyle]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabInner}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[s.tab, activeTab === t.id && s.tabActive]}
              onPress={() => setActiveTab(t.id)}
              activeOpacity={0.75}
            >
              <Text style={[s.tabTxt, activeTab === t.id && s.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Body */}
      <ScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl
          refreshing={dashboardLoading}
          onRefresh={() => { void Promise.all([fetchProperties(), fetchDashboard(), fetchTenants()]); }}
          tintColor={ACCENT_LIGHT}
        />}
      >

        {/* ── Tenants tab ──────────────────────────────────────────────────── */}
        {activeTab === "tenants" && (
          <>
            <FadeIn delay={0}>
              <View style={s.card}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>Registered Tenants</Text>
                  <TouchableOpacity onPress={fetchTenants} activeOpacity={0.7}>
                    <Text style={[s.cardTitle, { color: ACCENT_LIGHT }]}>↻ Refresh</Text>
                  </TouchableOpacity>
                </View>

                {tenantsLoading && (
                  <View style={s.emptyState}>
                    <ActivityIndicator color={ACCENT_LIGHT} />
                  </View>
                )}

                {!tenantsLoading && tenantsError !== "" && (
                  <View style={s.emptyState}>
                    <Text style={[s.emptyTxt, { color: DANGER }]}>{tenantsError}</Text>
                  </View>
                )}

                {!tenantsLoading && tenantsError === "" && tenants.length === 0 && (
                  <View style={s.emptyState}>
                    <Text style={s.emptyTxt}>No tenants registered yet.</Text>
                    <Text style={[s.emptyTxt, { marginTop: 4, fontSize: 11 }]}>
                      Share your landlord code so renters can register.
                    </Text>
                  </View>
                )}

                {!tenantsLoading && tenants.map((lease, idx) => {
                  const name = lease.tenant?.fullName
                    ?? `${lease.firstName} ${lease.lastName}`;
                  const email = lease.tenant?.email ?? lease.email;
                  const code = lease.tenant?.landlordCode ?? "—";
                  const prop = lease.property?.name ?? "—";
                  const start = lease.leaseStart
                    ? new Date(lease.leaseStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                  const end = lease.leaseEnd
                    ? new Date(lease.leaseEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                  const isLast = idx === tenants.length - 1;

                  return (
                    <View key={lease._id} style={[s.tenantItem, !isLast && s.borderTop]}>
                      <View style={s.tenantAvatar}>
                        <Text style={s.tenantAvatarTxt}>
                          {name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </Text>
                      </View>
                      <View style={s.tenantBody}>
                        <Text style={s.tenantName}>{name}</Text>
                        <Text style={s.tenantMeta}>{email}</Text>
                        <Text style={s.tenantMeta}>
                          Property: {prop}{lease.property?.roomNumber ? ` · Room No. ${lease.property.roomNumber}` : ""}
                        </Text>
                        <View style={s.tenantRow}>
                          <View style={[s.pill, { backgroundColor: "rgba(74,144,217,0.15)" }]}>
                            <Text style={[s.pillTxt, { color: ACCENT_LIGHT }]}>Code: {code}</Text>
                          </View>
                          <Text style={s.tenantMeta}>{start} → {end}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </FadeIn>

            {/* Sign out */}
            <FadeIn delay={80}>
              <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.75}>
                <Text style={s.signOutTxt}>Sign Out</Text>
              </TouchableOpacity>
            </FadeIn>
          </>
        )}

        {/* ── Properties tab ───────────────────────────────────────────────── */}
        {activeTab === "properties" && (
          <>
            <FadeIn delay={0}>
              <View style={s.card}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>My Properties</Text>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity onPress={fetchProperties} activeOpacity={0.7}>
                      <Text style={[s.cardTitle, { color: ACCENT_LIGHT }]}>↻</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push("/landlord/add-property")} activeOpacity={0.7}>
                      <Text style={[s.cardTitle, { color: SUCCESS }]}>+ Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {!propertiesLoaded && propsLoading && (
                  <View style={s.emptyState}><ActivityIndicator color={ACCENT_LIGHT} /></View>
                )}
                {!propsLoading && propsError !== "" && (
                  <View style={s.emptyState}>
                    <Text style={[s.emptyTxt, { color: DANGER }]}>{propsError}</Text>
                  </View>
                )}
                {propertiesLoaded && propsError === "" && properties.length === 0 && (
                  <View style={s.emptyState}>
                    <Text style={s.emptyTxt}>No properties yet.</Text>
                    <TouchableOpacity onPress={() => router.push("/landlord/add-property")} activeOpacity={0.7} style={{ marginTop: 10 }}>
                      <Text style={{ color: ACCENT_LIGHT, fontSize: 13, fontWeight: "600" }}>+ Add your first property</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {propertiesLoaded && properties.map((prop, idx) => {
                  const isLast = idx === properties.length - 1;
                  const isVacant = prop.status === "VACANT";
                  return (
                    <View key={prop._id} style={[s.propItem, !isLast && s.propDivider]}>
                      <View style={s.propTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.propName}>{prop.name}</Text>
                          {prop?.roomNumber ? (
                            <Text style={[s.propAddr, { color: ACCENT_LIGHT, fontWeight: "bold" }]}>Room No- {prop?.roomNumber}</Text>
                          ) : null}
                          <Text style={s.propAddr}>{prop.addressLine1}, {prop.city} {prop.postcode}</Text>
                          <Text style={s.propMeta}>{prop.propertyType} · {prop.bedrooms} BHK · {prop.furnishing.replace("_", " ")}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: isVacant ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)" }]}>
                          <Text style={[s.statusTxt, { color: isVacant ? SUCCESS : DANGER }]}>{prop.status}</Text>
                        </View>
                      </View>
                      <View style={s.propBottom}>
                        <Text style={s.propRent}>₹{prop.monthlyRent.toLocaleString("en-IN")}/mo</Text>
                        {prop.depositAmount ? (
                          <Text style={s.propDeposit}>Deposit ₹{prop.depositAmount.toLocaleString("en-IN")}</Text>
                        ) : null}
                        {isVacant && (
                          <TouchableOpacity
                            style={s.allocBtn}
                            onPress={() => openAllocateModal(prop)}
                            activeOpacity={0.75}
                          >
                            <Text style={s.allocBtnTxt}>Allocate to Renter</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.75}>
                <Text style={s.signOutTxt}>Sign Out</Text>
              </TouchableOpacity>
            </FadeIn>
          </>
        )}

        {/* ── Overview / default tabs ───────────────────────────────────────── */}
        {activeTab !== "tenants" && activeTab !== "properties" && (
          <>
            {dashboard?.landlordCode && (
              <FadeIn delay={0}>
                <View style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>Your Renter Invite Code</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const code = dashboard?.landlordCode;
                        if (!code) return;
                        Clipboard.setString(code);
                        setLandlordCodeCopied(true);
                        setTimeout(() => setLandlordCodeCopied(false), 2000);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.cardTitle, { color: ACCENT_LIGHT }]}>
                        {landlordCodeCopied ? "Copied" : "Copy"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.bigVal, { letterSpacing: 5, marginTop: 8 }]}>
                    {dashboard.landlordCode}
                  </Text>
                  <Text style={s.cardSub}>Share this code with renters to link their accounts.</Text>
                </View>
              </FadeIn>
            )}

            {/* KPI row */}
            <FadeIn delay={0}>
              <View style={s.kpiRow}>
                {QUICK_STATS.map((stat) => {
                  const value =
                    dashboardLoading && !dashboard ? "…" :
                    stat.label === "Tenants" ? String(dashboard?.metrics?.activeTenantCount ?? 0) :
                    stat.label === "Properties" ? String(dashboard?.metrics?.propertyCount ?? 0) :
                    stat.label === "Vacancies" ? String(dashboard?.metrics?.vacantProperties ?? 0) :
                    String(dashboard?.metrics?.openMaintenanceCount ?? 0);
                  return (
                    <View key={stat.label} style={[s.kpiCard, { backgroundColor: stat.bg }]}>
                      <Text style={s.kpiIcon}>{stat.icon}</Text>
                      <Text style={[s.kpiVal, { color: stat.color }]}>{value}</Text>
                      <Text style={s.kpiLbl}>{stat.label}</Text>
                    </View>
                  );
                })}
              </View>
            </FadeIn>

            {/* Revenue + Occupancy */}
            <FadeIn delay={80}>
              <View style={s.twoCol}>
                <View style={[s.card, s.half]}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>Revenue</Text>
                  </View>
                  <Text style={s.bigVal}>
                    {dashboardError && !dashboard ? "—" : `₹${(dashboard?.metrics?.monthlyRevenue ?? 0).toLocaleString("en-IN")}`}
                  </Text>
                  <Text style={s.cardSub}>{dashboardError || "Collected this month"}</Text>
                </View>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Occupancy</Text>
                  <Text style={[s.bigVal, { marginTop: 8 }]}>
                    {dashboardLoading && !dashboard ? "…" : dashboardError && !dashboard ? "—" : `${dashboard?.metrics?.occupancyPercentage ?? occupancyPercentage}%`}
                  </Text>
                  <Text style={s.cardSub}>
                    {dashboardError && !dashboard
                      ? dashboardError
                      : `${dashboard?.metrics?.occupiedProperties ?? occupiedRooms} of ${dashboard?.metrics?.propertyCount ?? totalRooms} properties occupied`}
                  </Text>
                </View>
              </View>
            </FadeIn>

            {/* Occupancy trend */}
            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="Live Occupancy" action="Current" />
                {dashboard
                  ? <OccupancyChart totalRooms={totalRooms} occupiedRooms={occupiedRooms} />
                  : <View style={s.emptyState}>
                      <ActivityIndicator color={ACCENT_LIGHT} />
                    </View>}
              </View>
            </FadeIn>

            {/* Rent collection */}
            <FadeIn delay={220}>
              <View style={s.card}>
                <SectionHeader title="Rent Collection" />
                <View style={s.rentRow}>
                  <View style={s.rentStat}>
                    <Text style={[s.rentVal, { color: SUCCESS }]}>₹{(dashboard?.metrics?.rentCollection?.collected ?? 0).toLocaleString("en-IN")}</Text>
                    <Text style={s.rentLbl}>Collected</Text>
                  </View>
                  <View style={s.rentDiv} />
                  <View style={s.rentStat}>
                    <Text style={[s.rentVal, { color: WARNING }]}>₹{(dashboard?.metrics?.rentCollection?.pending ?? 0).toLocaleString("en-IN")}</Text>
                    <Text style={s.rentLbl}>Pending</Text>
                  </View>
                  <View style={s.rentDiv} />
                  <View style={s.rentStat}>
                    <Text style={[s.rentVal, { color: DANGER }]}>₹{(dashboard?.metrics?.rentCollection?.overdue ?? 0).toLocaleString("en-IN")}</Text>
                    <Text style={s.rentLbl}>Overdue</Text>
                  </View>
                </View>
                <View style={s.progTrack}>
                  <View style={[s.progFill, {
                    width: `${dashboard?.metrics?.rentCollection?.expected
                      ? Math.min(100, Math.round((dashboard.metrics.rentCollection.collected / dashboard.metrics.rentCollection.expected) * 100))
                      : 0}%`,
                    backgroundColor: SUCCESS,
                  }]} />
                </View>
                <Text style={s.progLbl}>
                  {dashboardError || `${dashboard?.metrics?.rentCollection?.expected
                    ? Math.min(100, Math.round((dashboard.metrics.rentCollection.collected / dashboard.metrics.rentCollection.expected) * 100))
                    : 0}% of expected monthly rent collected`}
                </Text>
              </View>
            </FadeIn>

            {/* Maintenance */}
            <FadeIn delay={280}>
              <View style={s.card}>
                <SectionHeader title="Maintenance Requests" action="View all" />
                {dashboardLoading && !dashboard ? <ActivityIndicator color={ACCENT_LIGHT} /> :
                  dashboardError && !dashboard ? <Text style={[s.emptyTxt, { color: DANGER }]}>{dashboardError}</Text> :
                  (dashboard?.maintenanceRequests ?? []).filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS").length === 0
                    ? <View style={s.emptyState}><Text style={s.emptyTxt}>No open maintenance requests.</Text></View>
                    : (dashboard?.maintenanceRequests ?? [])
                      .filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS")
                      .slice(0, 3)
                      .map((item) => (
                        <View key={item._id} style={s.tenantItem}>
                          <Text style={s.tenantName}>{item.title}</Text>
                          <Text style={s.tenantMeta}>{item.status.replace("_", " ")} · {item.priority}</Text>
                        </View>
                      ))}
              </View>
            </FadeIn>

            {/* Activity feed */}
            <FadeIn delay={340}>
              <View style={s.card}>
                <SectionHeader title="Pending Rent Payments" />
                {paymentActionError ? <Text style={[s.emptyTxt, { color: DANGER, marginBottom: 10 }]}>{paymentActionError}</Text> : null}
                {(dashboard?.payments ?? []).filter((item) => item.status === "PENDING" && item.rentSubmission).length === 0 ? (
                  <Text style={s.emptyTxt}>No pending rent confirmations.</Text>
                ) : (dashboard?.payments ?? [])
                  .filter((item) => item.status === "PENDING" && item.rentSubmission)
                  .slice(0, 5)
                  .map((item) => (
                    <View key={item._id} style={[s.tenantItem, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.tenantName}>
                          {typeof item.tenant === "object" ? item.tenant?.fullName ?? "Renter" : "Renter"}
                        </Text>
                        <Text style={s.tenantMeta}>
                          ₹{Number(item.amount).toLocaleString("en-IN")} · {item.period ?? "Rent"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: SUCCESS, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, opacity: confirmingPaymentId ? 0.6 : 1 }}
                        onPress={() => { void confirmRentPayment(item._id); }}
                        disabled={confirmingPaymentId !== null}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: WHITE, fontSize: 11, fontWeight: "700" }}>
                          {confirmingPaymentId === item._id ? "Saving…" : "Confirm received"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            </FadeIn>

            <FadeIn delay={345}>
              <View style={s.card}>
                <SectionHeader title="Rent Ledger" action="All months" />
                {(dashboard?.rentLedgers ?? []).length === 0 ? (
                  <Text style={s.emptyTxt}>No rent ledger available.</Text>
                ) : (dashboard?.rentLedgers ?? []).map((ledger) => (
                  <View key={ledger.lease} style={[s.tenantItem, { paddingVertical: 12 }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.tenantName}>
                          {typeof ledger.tenant === "object" ? ledger.tenant?.fullName ?? "Renter" : "Renter"}
                        </Text>
                        <Text style={s.tenantMeta}>
                          Total paid ₹{ledger.totalPaid.toLocaleString("en-IN")} · Pending overall ₹{ledger.outstanding.toLocaleString("en-IN")}
                          {ledger.awaitingConfirmation > 0
                            ? ` · Awaiting confirmation ₹${ledger.awaitingConfirmation.toLocaleString("en-IN")}`
                            : ""}
                        </Text>
                      </View>
                      <Text style={[s.tenantMeta, { color: ledger.outstanding > 0 ? WARNING : SUCCESS }]}>
                        {ledger.status}
                      </Text>
                    </View>
                    {ledger.periods.map((month) => (
                      <View key={`${ledger.lease}-${month.period}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                        <Text style={[s.tenantMeta, { flex: 1 }]}>{month.period}</Text>
                        <Text style={[s.tenantMeta, { flex: 1, textAlign: "right" }]}>
                          Due ₹{(month.rentDue + month.electricityDue).toLocaleString("en-IN")}
                        </Text>
                        <Text style={[s.tenantMeta, { flex: 1, textAlign: "right", color: SUCCESS }]}>
                          Received ₹{month.paid.toLocaleString("en-IN")}
                        </Text>
                        {month.awaitingConfirmation > 0 ? (
                          <Text style={[s.tenantMeta, { flex: 1, textAlign: "right", color: WARNING }]}>
                            Pending ₹{month.awaitingConfirmation.toLocaleString("en-IN")}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={350}>
              <View style={s.card}>
                <SectionHeader title="Recent Activity" action="See all" />
                {dashboardLoading && !dashboard ? <ActivityIndicator color={ACCENT_LIGHT} /> :
                  dashboardError && !dashboard ? <Text style={[s.emptyTxt, { color: DANGER }]}>{dashboardError}</Text> :
                  (dashboard?.payments ?? []).length === 0 && (dashboard?.leases ?? []).length === 0
                    ? <View style={s.emptyState}><Text style={s.emptyTxt}>No recorded activity yet.</Text></View>
                    :                     [...(dashboard?.payments ?? []).map((item) => ({
                        id: `payment-${item._id}`,
                        title: item.status === "PAID" ? "Rent payment received" : "Rent payment submitted",
                        detail: `₹${Number(item.amount).toLocaleString("en-IN")} · ${item.period ?? "Rent"}`,
                        date: item.paidAt ?? item.createdAt,
                      })), ...(dashboard?.leases ?? []).map((item) => ({
                        id: `lease-${item._id}`,
                        title: "Active tenancy",
                        detail: `${item.firstName ?? ""} ${item.lastName ?? ""} · ${typeof item.property === "object" ? item.property?.name ?? "Property" : "Property"}`,
                        date: item.createdAt,
                      }))]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 4)
                      .map((item) => (
                        <View key={item.id} style={s.tenantItem}>
                          <Text style={s.tenantName}>{item.title}</Text>
                          <Text style={s.tenantMeta}>{item.detail} · {new Date(item.date).toLocaleDateString("en-IN")}</Text>
                        </View>
                      ))}
              </View>
            </FadeIn>

            {/* Upcoming events */}
            <FadeIn delay={410}>
              <View style={s.card}>
                <SectionHeader title="Upcoming Inspections" action="View all" />
                {(dashboard?.inspections ?? []).filter((inspection) =>
                  inspection.status !== "COMPLETED" && new Date(inspection.scheduledAt) >= new Date()
                ).length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No upcoming inspections.</Text></View>
                ) : (dashboard?.inspections ?? []).filter((inspection) =>
                  inspection.status !== "COMPLETED" && new Date(inspection.scheduledAt) >= new Date()
                ).slice(0, 3).map((inspection, index) => (
                  <View key={inspection._id} style={[s.tenantItem, index > 0 && s.borderTop]}>
                    <Text style={s.tenantName}>{inspection.type}</Text>
                    <Text style={s.tenantMeta}>
                      {typeof inspection.property === "object" ? inspection.property?.name ?? "Property" : "Property"}
                      {" · "}{new Date(inspection.scheduledAt).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            {/* Quick actions */}
            <FadeIn delay={460}>
              <View style={s.card}>
                <SectionHeader title="Quick Actions" />
                <View style={s.actionsGrid}>
                  {[
                    { label: "Add Property", color: ACCENT_LIGHT, route: "/landlord/add-property" },
                    { label: "Add Tenant", color: SUCCESS, route: "/landlord/add-tenant" },
                    { label: "Send Notice", color: WARNING, route: "/landlord/send-notice" },
                    { label: "Messages", color: ACCENT, route: "/landlord/messages" },
                    { label: "View Reports", color: PURPLE, route: "/landlord/view-reports" },
                    { label: "New Invoice", color: ACCENT_LIGHT, route: "/landlord/new-invoice" },
                    { label: "Inspections", color: DANGER, route: "/landlord/inspections" },
                    { label: "Electricity Readings", color: SUCCESS, route: "/landlord/electricity-readings" },
                  ].map((a) => (
                    <TouchableOpacity key={a.label} style={s.actionBtn} activeOpacity={0.7}
                      onPress={() => router.push(a.route as any)}>
                      <View style={[s.actionDot, { backgroundColor: `${a.color}25` }]} />
                      <Text style={s.actionLbl}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </FadeIn>

            {/* Sign out */}
            <FadeIn delay={500}>
              <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.75}>
                <Text style={s.signOutTxt}>Sign Out</Text>
              </TouchableOpacity>
            </FadeIn>
          </>
        )}

      </ScrollView>

      {/* ── Allocate to Renter Modal ─────────────────────────────────────── */}
      <Modal
        visible={allocateTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAllocateTarget(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Allocate Property</Text>
              <TouchableOpacity onPress={() => setAllocateTarget(null)} activeOpacity={0.7} style={s.modalClose}>
                <Text style={s.modalCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            {allocateTarget && (
              <Text style={s.modalSub}>
                {allocateTarget.name} · {allocateTarget.city}
              </Text>
            )}

            {/* Renter selector */}
            <Text style={s.modalLbl}>Select Renter</Text>
            {tenantsLoading ? (
              <ActivityIndicator color={ACCENT_LIGHT} style={{ marginVertical: 10 }} />
            ) : renterPickerList.length === 0 ? (
              <Text style={[s.emptyTxt, { marginBottom: 10 }]}>No registered renters yet.</Text>
            ) : (
              <ScrollView style={s.renterList} showsVerticalScrollIndicator={false}>
                {renterPickerList.map(r => (
                  <TouchableOpacity
                    key={r._id}
                    style={[s.renterItem, allocRenterId === r._id && s.renterItemActive]}
                    onPress={() => setAllocRenterId(r._id)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.renterDot, allocRenterId === r._id && s.renterDotActive]}>
                      {allocRenterId === r._id && <Text style={s.renterDotTxt}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.renterName, allocRenterId === r._id && { color: WHITE }]}>{r.fullName}</Text>
                      <Text style={s.renterEmail}>{r.email}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Date pickers */}
            <MiniCalendar label="Lease Start Date" value={allocLeaseStart} onChange={setAllocLeaseStart} />
            <MiniCalendar label="Lease End Date" value={allocLeaseEnd} onChange={setAllocLeaseEnd} />

            {allocError ? (
              <Text style={{ color: DANGER, fontSize: 12, marginBottom: 8 }}>{allocError}</Text>
            ) : null}

            <TouchableOpacity
              style={[s.modalBtn, allocSubmitting && { opacity: 0.6 }]}
              onPress={handleAllocate}
              disabled={allocSubmitting}
              activeOpacity={0.85}
            >
              <Text style={s.modalBtnTxt}>{allocSubmitting ? "Allocating…" : "Confirm Allocation"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BLUE },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  hLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: WHITE_20 },
  avatarTxt: { fontSize: 14, fontWeight: "800", color: WHITE },
  greeting: { fontSize: 11, color: WHITE_40, letterSpacing: 0.4, marginBottom: 1 },
  userName: { fontSize: 15, fontWeight: "700", color: WHITE },
  hRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  iconBtnTxt: { fontSize: 18 },
  badge: { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: DANGER, alignItems: "center", justifyContent: "center" },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: WHITE },

  tabBar: { backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  tabInner: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: WHITE_05 },
  tabActive: { backgroundColor: ACCENT },
  tabTxt: { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  tabTxtActive: { color: WHITE, fontWeight: "700" },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 14 },

  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, borderColor: WHITE_08 },
  kpiIcon: { fontSize: 20, marginBottom: 6 },
  kpiVal: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
  kpiLbl: { fontSize: 10, color: WHITE_40, letterSpacing: 0.4, textAlign: "center" },

  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  twoCol: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: WHITE_72, letterSpacing: 0.3 },
  bigVal: { fontSize: 24, fontWeight: "800", color: WHITE, marginBottom: 2 },
  cardSub: { fontSize: 11, color: WHITE_40 },
  occupancyTrack: { height: 14, flexDirection: "row", overflow: "hidden", borderRadius: 7, backgroundColor: WHITE_08, marginTop: 8 },
  occupancyOccupied: { height: "100%", backgroundColor: ACCENT_LIGHT },
  occupancyVacant: { height: "100%", backgroundColor: DANGER },
  occupancyLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  occupancyLegendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  occupancyDot: { width: 8, height: 8, borderRadius: 4 },
  occupancyLegendText: { fontSize: 12, color: WHITE_72 },
  occupancyLegendValue: { fontSize: 12, fontWeight: "700", color: WHITE },
  occupancyCaption: { fontSize: 11, color: WHITE_40, marginTop: 12, textAlign: "center" },
  pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt: { fontSize: 11, fontWeight: "700" },

  rentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginVertical: 14 },
  rentStat: { alignItems: "center", gap: 4 },
  rentVal: { fontSize: 28, fontWeight: "800" },
  rentLbl: { fontSize: 11, color: WHITE_40 },
  rentDiv: { width: 1, height: 40, backgroundColor: WHITE_15 },
  progTrack: { height: 6, backgroundColor: WHITE_08, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  progFill: { height: 6, borderRadius: 3 },
  progLbl: { fontSize: 11, color: WHITE_40, marginTop: 6, textAlign: "center" },

  emptyState: { paddingVertical: 16, alignItems: "center" as const },
  emptyTxt: { fontSize: 13, color: WHITE_40 },

  borderTop: { borderTopWidth: 1, borderTopColor: WHITE_08 },
  maintItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  maintLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  priorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  maintUnit: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  maintIssue: { fontSize: 11, color: WHITE_40 },
  maintRight: { alignItems: "flex-end", gap: 4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  daysAgo: { fontSize: 10, color: WHITE_40 },

  actItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  actBorder: { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  actIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  actIconTxt: { fontSize: 17 },
  actBody: { flex: 1 },
  actTitle: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  actDesc: { fontSize: 11, color: WHITE_40 },
  actTime: { fontSize: 10, color: WHITE_40, flexShrink: 0 },

  evItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  evBorder: { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  evDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  evTitle: { flex: 1, fontSize: 13, fontWeight: "500", color: WHITE_90 },
  evDateBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  evDate: { fontSize: 11, fontWeight: "700" },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: { width: "30%", flexGrow: 1, alignItems: "center", paddingVertical: 14, backgroundColor: WHITE_05, borderRadius: 14, borderWidth: 1, borderColor: WHITE_08 },
  actionDot: { width: 36, height: 36, borderRadius: 18, marginBottom: 8 },
  actionLbl: { fontSize: 11, fontWeight: "600", color: WHITE_72, textAlign: "center" },

  signOut: { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 16, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05 },
  signOutTxt: { fontSize: 14, fontWeight: "600", color: WHITE_40 },

  tenantItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  tenantAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tenantAvatarTxt: { fontSize: 13, fontWeight: "800", color: WHITE },
  tenantBody: { flex: 1, gap: 3 },
  tenantName: { fontSize: 14, fontWeight: "700", color: WHITE },
  tenantMeta: { fontSize: 11, color: WHITE_40 },
  tenantRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" as const },

  // ── Property list items ────────────────────────────────────────────────────
  propItem: { paddingVertical: 14 },
  propDivider: { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  propTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  propName: { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 2 },
  propAddr: { fontSize: 11, color: WHITE_40, marginBottom: 2 },
  propMeta: { fontSize: 11, color: WHITE_40 },
  propBottom: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" as const },
  propRent: { fontSize: 13, fontWeight: "700", color: SUCCESS },
  propDeposit: { fontSize: 11, color: WHITE_40 },
  allocBtn: { marginLeft: "auto" as any, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: `${ACCENT_LIGHT}22`, borderWidth: 1, borderColor: ACCENT_LIGHT },
  allocBtnTxt: { fontSize: 11, fontWeight: "700", color: ACCENT_LIGHT },

  // ── Allocate Modal ─────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#1A3C5E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.12)", maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: WHITE },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  modalCloseTxt: { fontSize: 14, color: WHITE_40 },
  modalSub: { fontSize: 12, color: WHITE_40, marginBottom: 16 },
  modalLbl: { fontSize: 11, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  modalInput: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: WHITE, marginBottom: 14 },
  modalBtn: { backgroundColor: ACCENT, borderRadius: 14, height: 50, alignItems: "center", justifyContent: "center", marginTop: 4 },
  modalBtnTxt: { fontSize: 14, fontWeight: "800", color: WHITE, letterSpacing: 0.3 },
  renterList: { maxHeight: 160, marginBottom: 4 },
  renterItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  renterItemActive: { backgroundColor: "rgba(74,144,217,0.12)", borderRadius: 8, paddingHorizontal: 8 },
  renterDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  renterDotActive: { backgroundColor: ACCENT_LIGHT, borderColor: ACCENT_LIGHT },
  renterDotTxt: { fontSize: 10, color: WHITE, fontWeight: "800" },
  renterName: { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 1 },
  renterEmail: { fontSize: 11, color: WHITE_40 },
});