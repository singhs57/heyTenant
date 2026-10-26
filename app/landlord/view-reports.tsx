import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, StatusBar, useWindowDimensions, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";
import type { LandlordDashboardData } from "../../types/landlordDashboard";

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
const WHITE_20     = "rgba(255,255,255,0.20)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

const REPORT_TABS = ["Overview", "Revenue", "Tenants", "Maintenance"] as const;
type ReportTab = typeof REPORT_TABS[number];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

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

// ── Revenue bar chart ─────────────────────────────────────────────────────────
function RevenueBarChart({ data, months }: { data: number[]; months: string[] }) {
  const maxH = 90;
  const avs  = data.map(() => useSharedValue(0));
  useEffect(() => {
    data.forEach((d, i) => {
      avs[i].value = withDelay(200 + i * 60, withTiming(d / Math.max(...data), { duration: 600, easing: Easing.out(Easing.cubic) }));
    });
  }, []);
  const barStyles = avs.map((av, i) =>
    useAnimatedStyle(() => ({
      height: av.value * maxH,
      backgroundColor: i === data.length - 1 ? WHITE_40 : ACCENT_LIGHT,
      borderRadius: 4, flex: 1,
    }))
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, height: maxH + 28 }}>
      {data.map((d, i) => (
        <View key={months[i]} style={{ alignItems: "center", flex: 1 }}>
          <Animated.View style={barStyles[i]} />
          <Text style={{ fontSize: 8, color: WHITE_40, marginTop: 4 }}>{months[i]}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Donut ring ────────────────────────────────────────────────────────────────
function MiniDonut({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[dr.ring, { borderColor: color }]}>
        <View style={[dr.inner, { borderColor: WHITE_08 }]}>
          <Text style={dr.pct}>{pct}%</Text>
        </View>
      </View>
      <Text style={dr.label}>{label}</Text>
    </View>
  );
}
const dr = StyleSheet.create({
  ring:  { width: 72, height: 72, borderRadius: 36, borderWidth: 8, alignItems: "center", justifyContent: "center" },
  inner: { width: 54, height: 54, borderRadius: 27, borderWidth: 8, alignItems: "center", justifyContent: "center" },
  pct:   { fontSize: 14, fontWeight: "800", color: WHITE },
  label: { fontSize: 10, color: WHITE_40, marginTop: 6, textAlign: "center" },
});

export default function ViewReports() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>("Overview");
  const [report, setReport] = useState<LandlordDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) { setError("Not authenticated."); return; }
      const response = await fetch(`${API_URL}/api/landlord/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? "Failed to load reports.");
        return;
      }
      setReport(json?.data ?? null);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void fetchReport(); });

  const metrics = report?.metrics;
  const revenueHistory = metrics?.monthlyRevenueByMonth ?? [];
  const monthlyRevenue = MONTHS.map((_, index) =>
    revenueHistory.find((entry) => entry.month === index + 1)?.amount ?? 0
  );
  const annualRevenue = metrics?.annualRevenue ?? 0;
  const paymentBreakdown = [
    { label: "Collected", value: metrics?.rentCollection?.collected ?? 0, color: SUCCESS },
    { label: "Pending", value: metrics?.rentCollection?.pending ?? 0, color: WARNING },
    { label: "Overdue", value: metrics?.rentCollection?.overdue ?? 0, color: DANGER },
  ];
  const maintenanceRequests = report?.maintenanceRequests ?? [];
  const maintenanceByCategory = maintenanceRequests.reduce<Record<string, number>>((counts, request) => {
    counts[request.category] = (counts[request.category] ?? 0) + 1;
    return counts;
  }, {});
  const maintenanceBreakdown = [
    { label: "Resolved", value: metrics?.maintenanceCounts?.resolved ?? 0, color: SUCCESS },
    { label: "In Progress", value: metrics?.maintenanceCounts?.inProgress ?? 0, color: WARNING },
    { label: "Open", value: metrics?.maintenanceCounts?.open ?? 0, color: DANGER },
  ];
  const leases = report?.leases ?? [];
  const now = new Date();
  const tenantStats = [
    { label: "Active Tenants", value: metrics?.activeTenantCount ?? 0, color: ACCENT_LIGHT },
    { label: "Avg Tenure", value: leases.length
      ? `${Math.round(leases.reduce((sum, lease) => sum + Math.max(0, (now.getTime() - new Date(lease.leaseStart).getTime()) / 2.628e9), 0) / leases.length)} mo`
      : "0 mo", color: PURPLE },
    { label: "New This Month", value: leases.filter((lease) => {
      const created = new Date(lease.createdAt);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length, color: SUCCESS },
    { label: "Leaving Soon", value: leases.filter((lease) => {
      const daysRemaining = (new Date(lease.leaseEnd).getTime() - now.getTime()) / 86400000;
      return daysRemaining >= 0 && daysRemaining <= 180;
    }).length, color: WARNING },
  ];
  const topProperties = (report?.properties ?? []).map((property) => {
    const propertyLeaseIds = leases.filter((lease) => {
      const leasePropertyId = typeof lease.property === "string" ? lease.property : lease.property?._id;
      return leasePropertyId === property._id;
    })
      .map((lease) => String(lease._id));
    const propertyPaid = (report?.payments ?? [])
      .filter((payment) => payment.status === "PAID"
        && new Date(payment.paidAt ?? payment.createdAt).getFullYear() === now.getFullYear()
        && propertyLeaseIds.includes(String(payment.lease)))
      .reduce((sum, payment) => sum + payment.amount, 0);
    return {
      id: String(property._id),
      name: property.name,
      units: 1,
      revenue: `₹${propertyPaid.toLocaleString("en-IN")}`,
      occupancy: property.status === "OCCUPIED" ? 100 : 0,
      trend: 0,
    };
  });
  const overviewKpis = [
    { label: "Collected This Year", value: `₹${annualRevenue.toLocaleString("en-IN")}`, change: "YTD", positive: true, icon: "₹", color: SUCCESS },
    { label: "Occupancy", value: `${metrics?.occupancyPercentage ?? 0}%`, change: `${metrics?.occupiedProperties ?? 0}/${metrics?.propertyCount ?? 0}`, positive: true, icon: "🏢", color: ACCENT_LIGHT },
    { label: "Outstanding Rent", value: `₹${((metrics?.rentCollection?.pending ?? 0) + (metrics?.rentCollection?.overdue ?? 0)).toLocaleString("en-IN")}`, change: "This month", positive: false, icon: "⚠️", color: WARNING },
    { label: "Maintenance Cost", value: "Not tracked", change: "", positive: false, icon: "🔧", color: DANGER },
  ];

  const paddingTop = Platform.OS === "android"
    ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32)
    : Math.max(insets.top + 8, 32);

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
          <Text style={s.hTitle}>Reports</Text>
          <Text style={s.hSub}>Portfolio analytics</Text>
        </View>
        <TouchableOpacity style={s.exportBtn} activeOpacity={0.7}>
          <Text style={s.exportTxt}>Export</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Tab bar */}
      <Animated.View style={[s.tabBar, hStyle]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabInner}>
          {REPORT_TABS.map((t) => (
            <TouchableOpacity key={t} style={[s.tab, activeTab === t && s.tabActive]} onPress={() => setActiveTab(t)} activeOpacity={0.75}>
              <Text style={[s.tabTxt, activeTab === t && s.tabTxtActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      <ScrollView
        style={s.body}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void fetchReport(); }} tintColor={ACCENT_LIGHT} />}
      >
        {error ? <Text style={{ color: DANGER, textAlign: "center" }}>{error}</Text> : null}
        {loading && !report ? <ActivityIndicator color={ACCENT_LIGHT} /> : null}

        {/* ══ OVERVIEW ══ */}
        {activeTab === "Overview" && (
          <>
            <FadeIn delay={0}>
              <View style={s.kpiGrid}>
                {overviewKpis.map((k) => (
                  <View key={k.label} style={s.kpiCard}>
                    <View style={s.kpiTop}>
                      <Text style={s.kpiIcon}>{k.icon}</Text>
                      <View style={[s.changeBadge, { backgroundColor: k.positive ? SUCCESS_BG : DANGER_BG }]}>
                        <Text style={[s.changeTxt, { color: k.positive ? SUCCESS : DANGER }]}>{k.change}</Text>
                      </View>
                    </View>
                    <Text style={[s.kpiVal, { color: k.color }]}>{k.value}</Text>
                    <Text style={s.kpiLbl}>{k.label}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.card}>
                <SectionHeader title="Annual Revenue" action="YTD" />
                <Text style={s.bigVal}>{loading && !report ? "Loading…" : `₹${annualRevenue.toLocaleString("en-IN")}`}</Text>
                <Text style={s.cardSub}>Recorded payments collected this year</Text>
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="Top Properties" action="See all" />
                {topProperties.length === 0 ? (
                  <View style={{ paddingVertical: 16, alignItems: "center" }}>
                    <Text style={{ color: WHITE_40, fontSize: 13 }}>No properties added yet</Text>
                  </View>
                ) : topProperties.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[s.propRow, i > 0 && s.borderTop]} activeOpacity={0.7}>
                    <View style={s.propLeft}>
                      <View style={s.propIconBox}><Text style={{ fontSize: 16 }}>🏢</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.propName}>{p.name}</Text>
                        <Text style={s.propSub}>Collected YTD: {p.revenue}</Text>
                      </View>
                    </View>
                    <View style={s.propRight}>
                      <Text style={[s.propOcc, { color: p.occupancy === 100 ? SUCCESS : p.occupancy >= 75 ? WARNING : DANGER }]}>{p.occupancy}%</Text>
                      <Text style={[s.propTrend, { color: p.occupancy === 100 ? SUCCESS : DANGER }]}>{p.occupancy ? "Occupied" : "Vacant"}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={230}>
              <View style={s.twoCol}>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Occupancy</Text>
                  <Text style={[s.bigVal, { marginTop: 10 }]}>{metrics?.occupancyPercentage ?? 0}%</Text>
                  <Text style={s.cardSub}>{metrics?.occupiedProperties ?? 0} of {metrics?.propertyCount ?? 0} properties occupied</Text>
                </View>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Rent</Text>
                  <View style={{ gap: 8, marginTop: 10 }}>
                    {paymentBreakdown.map((p) => (
                      <View key={p.label} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
                          <Text style={{ fontSize: 11, color: WHITE_72 }}>{p.label}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: p.color }}>₹{p.value.toLocaleString("en-IN")}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </FadeIn>
          </>
        )}

        {/* ══ REVENUE ══ */}
        {activeTab === "Revenue" && (
          <>
            <FadeIn delay={0}>
              <View style={s.card}>
                <SectionHeader title="Revenue This Year" />
                <Text style={s.bigVal}>₹{annualRevenue.toLocaleString("en-IN")}</Text>
                <Text style={s.cardSub}>Recorded payments collected this year</Text>
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.card}>
                <SectionHeader title="Monthly Breakdown" />
                {monthlyRevenue.map((amount, i) => {
                  const max = Math.max(...monthlyRevenue, 1);
                  return (
                    <View key={MONTHS[i]} style={s.revRow}>
                      <Text style={s.revMonth}>{MONTHS[i]}</Text>
                      <View style={s.revBarWrap}>
                        <View style={[s.revBar, { width: `${Math.round((amount / max) * 100)}%`, backgroundColor: ACCENT_LIGHT }]} />
                      </View>
                      <Text style={s.revVal}>₹{amount.toLocaleString("en-IN")}</Text>
                    </View>
                  );
                })}
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.twoCol}>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Avg Monthly</Text>
                  <Text style={[s.bigVal, { fontSize: 20 }]}>₹{Math.round(annualRevenue / Math.max(now.getMonth() + 1, 1)).toLocaleString("en-IN")}</Text>
                  <Text style={s.cardSub}>Monthly average this year</Text>
                </View>
                <View style={[s.card, s.half]}>
                  <Text style={s.cardTitle}>Best Month</Text>
                  <Text style={[s.bigVal, { fontSize: 20, color: SUCCESS }]}>₹{Math.max(...monthlyRevenue).toLocaleString("en-IN")}</Text>
                  <Text style={s.cardSub}>{MONTHS[monthlyRevenue.indexOf(Math.max(...monthlyRevenue))]} collected</Text>
                </View>
              </View>
            </FadeIn>
          </>
        )}

        {/* ══ TENANTS ══ */}
        {activeTab === "Tenants" && (
          <>
            <FadeIn delay={0}>
              <View style={s.kpiRow}>
                {tenantStats.map((k) => (
                  <View key={k.label} style={[s.kpiCard2, { borderColor: `${k.color}30` }]}>
                    <Text style={[s.kpiVal2, { color: k.color }]}>{k.value}</Text>
                    <Text style={s.kpiLbl}>{k.label}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.card}>
                <SectionHeader title="Payment Status" />
                <View style={s.rentRow}>
                  {paymentBreakdown.map((p) => (
                    <View key={p.label} style={s.rentStat}>
                      <Text style={[s.rentVal, { color: p.color, fontSize: 16 }]}>₹{p.value.toLocaleString("en-IN")}</Text>
                      <Text style={s.rentLbl}>{p.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.progTrack}>
                  <View style={[s.progFill, {
                    width: `${metrics?.rentCollection?.expected
                      ? Math.min(100, Math.round((metrics.rentCollection.collected / metrics.rentCollection.expected) * 100))
                      : 0}%`,
                    backgroundColor: SUCCESS,
                  }]} />
                </View>
                <Text style={s.progLbl}>
                  {metrics?.rentCollection?.expected
                    ? `${Math.min(100, Math.round((metrics.rentCollection.collected / metrics.rentCollection.expected) * 100))}% rent collected this month`
                    : "No rent currently due"}
                </Text>
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="Lease Expiry Forecast" action="6 months" />
                {[
                  { period: "This Month", start: 0, end: 1, color: SUCCESS },
                  { period: "Next Month", start: 1, end: 2, color: WARNING },
                  { period: "In 2–3 Months", start: 2, end: 4, color: WARNING },
                  { period: "In 4–6 Months", start: 4, end: 7, color: ACCENT_LIGHT },
                ].map((e, i) => {
                  const count = leases.filter((lease) => {
                    const monthsUntilEnd = (new Date(lease.leaseEnd).getTime() - now.getTime()) / 2.628e9;
                    return monthsUntilEnd >= e.start && monthsUntilEnd < e.end;
                  }).length;
                  return (
                  <View key={e.period} style={[s.expiryRow, i > 0 && s.borderTop]}>
                    <View style={[s.expiryDot, { backgroundColor: e.color }]} />
                    <Text style={s.expiryPeriod}>{e.period}</Text>
                    <View style={[s.expiryBadge, { backgroundColor: `${e.color}20` }]}>
                      <Text style={[s.expiryCount, { color: e.color }]}>{count} lease{count !== 1 ? "s" : ""}</Text>
                    </View>
                  </View>
                  );
                })}
              </View>
            </FadeIn>
          </>
        )}

        {/* ══ MAINTENANCE ══ */}
        {activeTab === "Maintenance" && (
          <>
            <FadeIn delay={0}>
              <View style={s.kpiRow}>
                {maintenanceBreakdown.map((k) => (
                  <View key={k.label} style={[s.kpiCard2, { borderColor: `${k.color}30` }]}>
                    <Text style={[s.kpiVal2, { color: k.color }]}>{k.value}</Text>
                    <Text style={s.kpiLbl}>{k.label}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <View style={s.card}>
                <SectionHeader title="Maintenance Cost" />
                <Text style={s.bigVal}>Not tracked</Text>
                <Text style={s.cardSub}>Maintenance requests do not currently record costs.</Text>
              </View>
            </FadeIn>

            <FadeIn delay={160}>
              <View style={s.card}>
                <SectionHeader title="By Category" />
                {maintenanceRequests.length === 0
                  ? <View style={{ paddingVertical: 16, alignItems: "center" }}><Text style={{ color: WHITE_40, fontSize: 13 }}>No maintenance requests recorded.</Text></View>
                  : Object.entries(maintenanceByCategory).map(([category, count]) => (
                    <View key={category} style={s.expiryRow}>
                      <Text style={s.expiryPeriod}>{category}</Text>
                      <Text style={s.expiryCount}>{count} request{count !== 1 ? "s" : ""}</Text>
                    </View>
                  ))}
              </View>
            </FadeIn>
          </>
        )}

      </ScrollView>
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
  exportBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: WHITE_08, borderWidth: 1, borderColor: WHITE_15 },
  exportTxt: { fontSize: 12, fontWeight: "600", color: WHITE_72 },

  tabBar:      { backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  tabInner:    { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  tab:         { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: WHITE_05 },
  tabActive:   { backgroundColor: ACCENT },
  tabTxt:      { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  tabTxtActive:{ color: WHITE, fontWeight: "700" },

  body:    { flex: 1 },
  content: { padding: 16, gap: 14 },
  card:    { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  twoCol:  { flexDirection: "row", gap: 12 },
  half:    { flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: WHITE_72, letterSpacing: 0.3, marginBottom: 6 },
  bigVal:  { fontSize: 28, fontWeight: "800", color: WHITE, marginBottom: 2 },
  cardSub: { fontSize: 11, color: WHITE_40 },
  pill:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt: { fontSize: 11, fontWeight: "700" },
  borderTop: { borderTopWidth: 1, borderTopColor: WHITE_08 },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { width: "47%", flexGrow: 1, backgroundColor: WHITE_08, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: WHITE_15 },
  kpiTop:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  kpiIcon: { fontSize: 20 },
  kpiVal:  { fontSize: 20, fontWeight: "800", color: WHITE, marginBottom: 4 },
  kpiLbl:  { fontSize: 11, color: WHITE_40 },
  changeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changeTxt:   { fontSize: 10, fontWeight: "700" },

  kpiRow:   { flexDirection: "row", gap: 10 },
  kpiCard2: { flex: 1, backgroundColor: WHITE_08, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: "center" },
  kpiVal2:  { fontSize: 18, fontWeight: "800", marginBottom: 4 },

  propRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  propLeft:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  propIconBox:{ width: 36, height: 36, borderRadius: 10, backgroundColor: WHITE_05, alignItems: "center", justifyContent: "center" },
  propName:   { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  propSub:    { fontSize: 11, color: WHITE_40 },
  propRight:  { alignItems: "flex-end", gap: 2 },
  propOcc:    { fontSize: 14, fontWeight: "800" },
  propTrend:  { fontSize: 11, fontWeight: "600" },

  revRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 9, gap: 10 },
  revMonth:  { fontSize: 12, color: WHITE_72, width: 56 },
  revBarWrap:{ flex: 1, height: 6, backgroundColor: WHITE_05, borderRadius: 3, overflow: "hidden" },
  revBar:    { height: 6, borderRadius: 3 },
  revVal:    { fontSize: 12, fontWeight: "600", color: WHITE, width: 64, textAlign: "right" },

  rentRow:  { flexDirection: "row", justifyContent: "space-around", marginVertical: 14 },
  rentStat: { alignItems: "center", gap: 4 },
  rentVal:  { fontSize: 28, fontWeight: "800" },
  rentLbl:  { fontSize: 11, color: WHITE_40 },
  progTrack:{ height: 6, backgroundColor: WHITE_08, borderRadius: 3, overflow: "hidden" },
  progFill: { height: 6, borderRadius: 3 },
  progLbl:  { fontSize: 11, color: WHITE_40, marginTop: 6, textAlign: "center" },

  expiryRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  expiryDot:   { width: 8, height: 8, borderRadius: 4 },
  expiryPeriod:{ flex: 1, fontSize: 13, color: WHITE_90 },
  expiryBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  expiryCount: { fontSize: 11, fontWeight: "700" },

  catRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  catDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  catName:   { fontSize: 12, color: WHITE_72, width: 72 },
  catBarWrap:{ flex: 1, height: 6, backgroundColor: WHITE_05, borderRadius: 3, overflow: "hidden" },
  catBar:    { height: 6, borderRadius: 3 },
  catCost:   { fontSize: 12, fontWeight: "600", color: WHITE, width: 52, textAlign: "right" },
});
