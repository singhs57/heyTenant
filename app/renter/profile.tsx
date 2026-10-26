import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, StatusBar, Linking,
  Alert, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";
import {
  formatIndiaDate,
  getIndiaBillingPeriod,
  getFollowingRentDueDate,
  getIndiaRentDueDate,
  getRentSchedule,
} from "../../lib/rentSchedule";

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

type LeaseRecord = {
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  property?: {
    name: string;
    addressLine1: string;
    city: string;
    postcode: string;
    depositAmount?: number;
  };
  landlord?: { fullName: string; email: string };
};

type PaymentRecord = {
  _id: string;
  amount: number;
  status: string;
  period?: string;
  reference?: string;
  paidAt?: string;
  createdAt: string;
};

const DOCUMENTS: { id: string; icon: string; label: string; sub: string; color: string }[] = [];

const USEFUL_LINKS = [
  { id: "1", icon: "\uD83C\uDFE0", label: "Model Tenancy Act, 2021 (MoHUA)", url: "https://mohua.gov.in/upload/uploadfiles/files/Model_Tenancy_Act_2021.pdf" },
  { id: "2", icon: "\u2696\uFE0F", label: "Transfer of Property Act, 1882", url: "https://www.indiacode.nic.in/bitstream/123456789/2338/1/A1882-04.pdf" },
  { id: "3", icon: "\uD83D\uDCDD", label: "Registration Act, 1908", url: "https://www.indiacode.nic.in/handle/123456789/2190" },
  { id: "4", icon: "\uD83D\uDD0D", label: "National Consumer Helpline", url: "https://consumerhelpline.gov.in/" },
  { id: "5", icon: "\u2139\uFE0F", label: "Income Tax Department", url: "https://www.incometax.gov.in/" },
];

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0);
  const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 420 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {sub ? <Text style={sh.sub}>{sub}</Text> : null}
    </View>
  );
}
const sh = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 14, fontWeight: "700", color: WHITE_72, letterSpacing: 0.4, textTransform: "uppercase" },
  sub:   { fontSize: 12, color: TEAL, fontWeight: "600" },
});

function InfoRow({ icon, label, value, onPress, last = false }: {
  icon: string; label: string; value: string; onPress?: () => void; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ir.row, !last && ir.border]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={ir.iconWrap}><Text style={ir.icon}>{icon}</Text></View>
      <View style={ir.body}>
        <Text style={ir.label}>{label}</Text>
        <Text style={[ir.value, onPress && ir.link]}>{value}</Text>
      </View>
      {onPress ? <Text style={ir.chevron}>{"\u203A"}</Text> : null}
    </TouchableOpacity>
  );
}
const ir = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  border:  { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  iconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  icon:    { fontSize: 16 },
  body:    { flex: 1 },
  label:   { fontSize: 10, color: WHITE_40, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 },
  value:   { fontSize: 14, color: WHITE_90, fontWeight: "500" },
  link:    { color: TEAL },
  chevron: { fontSize: 18, color: WHITE_40 },
});

function PayStatusBadge({ status }: { status: string }) {
  const color = status === "PAID" ? SUCCESS : status === "LATE" ? DANGER : WARNING;
  return (
    <View style={[pb.wrap, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
      <View style={[pb.dot, { backgroundColor: color }]} />
      <Text style={[pb.txt, { color }]}>{status}</Text>
    </View>
  );
}
const pb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
  txt:  { fontSize: 11, fontWeight: "700" },
});

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
}

export default function RenterProfile() {
  const router      = useRouter();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const { user }    = useUser();
  const [signingOut, setSigningOut] = useState(false);
  const [lease, setLease] = useState<LeaseRecord | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  const fetchProfileData = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    try {
      const token = await getToken();
      if (!token) { setDataError("Not authenticated."); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [leaseResponse, paymentsResponse] = await Promise.all([
        fetch(`${API_URL}/api/renter/lease`, { headers }),
        fetch(`${API_URL}/api/renter/payments`, { headers }),
      ]);
      const [leaseJson, paymentsJson] = await Promise.all([
        leaseResponse.json().catch(() => null),
        paymentsResponse.json().catch(() => null),
      ]);
      if (!leaseResponse.ok && leaseResponse.status !== 404) {
        setDataError(leaseJson?.error?.message ?? "Failed to load tenancy data.");
        return;
      }
      if (!paymentsResponse.ok) {
        setDataError(paymentsJson?.error?.message ?? "Failed to load payment history.");
        return;
      }
      setLease(leaseResponse.status === 404 ? null : leaseJson?.data ?? null);
      setPayments(paymentsJson?.data ?? []);
    } catch {
      setDataError("Network error — is the server running?");
    } finally {
      setDataLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => {
    void fetchProfileData();
  });

  const displayName  = user?.fullName ?? user?.username ?? "--";
  const initials     = user?.fullName ? getInitials(user.fullName)
                     : (user?.username?.slice(0, 2).toUpperCase() ?? "?");
  const email        = user?.primaryEmailAddress?.emailAddress ?? "--";
  const phone        = (user?.unsafeMetadata?.phone as string | undefined) ?? "--";
  const occupation   = (user?.unsafeMetadata?.occupation as string | undefined) ?? "--";
  const employer     = (user?.unsafeMetadata?.employer as string | undefined) ?? "--";
  const memberSince  = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "--";

  const performSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      router.replace("/welcome");
    } catch {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to sign out. Please try again.");
      } else {
        Alert.alert("Error", "Failed to sign out. Please try again.");
      }
    } finally {
      setSigningOut(false);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Are you sure you want to sign out?")) {
        void performSignOut();
      }
      return;
    }

    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => { void performSignOut(); },
        },
      ]
    );
  };
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"overview" | "tenancy" | "documents">("overview");

  const headerOp = useSharedValue(0);
  const headerTy = useSharedValue(-14);
  useEffect(() => {
    headerOp.value = withTiming(1, { duration: 350 });
    headerTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, []);
  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOp.value,
    transform: [{ translateY: headerTy.value }],
  }));

  const paddingTop = Platform.OS === "android"
    ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32)
    : Math.max(insets.top + 8, 32);

  const TABS = [
    { id: "overview",  label: "Overview"  },
    { id: "tenancy",   label: "Tenancy"   },
    { id: "documents", label: "Documents" },
  ] as const;

  const paid  = payments.filter((payment) => payment.status === "PAID").length;
  const late  = payments.filter((payment) => payment.status === "LATE").length;
  const total = paid + late;
  const pct   = total ? Math.round((paid / total) * 100) : 0;
  const today = new Date();
  const leaseMonths = lease?.leaseStart
    ? Math.max(0, (today.getFullYear() - new Date(lease.leaseStart).getFullYear()) * 12
      + today.getMonth() - new Date(lease.leaseStart).getMonth())
    : null;
  const rentSchedule = getRentSchedule(lease?.leaseStart, today);
  const currentPeriod = getIndiaBillingPeriod(today);
  const submittedThisPeriod = payments
    .filter((payment) => payment.status !== "LATE"
      && (payment.period ?? getIndiaBillingPeriod(new Date(payment.paidAt ?? payment.createdAt))) === currentPeriod)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const paymentPeriod = rentSchedule.isEarlyPaymentWindowOpen
    && submittedThisPeriod >= (lease?.monthlyRent ?? Infinity)
    ? getIndiaBillingPeriod(rentSchedule.dueDate ?? today)
    : currentPeriod;
  const submittedForPaymentPeriod = paymentPeriod === currentPeriod
    ? submittedThisPeriod
    : payments
      .filter((payment) => payment.status !== "LATE"
        && (payment.period ?? getIndiaBillingPeriod(new Date(payment.paidAt ?? payment.createdAt))) === paymentPeriod)
      .reduce((sum, payment) => sum + payment.amount, 0);
  const nextPaymentAmount = rentSchedule.isPaymentWindowOpen
    ? Math.max((lease?.monthlyRent ?? 0) - submittedForPaymentPeriod, 0)
    : 0;
  const rentDueDate = rentSchedule.isEarlyPaymentWindowOpen && paymentPeriod === currentPeriod
    ? getIndiaRentDueDate(today)
    : rentSchedule.dueDate
    && rentSchedule.isCurrentBillingMonth
    && submittedThisPeriod >= (lease?.monthlyRent ?? Infinity)
    ? getFollowingRentDueDate(rentSchedule.dueDate)
    : rentSchedule.dueDate;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <Animated.View style={[s.topBar, { paddingTop }, headerStyle]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.backIcon}>{"\u2039"}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>My Profile</Text>
        <TouchableOpacity style={s.editBtn} activeOpacity={0.7}>
          <Text style={s.editTxt}>Edit</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={[s.tabBar, headerStyle]}>
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
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={dataLoading} onRefresh={() => { void fetchProfileData(); }} tintColor={TEAL} />}
      >
        {/* HERO */}
        <FadeIn delay={0}>
          <View style={s.heroCard}>
            <View style={s.avatarOuter}>
              <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
              <View style={s.onlineDot} />
            </View>
            <Text style={s.nameText}>{displayName}</Text>
            <View style={s.heroBadgeRow}>
              <View style={s.tenantBadge}>
                <Text style={s.tenantBadgeIcon}>{"\uD83C\uDFE0"}</Text>
                <Text style={s.tenantBadgeTxt}>Renter Account</Text>
              </View>
              <View style={s.memberBadge}>
                <Text style={s.memberBadgeTxt}>Since {memberSince}</Text>
              </View>
            </View>
            <View style={s.heroStrip}>
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{payments.length}</Text>
                <Text style={s.heroStatLbl}>Payments</Text>
              </View>
              <View style={s.heroDiv} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{total ? `${pct}%` : "—"}</Text>
                <Text style={s.heroStatLbl}>Paid</Text>
              </View>
              <View style={s.heroDiv} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{dataLoading && !lease ? "…" : dataError && !lease ? "—" : leaseMonths ?? "—"}</Text>
                <Text style={s.heroStatLbl}>Months</Text>
              </View>
              <View style={s.heroDiv} />
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{rentDueDate ? formatIndiaDate(rentDueDate) : "—"}</Text>
                <Text style={s.heroStatLbl}>Rent Due</Text>
              </View>
            </View>
            <View style={s.heroActions}>
              <TouchableOpacity style={[s.heroBtn, s.heroBtnPrimary]} onPress={() => router.push("/renter/pay-rent" as any)} activeOpacity={0.8}>
                <Text style={s.heroBtnPrimaryTxt}>{"\uD83D\uDCB3"}{"  "}Pay Rent</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.heroBtn, s.heroBtnSecondary]} onPress={() => router.push("/renter/new-request" as any)} activeOpacity={0.8}>
                <Text style={s.heroBtnSecondaryTxt}>{"\uD83D\uDD27"}{"  "}Request</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.heroBtn, s.heroBtnSecondary]} onPress={() => router.push("/renter/messages" as any)} activeOpacity={0.8}>
                <Text style={s.heroBtnSecondaryTxt}>{"\uD83D\uDCAC"}{"  "}Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </FadeIn>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            <FadeIn delay={60}>
              <View style={s.card}>
                <SectionHeader title="Personal Details" />
                <InfoRow icon={"\u2709\uFE0F"} label="Email"      value={email}      onPress={email !== "--" ? () => Linking.openURL(`mailto:${email}`) : undefined} />
                <InfoRow icon={"\uD83D\uDCDE"} label="Phone"      value={phone}      onPress={phone !== "--" ? () => Linking.openURL(`tel:${phone}`) : undefined} />
                <InfoRow icon={"\uD83D\uDCBC"} label="Occupation" value={occupation} />
                <InfoRow icon={"\uD83C\uDFE2"} label="Employer"   value={employer}   last />
              </View>
            </FadeIn>

            <FadeIn delay={120}>
              <View style={s.rentGlance}>
                <View style={s.glanceLeft}>
                  <Text style={s.glanceLbl}>NEXT PAYMENT</Text>
                  <Text style={s.glanceAmount}>{lease ? `₹${nextPaymentAmount.toLocaleString("en-IN")}` : "—"}</Text>
                  <View style={[s.glancePill, { backgroundColor: WARNING_BG }]}>
                    <Text style={[s.glancePillTxt, { color: WARNING }]}>
                      {dataError || (lease ? `Due by ${rentDueDate ? formatIndiaDate(rentDueDate) : "10th"}` : "No active lease")}
                    </Text>
                  </View>
                </View>
                <View style={s.glanceDivider} />
                <View style={s.glanceRight}>
                  <Text style={s.glanceLbl}>DEPOSIT HELD</Text>
                  <Text style={s.glanceAmount}>{lease ? `₹${(lease.property?.depositAmount ?? 0).toLocaleString("en-IN")}` : "—"}</Text>
                  <View style={[s.glancePill, { backgroundColor: TEAL_BG }]}>
                    <Text style={[s.glancePillTxt, { color: TEAL }]}>{lease ? "Lease deposit" : "No active lease"}</Text>
                  </View>
                </View>
              </View>
            </FadeIn>

            <FadeIn delay={180}>
              <View style={s.card}>
                <SectionHeader title="Emergency Contact" />
                {lease?.emergencyContactName
                  ? <InfoRow icon={"\uD83D\uDC64"} label={lease.emergencyContactName} value={lease.emergencyContactPhone ?? "Phone not provided"} />
                  : <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ color: WHITE_40, fontSize: 13 }}>No emergency contact added yet</Text>
                  </View>}
              </View>
            </FadeIn>

            <FadeIn delay={240}>
              <View style={s.card}>
                <SectionHeader title="Tenant Resources" />
                {USEFUL_LINKS.map((link, i) => (
                  <TouchableOpacity key={link.id} style={[s.linkRow, i < USEFUL_LINKS.length - 1 && s.linkBorder]} onPress={() => Linking.openURL(link.url)} activeOpacity={0.7}>
                    <View style={s.linkIconWrap}><Text style={s.linkIcon}>{link.icon}</Text></View>
                    <Text style={s.linkLabel}>{link.label}</Text>
                    <Text style={s.linkArrow}>{"\u2197"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        {/* TENANCY */}
        {activeTab === "tenancy" && (
          <>
            <FadeIn delay={0}>
              <View style={s.leaseBanner}>
                <View style={s.leaseBannerLeft}>
                  <Text style={s.leaseBannerLabel}>ACTIVE TENANCY</Text>
                  <Text style={s.leaseBannerProp}>{lease?.property?.name ?? (dataError || "No active lease")}</Text>
                  <Text style={s.leaseBannerAddr}>{lease?.property
                    ? `${lease.property.addressLine1}, ${lease.property.city} ${lease.property.postcode}`
                    : "Property details unavailable"}</Text>
                  <View style={s.leaseBannerTags}>
                    <View style={[s.leaseBannerTag, { backgroundColor: TEAL_BG }]}>
                      <Text style={[s.leaseBannerTagTxt, { color: TEAL }]}>{lease ? "Active lease" : "Not leased"}</Text>
                    </View>
                  </View>
                </View>
                <Text style={s.leaseBannerIcon}>{"\uD83C\uDFE2"}</Text>
              </View>
            </FadeIn>

            <FadeIn delay={60}>
              <View style={s.card}>
                <SectionHeader title="Lease Term" />
                <View style={s.leaseTermRow}>
                  <View style={s.leaseTermStat}>
                    <Text style={s.leaseTermLbl}>Start Date</Text>
                    <Text style={s.leaseTermVal}>{lease ? new Date(lease.leaseStart).toLocaleDateString("en-IN") : "—"}</Text>
                  </View>
                  <Text style={s.leaseTermArrow}>{"\u2192"}</Text>
                  <View style={s.leaseTermStat}>
                    <Text style={s.leaseTermLbl}>End Date</Text>
                    <Text style={[s.leaseTermVal, { color: WARNING }]}>{lease ? new Date(lease.leaseEnd).toLocaleDateString("en-IN") : "—"}</Text>
                  </View>
                </View>
                <View style={s.leaseProgressTrack}>
                  <View style={[s.leaseProgressFill, {
                    width: lease ? `${Math.max(0, Math.min(100, Math.round(
                      ((today.getTime() - new Date(lease.leaseStart).getTime())
                        / (new Date(lease.leaseEnd).getTime() - new Date(lease.leaseStart).getTime())) * 100
                    )))}%` : "0%",
                  }]} />
                </View>
                <Text style={s.leaseProgressLbl}>{lease
                  ? `${leaseMonths ?? 0} months into lease`
                  : dataError || "No active lease data available"}</Text>
              </View>
            </FadeIn>

            <FadeIn delay={120}>
              <View style={s.card}>
                <SectionHeader title="Financial Details" />
                <InfoRow icon={"\uD83D\uDCB0"} label="Monthly Rent" value={lease ? `₹${lease.monthlyRent.toLocaleString("en-IN")}` : dataError || "No active lease"} />
                <InfoRow icon={"\uD83C\uDFE6"} label="Deposit Amount" value={lease ? `₹${(lease.property?.depositAmount ?? 0).toLocaleString("en-IN")}` : "—"} last />
              </View>
            </FadeIn>

            <FadeIn delay={180}>
              <View style={s.card}>
                <SectionHeader title="Landlord & Agent" />
                {lease?.landlord
                  ? <>
                    <InfoRow icon={"\uD83D\uDC64"} label="Landlord" value={lease.landlord.fullName} />
                    <InfoRow icon={"\u2709\uFE0F"} label="Email" value={lease.landlord.email} onPress={() => Linking.openURL(`mailto:${lease.landlord!.email}`)} last />
                  </>
                  : <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ color: WHITE_40, fontSize: 13 }}>{dataError || "No landlord assigned to this lease."}</Text>
                  </View>}
              </View>
            </FadeIn>

            <FadeIn delay={240}>
              <View style={s.card}>
                <SectionHeader title="Payment History" sub={total > 0 ? `${paid}/${total} paid` : "No payments"} />
                {total > 0 ? (
                  <>
                    <View style={s.scoreBar}>
                      <View style={[s.scoreBarFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={s.scoreBarLbl}>{pct}% of completed payments marked paid</Text>
                    {payments.map((pay, i) => (
                      <View key={pay._id} style={[s.payRow, i > 0 && s.payBorder]}>
                        <View style={[s.payIconWrap, { backgroundColor: pay.status === "PAID" ? SUCCESS_BG : pay.status === "LATE" ? DANGER_BG : WARNING_BG }]}>
                          <Text style={s.payIcon}>{pay.status === "PAID" ? "\uD83D\uDCB3" : "\u23F0"}</Text>
                        </View>
                        <View style={s.payBody}>
                          <Text style={s.payMonth}>{pay.period ?? new Date(pay.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>
                          <Text style={s.payDate}>{pay.reference ?? new Date(pay.paidAt ?? pay.createdAt).toLocaleDateString("en-IN")}</Text>
                        </View>
                        <View style={s.payRight}>
                          <Text style={s.payAmount}>₹{pay.amount.toLocaleString("en-IN")}</Text>
                          <PayStatusBadge status={pay.status} />
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ color: WHITE_40, fontSize: 13 }}>No payment history yet</Text>
                  </View>
                )}
              </View>
            </FadeIn>
          </>
        )}

        {/* DOCUMENTS */}
        {activeTab === "documents" && (
          <>
            <FadeIn delay={0}>
              <View style={s.docNotice}>
                <Text style={s.docNoticeIcon}>{"\uD83D\uDD12"}</Text>
                <Text style={s.docNoticeTxt}>Documents will appear here when they are uploaded for your tenancy.</Text>
              </View>
            </FadeIn>
            <FadeIn delay={60}>
              <View style={s.card}>
                <SectionHeader title="My Documents" sub={`${DOCUMENTS.length} files`} />
                {DOCUMENTS.length === 0
                  ? <Text style={{ color: WHITE_40, textAlign: "center", paddingVertical: 16 }}>
                    No documents have been uploaded for this account.
                  </Text>
                  : DOCUMENTS.map((doc, i) => (
                  <TouchableOpacity key={doc.id} style={[s.docItem, i < DOCUMENTS.length - 1 && s.docBorder]} activeOpacity={0.75}>
                    <View style={[s.docIconWrap, { backgroundColor: `${doc.color}15` }]}>
                      <Text style={s.docIcon}>{doc.icon}</Text>
                    </View>
                    <View style={s.docBody}>
                      <Text style={s.docLabel}>{doc.label}</Text>
                      <Text style={s.docSub}>{doc.sub}</Text>
                    </View>
                    <View style={[s.docViewBtn, { backgroundColor: `${doc.color}15`, borderColor: `${doc.color}30` }]}>
                      <Text style={[s.docViewTxt, { color: doc.color }]}>View</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </FadeIn>
          </>
        )}

        <FadeIn delay={320}>
          <TouchableOpacity
            style={[s.signOut, signingOut && s.signOutDisabled]}
            onPress={handleSignOut}
            activeOpacity={0.75}
            disabled={signingOut}
          >
            {signingOut
              ? <ActivityIndicator size="small" color="#F87171" />
              : <Text style={s.signOutTxt}>Sign Out</Text>
            }
          </TouchableOpacity>
        </FadeIn>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BRAND_BLUE },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  topBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: BRAND_DEEP, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  backBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  backIcon: { fontSize: 26, color: WHITE, lineHeight: 30, marginTop: -2 },
  topTitle: { fontSize: 16, fontWeight: "700", color: WHITE },
  editBtn:  { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: TEAL_BG, borderWidth: 1, borderColor: `${TEAL}40` },
  editTxt:  { fontSize: 13, fontWeight: "600", color: TEAL },
  tabBar:       { flexDirection: "row", backgroundColor: BRAND_DEEP, paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab:          { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 20, backgroundColor: WHITE_05 },
  tabActive:    { backgroundColor: TEAL },
  tabTxt:       { fontSize: 13, fontWeight: "500", color: WHITE_40 },
  tabTxtActive: { color: WHITE, fontWeight: "700" },
  heroCard:            { backgroundColor: WHITE_08, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: WHITE_15, alignItems: "center" },
  avatarOuter:         { position: "relative", marginBottom: 12 },
  avatar:              { width: 88, height: 88, borderRadius: 44, backgroundColor: TEAL, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: WHITE_20 },
  avatarTxt:           { fontSize: 30, fontWeight: "800", color: WHITE },
  onlineDot:           { position: "absolute", bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: SUCCESS, borderWidth: 2, borderColor: BRAND_BLUE },
  nameText:            { fontSize: 22, fontWeight: "800", color: WHITE, marginBottom: 8 },
  heroBadgeRow:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  tenantBadge:         { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: TEAL_BG, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${TEAL}30` },
  tenantBadgeIcon:     { fontSize: 11 },
  tenantBadgeTxt:      { fontSize: 11, color: TEAL, fontWeight: "700", letterSpacing: 0.3 },
  memberBadge:         { backgroundColor: WHITE_05, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: WHITE_15 },
  memberBadgeTxt:      { fontSize: 11, color: WHITE_40, fontWeight: "500" },
  heroStrip:           { flexDirection: "row", alignItems: "center", width: "100%", backgroundColor: WHITE_05, borderRadius: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 1, borderColor: WHITE_08 },
  heroStat:            { flex: 1, alignItems: "center" },
  heroStatVal:         { fontSize: 17, fontWeight: "800", color: WHITE, marginBottom: 2 },
  heroStatLbl:         { fontSize: 10, color: WHITE_40, letterSpacing: 0.4 },
  heroDiv:             { width: 1, height: 32, backgroundColor: WHITE_15 },
  heroActions:         { flexDirection: "row", gap: 8, width: "100%" },
  heroBtn:             { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 14 },
  heroBtnPrimary:      { backgroundColor: TEAL },
  heroBtnPrimaryTxt:   { fontSize: 13, fontWeight: "700", color: WHITE },
  heroBtnSecondary:    { backgroundColor: WHITE_08, borderWidth: 1, borderColor: WHITE_20 },
  heroBtnSecondaryTxt: { fontSize: 13, fontWeight: "600", color: WHITE_90 },
  card: { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  rentGlance:    { flexDirection: "row", backgroundColor: "rgba(13,148,136,0.14)", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: `${TEAL}30` },
  glanceLeft:    { flex: 1, paddingRight: 16 },
  glanceDivider: { width: 1, backgroundColor: WHITE_15 },
  glanceRight:   { flex: 1, paddingLeft: 16 },
  glanceLbl:     { fontSize: 10, color: WHITE_40, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  glanceAmount:  { fontSize: 24, fontWeight: "800", color: WHITE, marginBottom: 8 },
  glancePill:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  glancePillTxt: { fontSize: 11, fontWeight: "700" },
  emergencyCard:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: WHITE_05, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: WHITE_08 },
  emergencyAvatar:    { width: 44, height: 44, borderRadius: 22, backgroundColor: DANGER_BG, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${DANGER}30`, flexShrink: 0 },
  emergencyAvatarTxt: { fontSize: 16, fontWeight: "800", color: DANGER },
  emergencyBody:      { flex: 1 },
  emergencyName:      { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 2 },
  emergencyRelation:  { fontSize: 12, color: WHITE_40 },
  emergencyCallBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: SUCCESS_BG, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${SUCCESS}30`, flexShrink: 0 },
  emergencyCallTxt:   { fontSize: 18 },
  linkRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  linkBorder:   { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  linkIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  linkIcon:     { fontSize: 16 },
  linkLabel:    { flex: 1, fontSize: 14, color: WHITE_90, fontWeight: "500" },
  linkArrow:    { fontSize: 14, color: TEAL, fontWeight: "700" },
  leaseBanner:       { flexDirection: "row", alignItems: "flex-start", backgroundColor: "rgba(13,148,136,0.14)", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: `${TEAL}30` },
  leaseBannerLeft:   { flex: 1 },
  leaseBannerLabel:  { fontSize: 10, fontWeight: "700", color: TEAL, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  leaseBannerProp:   { fontSize: 18, fontWeight: "800", color: WHITE, marginBottom: 4 },
  leaseBannerAddr:   { fontSize: 12, color: WHITE_40, marginBottom: 10, lineHeight: 17 },
  leaseBannerTags:   { flexDirection: "row", gap: 6 },
  leaseBannerTag:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  leaseBannerTagTxt: { fontSize: 10, fontWeight: "700" },
  leaseBannerIcon:   { fontSize: 40, marginLeft: 8, marginTop: 4 },
  leaseTermRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 14, marginBottom: 14, backgroundColor: WHITE_05, borderRadius: 12 },
  leaseTermStat:     { alignItems: "center", gap: 4 },
  leaseTermLbl:      { fontSize: 10, color: WHITE_40, letterSpacing: 0.4, textTransform: "uppercase" },
  leaseTermVal:      { fontSize: 15, fontWeight: "700", color: WHITE },
  leaseTermArrow:    { fontSize: 20, color: WHITE_20 },
  renewalAlert:      { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, backgroundColor: DANGER_BG, borderWidth: 1, borderColor: `${DANGER}30`, marginBottom: 14 },
  renewalIcon:       { fontSize: 14, marginTop: 1 },
  renewalTxt:        { flex: 1, fontSize: 12, color: WHITE_72, lineHeight: 18 },
  leaseProgressTrack:{ height: 6, backgroundColor: WHITE_08, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  leaseProgressFill: { height: 6, borderRadius: 3, backgroundColor: TEAL },
  leaseProgressLbl:  { fontSize: 11, color: WHITE_40 },
  contactCard:     { flexDirection: "row", alignItems: "center", gap: 12 },
  agentRow:        { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: WHITE_08 },
  contactAvatar:   { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contactAvatarTxt:{ fontSize: 14, fontWeight: "800", color: ACCENT_LIGHT },
  contactBody:     { flex: 1 },
  contactName:     { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 2 },
  contactRole:     { fontSize: 12, color: WHITE_40 },
  contactBtns:     { flexDirection: "row", gap: 8 },
  contactBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  contactBtnTxt:   { fontSize: 16 },
  scoreBar:     { height: 6, backgroundColor: WHITE_08, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  scoreBarFill: { height: 6, borderRadius: 3, backgroundColor: TEAL },
  scoreBarLbl:  { fontSize: 11, color: WHITE_40, marginBottom: 14 },
  payRow:       { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  payBorder:    { borderTopWidth: 1, borderTopColor: WHITE_08 },
  payIconWrap:  { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  payIcon:      { fontSize: 17 },
  payBody:      { flex: 1 },
  payMonth:     { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  payDate:      { fontSize: 11, color: WHITE_40 },
  payRight:     { alignItems: "flex-end", gap: 4 },
  payAmount:    { fontSize: 14, fontWeight: "700", color: WHITE },
  docNotice:     { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: TEAL_BG, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${TEAL}25` },
  docNoticeIcon: { fontSize: 20 },
  docNoticeTxt:  { flex: 1, fontSize: 12, color: WHITE_72, lineHeight: 18 },
  docItem:       { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  docBorder:     { borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  docIconWrap:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  docIcon:       { fontSize: 20 },
  docBody:       { flex: 1 },
  docLabel:      { fontSize: 14, fontWeight: "600", color: WHITE, marginBottom: 3 },
  docSub:        { fontSize: 12, color: WHITE_40 },
  docViewBtn:    { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  docViewTxt:    { fontSize: 12, fontWeight: "700" },
  uploadBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 16, borderWidth: 1, borderColor: WHITE_20, backgroundColor: WHITE_05 },
  uploadIcon: { fontSize: 18, color: TEAL },
  uploadTxt:  { fontSize: 14, fontWeight: "600", color: TEAL },
  signOut:         { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 16, borderWidth: 1, borderColor: WHITE_15, backgroundColor: WHITE_05 },
  signOutDisabled: { opacity: 0.5 },
  signOutTxt:      { fontSize: 14, fontWeight: "600", color: "#F87171" },
});
