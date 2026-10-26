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
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";
import {
  formatIndiaDate,
  getFollowingRentDueDate,
  getIndiaBillingPeriod,
  getIndiaCalendarDaysUntil,
  getIndiaRentDueDate,
  getRentSchedule,
} from "../../lib/rentSchedule";

// ─── Palette ──────────────────────────────────────────────────────────────────
const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const ACCENT       = "#3B6FA8";
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
const WHITE_20     = "rgba(255,255,255,0.20)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

// ─── Static data ──────────────────────────────────────────────────────────────
const KPI_CARDS = [
  { label: "Rent Due", icon: "🏷️", color: WARNING, bg: WARNING_BG },
  { label: "Days Left", icon: "📅", color: ACCENT_LIGHT, bg: "rgba(74,144,217,0.15)" },
  { label: "Open Tickets", icon: "🔧", color: DANGER, bg: DANGER_BG },
  { label: "Payments", icon: "💳", color: TEAL, bg: TEAL_BG },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s: string) {
  if (s === "PAID" || s === "RESOLVED" || s === "CLOSED") return SUCCESS;
  if (s === "IN_PROGRESS" || s === "PENDING") return WARNING;
  if (s === "LATE" || s === "OPEN") return DANGER;
  return ACCENT_LIGHT;
}
function priorityColor(p: string) {
  if (p === "High")   return DANGER;
  if (p === "HIGH") return DANGER;
  if (p === "Medium" || p === "MEDIUM") return WARNING;
  return SUCCESS;
}

// ─── FadeIn wrapper ───────────────────────────────────────────────────────────
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(16);
  useEffect(() => {
    opacity.value    = withDelay(delay, withTiming(1, { duration: 450 }));
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
  row:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title:  { fontSize: 15, fontWeight: "700", color: WHITE, letterSpacing: 0.2 },
  action: { fontSize: 12, fontWeight: "600", color: ACCENT_LIGHT },
});

// ─── Rent countdown ring ──────────────────────────────────────────────────────
function RentCountdown({ daysLeft, total }: { daysLeft: number; total: number }) {
  const pct = Math.round(((total - daysLeft) / total) * 100);
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[rc.ring, { borderColor: WARNING }]}>
        <View style={[rc.inner, { borderColor: WHITE_08 }]}>
          <Text style={rc.days}>{daysLeft}</Text>
          <Text style={rc.label}>days left</Text>
        </View>
      </View>
      <View style={rc.legend}>
        <View style={rc.legendItem}>
          <View style={[rc.dot, { backgroundColor: WARNING }]} />
          <Text style={rc.legendTxt}>Cycle {pct}% elapsed</Text>
        </View>
      </View>
    </View>
  );
}
const rc = StyleSheet.create({
  ring:       { width: 96, height: 96, borderRadius: 48, borderWidth: 10, alignItems: "center", justifyContent: "center" },
  inner:      { width: 74, height: 74, borderRadius: 37, borderWidth: 10, alignItems: "center", justifyContent: "center" },
  days:       { fontSize: 20, fontWeight: "800", color: WHITE, lineHeight: 24 },
  label:      { fontSize: 8, color: WHITE_40, letterSpacing: 0.5, textTransform: "uppercase" },
  legend:     { marginTop: 10, gap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  legendTxt:  { fontSize: 11, color: WHITE_72 },
});

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

type LeaseRecord = {
  _id: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  status: string;
  depositAmount?: number;
  landlord?: { fullName?: string; email?: string };
  property?: {
    _id: string;
    name: string;
    addressLine1: string;
    city: string;
    postcode: string;
    propertyType: string;
    furnishing: string;
    bedrooms: number;
    bathrooms?: number;
    roomNumber?: string;
    amenities?: string[];
    description?: string;
  };
};

type PaymentRecord = {
  _id: string;
  amount: number;
  status: "PAID" | "PENDING" | "LATE";
  period?: string;
  paidAt?: string;
  createdAt: string;
  reference?: string;
};

type MaintenanceRecord = {
  _id: string;
  title: string;
  priority: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
};
type NoticeRecord = { _id: string; subject: string; body: string; type: string; readAt?: string | null; createdAt: string };
type InspectionRecord = { _id: string; type: string; scheduledAt: string; status: string; property?: { name?: string }; };
type DocumentRecord = { _id: string; name: string; category: string; createdAt: string; };
type MessageRecord = { _id: string; subject?: string; body: string; senderRole: "LANDLORD" | "RENTER"; createdAt: string; sender?: { fullName?: string }; };
type InvoiceRecord = { _id: string; invoiceNumber: string; type: string; amount: number; dueDate: string; status: string; notes?: string; createdAt: string };

export default function RenterDashboard() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const { user }  = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const handleSignOut = async () => {
    await signOut();
    router.replace("/welcome");
  };
  const [activeTab, setActiveTab] = useState<"home" | "payments" | "maintenance" | "messages">("home");

  // ── Active lease ──────────────────────────────────────────────────────────
  const [lease,        setLease]        = useState<LeaseRecord | null>(null);
  const [leaseLoading, setLeaseLoading] = useState(true);
  const [leaseError,   setLeaseError]   = useState("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRecord[]>([]);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [activityError, setActivityError] = useState("");

  const fetchLease = useCallback(async () => {
    setLeaseLoading(true);
    setLeaseError("");
    try {
      const token = await getToken();
      if (!token) { setLeaseLoading(false); return; }
      const res = await fetch(`${API_URL}/api/renter/lease`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) { setLease(null); setLeaseLoading(false); return; }
      const json = await res.json().catch(() => null);
      if (!res.ok) { setLeaseError(json?.error?.message ?? "Failed to load lease."); setLeaseLoading(false); return; }
      setLease(json?.data ?? null);
    } catch {
      setLeaseError("Network error.");
    } finally {
      setLeaseLoading(false);
    }
  }, [getToken]);

  const fetchActivity = useCallback(async () => {
    setActivityError("");
    try {
      const token = await getToken();
      if (!token) { setActivityError("Not authenticated."); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [paymentResponse, maintenanceResponse, noticeResponse, inspectionResponse, documentResponse, messageResponse, invoiceResponse] = await Promise.all([
        fetch(`${API_URL}/api/renter/payments`, { headers }),
        fetch(`${API_URL}/api/renter/maintenance`, { headers }),
        fetch(`${API_URL}/api/renter/notices`, { headers }),
        fetch(`${API_URL}/api/renter/inspections`, { headers }),
        fetch(`${API_URL}/api/renter/documents`, { headers }),
        fetch(`${API_URL}/api/renter/messages`, { headers }),
        fetch(`${API_URL}/api/renter/invoices`, { headers }),
      ]);
      const [paymentJson, maintenanceJson, noticeJson, inspectionJson, documentJson, messageJson, invoiceJson] = await Promise.all([
        paymentResponse.json().catch(() => null),
        maintenanceResponse.json().catch(() => null),
        noticeResponse.json().catch(() => null),
        inspectionResponse.json().catch(() => null),
        documentResponse.json().catch(() => null),
        messageResponse.json().catch(() => null),
        invoiceResponse.json().catch(() => null),
      ]);
      const failedResponse = [paymentResponse, maintenanceResponse, noticeResponse, inspectionResponse, documentResponse, invoiceResponse]
        .find((response) => !response.ok);
      if (failedResponse || (!messageResponse.ok && messageResponse.status !== 404)) {
        setActivityError(paymentJson?.error?.message ?? maintenanceJson?.error?.message ?? noticeJson?.error?.message
          ?? inspectionJson?.error?.message ?? documentJson?.error?.message ?? invoiceJson?.error?.message ?? messageJson?.error?.message ?? "Failed to load renter activity.");
        return;
      }
      setPayments(paymentJson?.data ?? []);
      setMaintenanceRequests(maintenanceJson?.data ?? []);
      setNotices(noticeJson?.data ?? []);
      setInspections(inspectionJson?.data ?? []);
      setDocuments(documentJson?.data ?? []);
      setMessages(messageResponse.ok ? messageJson?.data ?? [] : []);
      setInvoices(invoiceJson?.data ?? []);
    } catch {
      setActivityError("Network error — is the server running?");
    }
  }, [getToken]);

  useStableFocusEffect(() => {
    void Promise.all([fetchLease(), fetchActivity()]);
  });

  const displayName = user?.fullName ?? user?.username ?? "there";
  const initials    = user?.fullName ? getInitials(user.fullName) : (user?.username?.slice(0, 2).toUpperCase() ?? "?");

  const headerOpacity    = useSharedValue(0);
  const headerTranslateY = useSharedValue(-16);
  useEffect(() => {
    headerOpacity.value    = withTiming(1, { duration: 400 });
    headerTranslateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, []);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value, transform: [{ translateY: headerTranslateY.value }],
  }));

  const paddingTop = Platform.OS === "android"
    ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32)
    : Math.max(insets.top + 8, 32);

  const TABS = [
    { id: "home",        label: "Home"        },
    { id: "payments",    label: "Payments"    },
    { id: "maintenance", label: "Maintenance" },
    { id: "messages",    label: "Messages"    },
  ] as const;

  const unread = notices.filter((notice) => !notice.readAt).length;
  const today = new Date();
  const rentSchedule = getRentSchedule(lease?.leaseStart, today);
  const currentPeriod = getIndiaBillingPeriod(today);
  const submittedThisPeriod = payments
    .filter((payment) => payment.status !== "LATE"
      && (payment.period ?? getIndiaBillingPeriod(new Date(payment.paidAt ?? payment.createdAt))) === currentPeriod)
    .reduce((total, payment) => total + payment.amount, 0);
  const paymentPeriod = rentSchedule.isEarlyPaymentWindowOpen
    && submittedThisPeriod >= (lease?.monthlyRent ?? Infinity)
    ? getIndiaBillingPeriod(rentSchedule.dueDate ?? today)
    : currentPeriod;
  const submittedForPaymentPeriod = paymentPeriod === currentPeriod
    ? submittedThisPeriod
    : payments
      .filter((payment) => payment.status !== "LATE"
        && (payment.period ?? getIndiaBillingPeriod(new Date(payment.paidAt ?? payment.createdAt))) === paymentPeriod)
      .reduce((total, payment) => total + payment.amount, 0);
  const amountDue = rentSchedule.isPaymentWindowOpen
    ? Math.max((lease?.monthlyRent ?? 0) - submittedForPaymentPeriod, 0)
    : 0;
  const currentDueDate = rentSchedule.isEarlyPaymentWindowOpen && paymentPeriod === currentPeriod
    ? getIndiaRentDueDate(today)
    : rentSchedule.dueDate
    && rentSchedule.isCurrentBillingMonth
    && submittedThisPeriod >= (lease?.monthlyRent ?? Infinity)
    ? getFollowingRentDueDate(rentSchedule.dueDate)
    : rentSchedule.dueDate;
  const daysUntilDue = currentDueDate ? getIndiaCalendarDaysUntil(currentDueDate, today) : 0;
  const openRequestCount = maintenanceRequests.filter((request) => request.status === "OPEN" || request.status === "IN_PROGRESS").length;
  const thisMonthPayments = payments.filter((payment) => {
    const date = new Date(payment.createdAt);
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  }).length;

  const markNoticeRead = async (noticeId: string) => {
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated.");
      const response = await fetch(`${API_URL}/api/renter/notices/${noticeId}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not update notice.");
      setNotices((items) => items.map((notice) => notice._id === noticeId ? json.data : notice));
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Could not update notice.");
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <Animated.View style={[s.header, { paddingTop }, headerStyle]}>
        <TouchableOpacity style={s.hLeft} onPress={() => router.push("/renter/profile")} activeOpacity={0.8}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
          <View>
            <Text style={s.greeting}>{getGreeting()}</Text>
            <Text style={s.userName}>{displayName}</Text>
          </View>
        </TouchableOpacity>
        <View style={s.hRight}>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnTxt}>🔔</Text>
            {unread > 0 && (
              <View style={s.notifBadge}><Text style={s.notifBadgeTxt}>{unread}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnTxt}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Tab bar ── */}
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
              {t.id === "messages" && unread > 0 && (
                <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{unread}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Body ── */}
      <ScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl
          refreshing={leaseLoading}
          onRefresh={() => { void Promise.all([fetchLease(), fetchActivity()]); }}
          tintColor={ACCENT_LIGHT}
        />}
      >

        {/* ══════════════ HOME TAB ══════════════ */}
        {activeTab === "home" && (
          <>
            {/* KPI row */}
            <FadeIn delay={0}>
              <View style={s.kpiRow}>
                {KPI_CARDS.map((k) => {
                  const value = k.label === "Rent Due"
                    ? lease ? `₹${amountDue.toLocaleString("en-IN")}` : "—"
                    : k.label === "Days Left"
                      ? lease ? String(daysUntilDue) : "—"
                      : k.label === "Open Tickets"
                        ? String(openRequestCount)
                        : String(thisMonthPayments);
                  return (
                  <View key={k.label} style={[s.kpiCard, { backgroundColor: k.bg }]}>
                    <Text style={s.kpiIcon}>{k.icon}</Text>
                    <Text style={[s.kpiVal, { color: k.color }]}>{value}</Text>
                    <Text style={s.kpiLbl}>{k.label}</Text>
                  </View>
                  );
                })}
              </View>
            </FadeIn>

            {/* Rent due banner */}
            <FadeIn delay={80}>
              {(() => {
                const rentAmt    = amountDue;
                const dueDate    = currentDueDate;
                const daysLeft   = daysUntilDue;
                const daysInMon  = dueDate
                  ? new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 0)).getUTCDate()
                  : 30;
                const canPayRent = Boolean(lease) && rentSchedule.isPaymentWindowOpen && rentAmt > 0;
                return (
                  <View style={[s.card, s.rentBanner]}>
                    <View style={s.rentBannerLeft}>
                      <Text style={s.rentBannerLabel}>NEXT RENT DUE</Text>
                      <Text style={s.rentBannerAmount}>
                        {canPayRent ? `₹${rentAmt.toLocaleString("en-IN")}` : "—"}
                      </Text>
                      <Text style={s.rentBannerDate}>
                        {lease && dueDate
                          ? rentSchedule.isPaymentWindowOpen
                            ? `${rentSchedule.isEarlyPaymentWindowOpen && paymentPeriod !== currentPeriod ? "Early payment available · " : ""}Due by ${formatIndiaDate(dueDate)}`
                            : `Opens ${formatIndiaDate(rentSchedule.paymentStartDate ?? dueDate)} · due by ${formatIndiaDate(dueDate)}`
                          : "No lease set up yet"}
                      </Text>
                      {canPayRent ? (
                        <TouchableOpacity style={s.payNowBtn} activeOpacity={0.8} onPress={() => router.push("/renter/pay-rent")}>
                          <Text style={s.payNowTxt}>Pay Now</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <View style={s.rentBannerRight}>
                      <RentCountdown daysLeft={daysLeft} total={daysInMon} />
                    </View>
                  </View>
                );
              })()}
            </FadeIn>

            {/* Property info */}
            <FadeIn delay={150}>
              <View style={s.card}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={sh.title}>My Property</Text>
                  <TouchableOpacity onPress={fetchLease} activeOpacity={0.7}>
                    <Text style={{ fontSize: 11, color: ACCENT_LIGHT, fontWeight: "600" }}>↻ Refresh</Text>
                  </TouchableOpacity>
                </View>

                {leaseLoading ? (
                  <View style={s.emptyState}><ActivityIndicator color={ACCENT_LIGHT} /></View>
                ) : leaseError !== "" ? (
                  <View style={s.emptyState}><Text style={[s.emptyTxt, { color: DANGER }]}>{leaseError}</Text></View>
                ) : !lease ? (
                  <>
                    <View style={s.propRow}>
                      <View style={s.propIconBox}><Text style={{ fontSize: 28 }}>🏢</Text></View>
                      <View style={s.propDetails}>
                        <Text style={s.propName}>No property assigned</Text>
                        <Text style={s.propAddr}>Contact your landlord to get allocated</Text>
                        <View style={s.propTagRow}>
                          <View style={[s.propTag, { backgroundColor: TEAL_BG }]}>
                            <Text style={[s.propTagTxt, { color: TEAL }]}>No Lease</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={s.leaseRow}>
                      {["Start Date", "End Date", "Monthly"].map((lbl, i) => (
                        <View key={lbl} style={{ flex: 1, alignItems: "center" }}>
                          {i > 0 && <View style={[s.leaseDiv, { position: "absolute", left: 0, top: 0, bottom: 0 }]} />}
                          <Text style={s.leaseVal}>--</Text>
                          <Text style={s.leaseLbl}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    {/* Property details block */}
                    <View style={s.propRow}>
                      <View style={s.propIconBox}>
                        <Text style={{ fontSize: 28 }}>
                          {lease.property?.propertyType === "HOUSE" ? "🏠" : lease.property?.propertyType === "STUDIO" ? "🛋️" : "🏢"}
                        </Text>
                      </View>
                      <View style={s.propDetails}>
                        <Text style={s.propName}>{lease.property?.name ?? "—"}</Text>
                        {lease.property?.roomNumber ? (
                          <Text style={[s.propAddr, { color: ACCENT_LIGHT, fontWeight: "bold" }]}>Room No- {lease.property.roomNumber}</Text>
                        ) : null}
                        <Text style={s.propAddr}>
                          {lease.property?.addressLine1 ?? ""}{lease.property?.city ? `, ${lease.property.city}` : ""}
                          {lease.property?.postcode ? ` ${lease.property.postcode}` : ""}
                        </Text>
                        <View style={s.propTagRow}>
                          <View style={[s.propTag, { backgroundColor: SUCCESS_BG }]}>
                            <Text style={[s.propTagTxt, { color: SUCCESS }]}>Active Lease</Text>
                          </View>
                          {lease.property?.propertyType ? (
                            <View style={[s.propTag, { backgroundColor: "rgba(74,144,217,0.12)" }]}>
                              <Text style={[s.propTagTxt, { color: ACCENT_LIGHT }]}>{lease.property.propertyType}</Text>
                            </View>
                          ) : null}
                          {lease.property?.bedrooms ? (
                            <View style={[s.propTag, { backgroundColor: "rgba(74,144,217,0.08)" }]}>
                              <Text style={[s.propTagTxt, { color: ACCENT_LIGHT }]}>{lease.property.bedrooms} BHK</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    {/* Furnishing / amenities */}
                    {lease.property?.furnishing ? (
                      <Text style={[s.propAddr, { marginBottom: 8 }]}>
                        {lease.property.furnishing.replace("_", " ")}
                        {lease.property.amenities && lease.property.amenities.length > 0
                          ? " · " + lease.property.amenities.slice(0, 3).join(", ")
                          : ""}
                      </Text>
                    ) : null}
                    {/* Lease stats row */}
                    <View style={s.leaseRow}>
                      <View style={s.leaseStat}>
                        <Text style={s.leaseVal}>
                          {lease.leaseStart ? new Date(lease.leaseStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "--"}
                        </Text>
                        <Text style={s.leaseLbl}>Start Date</Text>
                      </View>
                      <View style={s.leaseDiv} />
                      <View style={s.leaseStat}>
                        <Text style={[s.leaseVal, { color: WARNING }]}>
                          {lease.leaseEnd ? new Date(lease.leaseEnd).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "--"}
                        </Text>
                        <Text style={s.leaseLbl}>End Date</Text>
                      </View>
                      <View style={s.leaseDiv} />
                      <View style={s.leaseStat}>
                        <Text style={[s.leaseVal, { color: TEAL }]}>
                          {lease.monthlyRent ? `₹${lease.monthlyRent.toLocaleString("en-IN")}` : "--"}
                        </Text>
                        <Text style={s.leaseLbl}>Monthly Rent</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </FadeIn>

            {/* Notice board */}
            <FadeIn delay={220}>
              <View style={s.card}>
                <SectionHeader title="Notice Board" />
                {notices.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No notices yet</Text></View>
                ) : notices.slice(0, 3).map((n, i) => (
                  <TouchableOpacity key={n._id} onPress={() => { if (!n.readAt) void markNoticeRead(n._id); }} style={[s.noticeItem, i > 0 && s.borderTop]} activeOpacity={0.8}>
                    <View style={[s.noticeIconBox, { backgroundColor: n.readAt ? "rgba(74,144,217,0.12)" : WARNING_BG }]}>
                      <Text style={{ fontSize: 16 }}>{n.readAt ? "ℹ️" : "⚠️"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.noticeTitle}>{n.subject}</Text>
                      <Text style={s.noticeBody}>{n.body}</Text>
                      <Text style={s.noticeBody}>{new Date(n.createdAt).toLocaleDateString("en-IN")}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>

            {/* Upcoming events */}
            <FadeIn delay={290}>
              <View style={s.card}>
                <SectionHeader title="Upcoming Events" action="Calendar" />
                {inspections.filter((event) => event.status !== "COMPLETED" && new Date(event.scheduledAt) >= today).length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No upcoming events</Text></View>
                ) : inspections.filter((event) => event.status !== "COMPLETED" && new Date(event.scheduledAt) >= today).map((ev, i, events) => (
                  <View key={ev._id} style={[s.evItem, i < events.length - 1 && s.evBorder]}>
                    <View style={[s.evDot, { backgroundColor: ACCENT_LIGHT }]} />
                    <Text style={s.evTitle}>{ev.type}{ev.property?.name ? ` · ${ev.property.name}` : ""}</Text>
                    <View style={[s.evDateBadge, { backgroundColor: `${ACCENT_LIGHT}20` }]}>
                      <Text style={[s.evDate, { color: ACCENT_LIGHT }]}>{new Date(ev.scheduledAt).toLocaleDateString("en-IN")}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </FadeIn>

            {/* Quick actions */}
            <FadeIn delay={360}>
              <View style={s.card}>
                <SectionHeader title="Quick Actions" />
                <View style={s.actionsGrid}>
                  {[
                    { label: "Pay Rent",    color: WARNING,      route: "/renter/pay-rent"    },
                    { label: "New Request", color: DANGER,       route: "/renter/new-request" },
                    { label: "Messages",    color: TEAL,         route: "/renter/messages"    },
                    { label: "Documents",   color: ACCENT_LIGHT, route: "/renter/documents"   },
                    { label: "Lease Info",  color: PURPLE,       route: "/renter/lease-info"  },
                    { label: "Contact LL",  color: SUCCESS,      route: "/renter/contact-ll"  },
                  ].map((a) => (
                    <TouchableOpacity key={a.label} style={s.actionBtn} activeOpacity={0.7} onPress={() => router.push(a.route as any)}>
                      <View style={[s.actionDot, { backgroundColor: `${a.color}25` }]} />
                      <Text style={s.actionLbl}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </FadeIn>

            {/* Documents preview */}
            <FadeIn delay={420}>
              <View style={s.card}>
                <SectionHeader title="Documents" action="View all" />
                {documents.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No documents yet</Text></View>
                ) : documents.slice(0, 3).map((doc, i) => (
                  <TouchableOpacity key={doc._id} style={[s.docItem, i > 0 && s.borderTop]} activeOpacity={0.7} onPress={() => router.push("/renter/documents")}>
                    <View style={[s.docIconBox, { backgroundColor: `${ACCENT_LIGHT}18` }]}>
                      <Text style={{ fontSize: 18 }}>📄</Text>
                    </View>
                    <View style={s.docInfo}>
                      <Text style={s.docName}>{doc.name}</Text>
                      <Text style={s.docDate}>{new Date(doc.createdAt).toLocaleDateString("en-IN")} · {doc.category}</Text>
                    </View>
                    <Text style={[s.docArrow, { color: ACCENT_LIGHT }]}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* ══════════════ PAYMENTS TAB ══════════════ */}
        {activeTab === "payments" && (
          <>
            <FadeIn delay={0}>
              <View style={s.card}>
                <SectionHeader title="Payment Summary" />
                <View style={s.twoCol}>
                  <View style={[s.summCard, { backgroundColor: SUCCESS_BG, borderColor: `${SUCCESS}30` }]}>
                    <Text style={[s.summVal, { color: SUCCESS }]}>{payments.filter((payment) => payment.status === "PAID").length}</Text>
                    <Text style={s.summLbl}>On Time</Text>
                  </View>
                  <View style={[s.summCard, { backgroundColor: DANGER_BG, borderColor: `${DANGER}30` }]}>
                    <Text style={[s.summVal, { color: DANGER }]}>{payments.filter((payment) => payment.status === "LATE").length}</Text>
                    <Text style={s.summLbl}>Late</Text>
                  </View>
                  <View style={[s.summCard, { backgroundColor: "rgba(74,144,217,0.12)", borderColor: `${ACCENT_LIGHT}30` }]}>
                    <Text style={[s.summVal, { color: ACCENT_LIGHT }]}>₹{payments
                      .filter((payment) => payment.status === "PAID" && new Date(payment.paidAt ?? payment.createdAt).getFullYear() === today.getFullYear())
                      .reduce((total, payment) => total + payment.amount, 0).toLocaleString("en-IN")}</Text>
                    <Text style={s.summLbl}>Paid YTD</Text>
                  </View>
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.twoCol}>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Payment Trend</Text>
                  <Text style={s.cardSub}>{activityError || `${payments.length} recorded payments`}</Text>
                </View>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Next Due</Text>
                  <Text style={s.bigVal}>{lease && currentDueDate ? formatIndiaDate(currentDueDate) : "—"}</Text>
                  <Text style={s.cardSub}>{lease && currentDueDate ? `Due ${currentDueDate.getUTCFullYear()}` : "No active lease"}</Text>
                  <View style={{ marginTop: 12 }}>
                    <View style={s.progTrack}>
                      <View style={[s.progFill, { width: "0%", backgroundColor: WARNING }]} />
                    </View>
                    <Text style={s.progLbl}>{lease ? `${daysUntilDue} days until due` : "No lease data"}</Text>
                  </View>
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="Invoices" />
                {invoices.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No invoices received.</Text></View>
                ) : invoices.map((invoice, index) => (
                  <View key={invoice._id} style={[s.payItem, index > 0 && s.borderTop]}>
                    <View style={[s.payIconBox, { backgroundColor: invoice.status === "PAID" ? SUCCESS_BG : WARNING_BG }]}>
                      <Text style={{ fontSize: 16 }}>{invoice.status === "PAID" ? "✅" : "🧾"}</Text>
                    </View>
                    <View style={s.payInfo}>
                      <Text style={s.payMonth}>{invoice.type} · {invoice.invoiceNumber}</Text>
                      <Text style={s.payDate}>Due {new Date(invoice.dueDate).toLocaleDateString("en-IN")}</Text>
                    </View>
                    <View style={s.payRight}>
                      <Text style={s.payAmount}>₹{invoice.amount.toLocaleString("en-IN")}</Text>
                      <Text style={s.payDate}>{invoice.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={180}>
              <View style={s.card}>
                <SectionHeader title="Payment History" action="Export" />
                {payments.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No payment history yet</Text></View>
                ) : payments.map((p, i) => (
                  <View key={p._id} style={[s.payItem, i > 0 && s.borderTop]}>
                    <View style={[s.payIconBox, { backgroundColor: p.status === "LATE" ? DANGER_BG : p.status === "PAID" ? SUCCESS_BG : WARNING_BG }]}>
                      <Text style={{ fontSize: 16 }}>{p.status === "LATE" ? "⚠️" : p.status === "PAID" ? "✅" : "⏳"}</Text>
                    </View>
                    <View style={s.payInfo}>
                      <Text style={s.payMonth}>{p.period ?? new Date(p.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>
                      <Text style={s.payDate}>{p.reference ?? new Date(p.paidAt ?? p.createdAt).toLocaleDateString("en-IN")}</Text>
                    </View>
                    <View style={s.payRight}>
                      <Text style={s.payAmount}>₹{p.amount.toLocaleString("en-IN")}</Text>
                      <View style={[s.statusBadge, { backgroundColor: `${statusColor(p.status)}22` }]}>
                        <Text style={[s.statusTxt, { color: statusColor(p.status) }]}>{p.status.replace("_", " ")}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* ══════════════ MAINTENANCE TAB ══════════════ */}
        {activeTab === "maintenance" && (
          <>
            <FadeIn delay={0}>
              <View style={s.kpiRow}>
                {[
                  { label: "Open",        val: String(maintenanceRequests.filter((request) => request.status === "OPEN").length), color: DANGER,  bg: DANGER_BG  },
                  { label: "In Progress", val: String(maintenanceRequests.filter((request) => request.status === "IN_PROGRESS").length), color: WARNING, bg: WARNING_BG },
                  { label: "Resolved",    val: String(maintenanceRequests.filter((request) => request.status === "RESOLVED" || request.status === "CLOSED").length), color: SUCCESS, bg: SUCCESS_BG },
                ].map((k) => (
                  <View key={k.label} style={[s.kpiCard, { backgroundColor: k.bg, flex: 1 }]}>
                    <Text style={[s.kpiVal, { color: k.color, fontSize: 26 }]}>{k.val}</Text>
                    <Text style={s.kpiLbl}>{k.label}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <TouchableOpacity style={s.raiseBtn} activeOpacity={0.8} onPress={() => router.push("/renter/new-request" as any)}>
                <Text style={s.raiseBtnIcon}>+</Text>
                <Text style={s.raiseBtnTxt}>Raise New Request</Text>
              </TouchableOpacity>
            </FadeIn>

            <FadeIn delay={150}>
              <View style={s.card}>
                <SectionHeader title="My Requests" action="Filter" />
                {activityError && maintenanceRequests.length === 0 ? (
                  <View style={s.emptyState}><Text style={[s.emptyTxt, { color: DANGER }]}>{activityError}</Text></View>
                ) : maintenanceRequests.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No maintenance requests yet</Text></View>
                ) : maintenanceRequests.map((req, i) => (
                  <TouchableOpacity key={req._id} style={[s.maintItem, i > 0 && s.borderTop]} activeOpacity={0.7}>
                    <View style={s.maintLeft}>
                      <View style={[s.priorDot, { backgroundColor: priorityColor(req.priority) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.maintIssue}>{req.title}</Text>
                        <Text style={s.maintRaised}>Raised: {new Date(req.createdAt).toLocaleDateString("en-IN")}</Text>
                      </View>
                    </View>
                    <View style={s.maintRight}>
                      <View style={[s.statusBadge, { backgroundColor: `${statusColor(req.status)}22` }]}>
                        <Text style={[s.statusTxt, { color: statusColor(req.status) }]}>{req.status.replace("_", " ")}</Text>
                      </View>
                      <Text style={s.maintPriority}>{req.priority}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={220}>
              <View style={[s.card, { borderColor: `${TEAL}30` }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 20 }}>💡</Text>
                  <Text style={sh.title}>Reporting a problem?</Text>
                </View>
                {[
                  "Include clear photos with your request.",
                  "Mark urgency level accurately — emergencies are prioritised.",
                  "Ensure access is available for scheduled repairs.",
                ].map((tip, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <Text style={{ color: TEAL, fontWeight: "700" }}>•</Text>
                    <Text style={{ color: WHITE_72, fontSize: 12, flex: 1, lineHeight: 18 }}>{tip}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* ══════════════ MESSAGES TAB ══════════════ */}
        {activeTab === "messages" && (
          <>
            <FadeIn delay={0}>
              <TouchableOpacity style={s.composeBtn} activeOpacity={0.8} onPress={() => router.push("/renter/messages")}>
                <Text style={s.composeBtnIcon}>✉️</Text>
                <Text style={s.composeBtnTxt}>Compose Message</Text>
              </TouchableOpacity>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.card}>
                <SectionHeader title="Inbox" />
                {messages.length === 0 ? (
                  <View style={s.emptyState}><Text style={s.emptyTxt}>No messages yet</Text></View>
                ) : messages.slice(-5).reverse().map((msg, i) => (
                  <TouchableOpacity key={msg._id} style={[s.msgItem, i > 0 && s.borderTop]} activeOpacity={0.7} onPress={() => router.push("/renter/messages")}>
                    <View style={[s.msgAvatar, { backgroundColor: msg.senderRole === "LANDLORD" ? `${ACCENT_LIGHT}30` : WHITE_08 }]}>
                      <Text style={[s.msgAvatarTxt, { color: msg.senderRole === "LANDLORD" ? ACCENT_LIGHT : WHITE_40 }]}>
                        {(msg.sender?.fullName ?? (msg.senderRole === "RENTER" ? "You" : "Landlord")).charAt(0)}
                      </Text>
                    </View>
                    <View style={s.msgBody}>
                      <View style={s.msgTopRow}>
                        <Text style={s.msgFrom}>{msg.sender?.fullName ?? (msg.senderRole === "RENTER" ? "You" : "Landlord")}</Text>
                        <Text style={s.msgTime}>{new Date(msg.createdAt).toLocaleDateString("en-IN")}</Text>
                      </View>
                      <Text style={s.msgPreview} numberOfLines={2}>
                        {msg.subject ? `${msg.subject}: ` : ""}{msg.body}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="Contacts" />
                  <TouchableOpacity style={s.contactItem} activeOpacity={0.7} onPress={() => router.push("/renter/contact-ll")}>
                    <View style={[s.contactAvatar, { backgroundColor: `${TEAL}20` }]}><Text style={{ fontSize: 18 }}>👤</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.contactName}>{lease?.landlord?.fullName ?? "Landlord"}</Text>
                      <Text style={s.contactRole}>{lease?.landlord?.email ?? "Contact details unavailable"}</Text>
                    </View>
                    <Text style={{ color: TEAL }}>Message</Text>
                  </TouchableOpacity>
              </View>
            </FadeIn>
          </>
        )}

        {/* Sign out */}
        <FadeIn delay={480}>
          <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.75}>
            <Text style={s.signOutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </FadeIn>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BLUE },

  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  hLeft:         { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:        { width: 42, height: 42, borderRadius: 21, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: WHITE_20 },
  avatarTxt:     { fontSize: 14, fontWeight: "800", color: WHITE },
  greeting:      { fontSize: 11, color: WHITE_40, letterSpacing: 0.4, marginBottom: 1 },
  userName:      { fontSize: 15, fontWeight: "700", color: WHITE },
  hRight:        { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn:       { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  iconBtnTxt:    { fontSize: 18 },
  notifBadge:    { position: "absolute", top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: DANGER, alignItems: "center", justifyContent: "center" },
  notifBadgeTxt: { fontSize: 9, fontWeight: "800", color: WHITE },

  tabBar:       { backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  tabInner:     { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  tab:          { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: WHITE_05, flexDirection: "row", alignItems: "center", gap: 4 },
  tabActive:    { backgroundColor: TEAL },
  tabTxt:       { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  tabTxtActive: { color: WHITE, fontWeight: "700" },
  tabBadge:     { width: 16, height: 16, borderRadius: 8, backgroundColor: DANGER, alignItems: "center", justifyContent: "center" },
  tabBadgeTxt:  { fontSize: 9, fontWeight: "800", color: WHITE },

  body:        { flex: 1 },
  bodyContent: { padding: 16, gap: 14 },

  kpiRow:  { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, borderColor: WHITE_08 },
  kpiIcon: { fontSize: 20, marginBottom: 6 },
  kpiVal:  { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  kpiLbl:  { fontSize: 10, color: WHITE_40, letterSpacing: 0.4, textAlign: "center" },

  card:      { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  twoCol:    { flexDirection: "row", gap: 12 },
  half:      { flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: WHITE_72, letterSpacing: 0.3, marginBottom: 2 },
  bigVal:    { fontSize: 24, fontWeight: "800", color: WHITE, marginBottom: 2 },
  cardSub:   { fontSize: 11, color: WHITE_40 },
  progTrack: { height: 6, backgroundColor: WHITE_08, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  progFill:  { height: 6, borderRadius: 3 },
  progLbl:   { fontSize: 11, color: WHITE_40, marginTop: 6 },
  emptyState: { paddingVertical: 16, alignItems: "center" as const },
  emptyTxt:   { fontSize: 13, color: WHITE_40 },

  rentBanner:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${WARNING}18`, borderColor: `${WARNING}30` },
  rentBannerLeft:   { flex: 1 },
  rentBannerRight:  { marginLeft: 12 },
  rentBannerLabel:  { fontSize: 10, fontWeight: "700", color: WARNING, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
  rentBannerAmount: { fontSize: 32, fontWeight: "800", color: WHITE, marginBottom: 2 },
  rentBannerDate:   { fontSize: 12, color: WHITE_72, marginBottom: 14 },
  payNowBtn:        { backgroundColor: WARNING, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, alignSelf: "flex-start", alignItems: "center" },
  payNowTxt:        { fontSize: 13, fontWeight: "800", color: WHITE },

  propRow:     { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  propIconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: WHITE_15, flexShrink: 0 },
  propDetails: { flex: 1 },
  propName:    { fontSize: 15, fontWeight: "700", color: WHITE, marginBottom: 3 },
  propAddr:    { fontSize: 12, color: WHITE_40, marginBottom: 8, lineHeight: 17 },
  propTagRow:  { flexDirection: "row", gap: 6 },
  propTag:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  propTagTxt:  { fontSize: 10, fontWeight: "700" },

  leaseRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 14, borderTopWidth: 1, borderTopColor: WHITE_08 },
  leaseStat: { alignItems: "center", gap: 4 },
  leaseVal:  { fontSize: 14, fontWeight: "700", color: WHITE },
  leaseLbl:  { fontSize: 10, color: WHITE_40 },
  leaseDiv:  { width: 1, height: 32, backgroundColor: WHITE_15 },

  renewalAlert: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: DANGER_BG, borderWidth: 1, borderColor: `${DANGER}30` },
  renewalIcon:  { fontSize: 14 },
  renewalTxt:   { fontSize: 12, color: WHITE_72, flex: 1 },

  noticeItem:    { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  noticeIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  noticeTitle:   { fontSize: 13, fontWeight: "700", color: WHITE, marginBottom: 3 },
  noticeBody:    { fontSize: 12, color: WHITE_72, lineHeight: 17 },

  evItem:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  evBorder:    { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  evDot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  evTitle:     { flex: 1, fontSize: 13, fontWeight: "500", color: WHITE_90 },
  evDateBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  evDate:      { fontSize: 11, fontWeight: "700" },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn:   { width: "30%", flexGrow: 1, alignItems: "center", paddingVertical: 14, backgroundColor: WHITE_05, borderRadius: 14, borderWidth: 1, borderColor: WHITE_08 },
  actionDot:   { width: 36, height: 36, borderRadius: 18, marginBottom: 8 },
  actionLbl:   { fontSize: 11, fontWeight: "600", color: WHITE_72, textAlign: "center" },

  docItem:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  docIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  docInfo:    { flex: 1 },
  docName:    { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  docDate:    { fontSize: 11, color: WHITE_40 },
  docArrow:   { fontSize: 22, fontWeight: "300", flexShrink: 0 },

  summCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1 },
  summVal:  { fontSize: 20, fontWeight: "800", marginBottom: 2 },
  summLbl:  { fontSize: 10, color: WHITE_40 },

  payItem:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  payIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  payInfo:    { flex: 1 },
  payMonth:   { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  payDate:    { fontSize: 11, color: WHITE_40 },
  payRight:   { alignItems: "flex-end", gap: 4 },
  payAmount:  { fontSize: 13, fontWeight: "700", color: WHITE },

  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  borderTop: { borderTopWidth: 1, borderTopColor: WHITE_08 },

  raiseBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: TEAL, borderRadius: 16, height: 52 },
  raiseBtnIcon: { fontSize: 20, color: WHITE, fontWeight: "800" },
  raiseBtnTxt:  { fontSize: 15, fontWeight: "700", color: WHITE },

  maintItem:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  maintLeft:     { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1, marginRight: 12 },
  priorDot:      { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 4 },
  maintIssue:    { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  maintRaised:   { fontSize: 11, color: WHITE_40 },
  maintRight:    { alignItems: "flex-end", gap: 4 },
  maintPriority: { fontSize: 10, color: WHITE_40 },

  composeBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: ACCENT, borderRadius: 16, height: 52 },
  composeBtnIcon: { fontSize: 18 },
  composeBtnTxt:  { fontSize: 15, fontWeight: "700", color: WHITE },

  msgItem:      { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  msgAvatar:    { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  msgAvatarTxt: { fontSize: 16, fontWeight: "700" },
  msgBody:      { flex: 1 },
  msgTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  msgFrom:      { fontSize: 13, fontWeight: "700" },
  msgTime:      { fontSize: 10, color: WHITE_40 },
  msgPreview:   { fontSize: 12, lineHeight: 17 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT_LIGHT, flexShrink: 0, marginTop: 6 },

  contactItem:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  contactAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contactName:   { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  contactRole:   { fontSize: 11, color: WHITE_40 },
  msgIconBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  signOut:    { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 16, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05 },
  signOutTxt: { fontSize: 14, fontWeight: "600", color: WHITE_40 },
});
