import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking,
  TextInput, Platform, StatusBar, KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as DocumentPicker from "expo-document-picker";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";
import { formatIndiaDate, getIndiaBillingPeriod, getRentSchedule } from "../../lib/rentSchedule";

const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const TEAL         = "#0D9488";
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

type LeaseData = {
  _id: string;
  leaseStart: string;
  monthlyRent: number;
  electricityIncluded?: boolean;
  electricityRatePerUnit?: number;
  electricityLastReading?: number;
  landlord?: { fullName: string; upiId?: string; hasUpiQr?: boolean };
};
type PaymentData = { _id: string; amount: number; status: string; period?: string; paidAt?: string; createdAt: string };
type RentPeriodBalance = {
  period: string;
  rentDue: number;
  electricityDue: number;
  paid: number;
  awaitingConfirmation: number;
};
type RentBalance = {
  totalDue: number;
  totalElectricityDue: number;
  totalPaid: number;
  awaitingConfirmation: number;
  outstanding: number;
  availableToPay: number;
  monthlyRent: number;
  periods?: RentPeriodBalance[];
};
type RentPaymentQuote = {
  amount: number;
  outstanding: number;
  availableToPay: number;
  totalDue: number;
  electricityCharge: number;
  totalPaid: number;
  awaitingConfirmation: number;
  monthlyRent: number;
  period: string;
  upiId: string;
  payeeName: string;
  intentReference: string;
};
type ElectricityReadingData = {
  required: boolean;
  period: string;
  ratePerUnit?: number;
  lastVerifiedReading?: number;
  chargeDue?: number;
  reading?: {
    _id: string;
    currentReading: number;
    unitsConsumed: number;
    chargeAmount: number;
    status: "PENDING" | "APPROVED" | "REJECTED";
    rejectionReason?: string;
  } | null;
};
type MeterPhoto = { uri: string; name: string; mimeType: string };

function scColor(s: string) {
  return s === "PAID" ? SUCCESS : s === "LATE" ? DANGER : WARNING;
}

function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useSharedValue(0); const ty = useSharedValue(18);
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 430 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 430, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Animated.View style={useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }))}>{children}</Animated.View>;
}

export default function PayRent() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const pt = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [ref,     setRef]     = useState("");
  const [step,    setStep]    = useState<"select" | "confirm" | "success">("select");
  const [quote, setQuote] = useState<RentPaymentQuote | null>(null);
  const [rentBalance, setRentBalance] = useState<RentBalance | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [qrAuthToken, setQrAuthToken] = useState("");
  const [busy,    setBusy]    = useState(false);
  const btnSc  = useSharedValue(1);
  const succOp = useSharedValue(0);
  const succSc = useSharedValue(0.6);
  const [payError, setPayError] = useState<string | null>(null);
  const [lease, setLease] = useState<LeaseData | null>(null);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [electricity, setElectricity] = useState<ElectricityReadingData | null>(null);
  const [meterReading, setMeterReading] = useState("");
  const [meterPhoto, setMeterPhoto] = useState<MeterPhoto | null>(null);
  const [meterBusy, setMeterBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const fetchPaymentData = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    try {
      const token = await getToken();
      if (!token) { setDataError("Not authenticated."); return; }
      setQrAuthToken(token);
      const headers = { Authorization: `Bearer ${token}` };
      const [leaseResponse, paymentsResponse, balanceResponse] = await Promise.all([
        fetch(`${API_URL}/api/renter/lease`, { headers }),
        fetch(`${API_URL}/api/renter/payments`, { headers }),
        fetch(`${API_URL}/api/renter/payments/balance`, { headers }),
      ]);
      const [leaseJson, paymentsJson, balanceJson, electricityResponse] = await Promise.all([
        leaseResponse.json().catch(() => null),
        paymentsResponse.json().catch(() => null),
        balanceResponse.json().catch(() => null),
        fetch(`${API_URL}/api/renter/electricity-reading`, { headers }),
      ]);
      const electricityJson = await electricityResponse.json().catch(() => null);
      const fetchedLease = leaseJson?.data ?? null;
      if (leaseResponse.status === 404) {
        setLease(null);
      } else if (!leaseResponse.ok) {
        setDataError(leaseJson?.error?.message ?? "Failed to load the active lease.");
        return;
      } else {
        setLease(fetchedLease);
      }
      if (!paymentsResponse.ok) {
        setDataError(paymentsJson?.error?.message ?? "Failed to load payment history.");
        return;
      }
      if (!balanceResponse.ok) {
        setDataError(balanceJson?.error?.message ?? "Failed to load the rent balance.");
        return;
      }
      if (!electricityResponse.ok) {
        setDataError(electricityJson?.error?.message ?? "Failed to load electricity billing details.");
        return;
      }
      setPayments(paymentsJson?.data ?? []);
      setRentBalance(balanceJson?.data ?? null);
      const schedule = getRentSchedule(fetchedLease?.leaseStart);
      const currentPeriod = getIndiaBillingPeriod(new Date());
      const periods = balanceJson?.data?.periods ?? [];
      const currentIndex = periods.findIndex((entry: RentPeriodBalance) => entry.period === currentPeriod);
      const unpaidPeriod = currentIndex < 0
        ? null
        : periods.slice(0, currentIndex + 1).find((entry: RentPeriodBalance) => (
          entry.rentDue + entry.electricityDue - entry.paid - entry.awaitingConfirmation > 0
        ));
      const selectedPeriod = schedule.isEarlyPaymentWindowOpen && !unpaidPeriod && schedule.dueDate
        ? getIndiaBillingPeriod(schedule.dueDate)
        : schedule.isEarlyPaymentWindowOpen && unpaidPeriod
          ? unpaidPeriod.period
          : currentPeriod;
      const selectedIndex = periods.findIndex((entry: RentPeriodBalance) => entry.period === selectedPeriod);
      const earlyAmount = selectedIndex < 0
        ? 0
        : periods.slice(0, selectedIndex + 1).reduce((total: number, entry: RentPeriodBalance) => (
          total + Math.max(entry.rentDue + entry.electricityDue - entry.paid - entry.awaitingConfirmation, 0)
        ), 0);
      setPaymentAmount((schedule.isEarlyPaymentWindowOpen
        ? earlyAmount
        : schedule.isPaymentWindowOpen ? balanceJson?.data?.availableToPay ?? 0 : 0).toFixed(2));
      setElectricity(electricityJson?.data ?? null);
    } catch {
      setDataError("Network error — is the server running?");
    } finally {
      setDataLoading(false);
    }
  }, [getToken]);

  useStableFocusEffect(() => { void fetchPaymentData(); });
  const rentSchedule = getRentSchedule(lease?.leaseStart);
  const currentPeriod = getIndiaBillingPeriod(new Date());
  const currentPeriodIndex = rentBalance?.periods?.findIndex((entry) => entry.period === currentPeriod) ?? -1;
  const periodsThroughCurrent = currentPeriodIndex < 0
    ? []
    : rentBalance?.periods?.slice(0, currentPeriodIndex + 1) ?? [];
  const unpaidPeriod = periodsThroughCurrent.find((entry) => (
    entry.rentDue + entry.electricityDue - entry.paid - entry.awaitingConfirmation > 0
  ));
  const period = rentSchedule.isEarlyPaymentWindowOpen && !unpaidPeriod && rentSchedule.dueDate
    ? getIndiaBillingPeriod(rentSchedule.dueDate)
    : rentSchedule.isEarlyPaymentWindowOpen && unpaidPeriod
      ? unpaidPeriod.period
      : currentPeriod;
  const selectedPeriodIndex = rentBalance?.periods?.findIndex((entry) => entry.period === period) ?? -1;
  const earlyPaymentAmount = selectedPeriodIndex < 0
    ? 0
    : (rentBalance?.periods?.slice(0, selectedPeriodIndex + 1) ?? []).reduce((total, entry) => (
      total + Math.max(entry.rentDue + entry.electricityDue - entry.paid - entry.awaitingConfirmation, 0)
    ), 0);
  const electricityApproved = electricity?.reading?.status === "APPROVED";
  const electricityCharge = electricityApproved ? electricity?.chargeDue ?? electricity.reading?.chargeAmount ?? 0 : 0;
  const amountDue = rentSchedule.isPaymentWindowOpen
    ? rentSchedule.isEarlyPaymentWindowOpen
      ? earlyPaymentAmount
      : rentBalance?.availableToPay ?? 0
    : 0;
  const requestedPaymentAmount = Number(paymentAmount);
  const canPay = Boolean(lease)
    && rentSchedule.isPaymentWindowOpen
    && requestedPaymentAmount > 0
    && Number.isFinite(requestedPaymentAmount)
    && Math.abs(requestedPaymentAmount * 100 - Math.round(requestedPaymentAmount * 100)) < 1e-7
    && requestedPaymentAmount <= amountDue
    && Boolean(lease?.landlord?.upiId)
    && (lease?.electricityIncluded !== false || electricityApproved || period !== currentPeriod);

  const startUpiPayment = async () => {
    setBusy(true);
    setPayError(null);
    try {
      const token = await getToken();
      if (!token) { router.replace("/login"); return; }
      const response = await fetch(`${API_URL}/api/renter/payments/quote?amount=${encodeURIComponent(paymentAmount)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setPayError(json?.error?.message ?? "Could not calculate the rent payment.");
        return;
      }
      const paymentQuote = json?.data as RentPaymentQuote;
      if (!paymentQuote?.upiId || !Number.isFinite(paymentQuote.amount) || paymentQuote.amount <= 0) {
        setPayError("The server returned invalid UPI payment details.");
        return;
      }
      setQuote(paymentQuote);
      const upiUrl = `upi://pay?pa=${encodeURIComponent(paymentQuote.upiId)}`
        + `&pn=${encodeURIComponent(paymentQuote.payeeName)}`
        + `&am=${encodeURIComponent(paymentQuote.amount.toFixed(2))}`
        + `&cu=INR&tn=${encodeURIComponent(`Rent ${paymentQuote.period}`)}`
        + `&tr=${encodeURIComponent(paymentQuote.intentReference)}`;
      try {
        await Linking.openURL(upiUrl);
      } catch {
        setPayError("No UPI app could open this payment. Install or enable a UPI app and try again.");
        return;
      }
      setStep("confirm");
    } catch {
      setPayError("Could not calculate the payment. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickMeterPhoto = async () => {
    setPayError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size !== undefined && asset.size > 10 * 1024 * 1024) {
      setPayError("Meter photos must be 10 MB or smaller.");
      return;
    }
    const mimeType = asset.mimeType;
    if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      setPayError("Choose a JPEG, PNG or WebP meter photo.");
      return;
    }
    setMeterPhoto({ uri: asset.uri, name: asset.name || "meter-reading", mimeType });
  };

  const submitMeterReading = async () => {
    if (!electricity?.required || !meterReading.trim() || !meterPhoto) {
      setPayError("Enter the current meter reading and attach a clear meter photo.");
      return;
    }
    setMeterBusy(true);
    setPayError(null);
    try {
      const token = await getToken();
      if (!token) { router.replace("/login"); return; }
      const photoResponse = await fetch(meterPhoto.uri);
      if (!photoResponse.ok) throw new Error("Could not read the selected meter photo.");
      const sourceBlob = await photoResponse.blob();
      const photoBlob = sourceBlob.type === meterPhoto.mimeType
        ? sourceBlob
        : new Blob([sourceBlob], { type: meterPhoto.mimeType });
      const formData = new FormData();
      formData.append("meterReading", meterReading.trim());
      formData.append("meterPhoto", photoBlob, meterPhoto.name);
      const response = await fetch(`${API_URL}/api/renter/electricity-reading`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not submit the meter reading.");
      setMeterReading("");
      setMeterPhoto(null);
      await fetchPaymentData();
    } catch (readingError) {
      setPayError(readingError instanceof Error ? readingError.message : "Could not submit the meter reading.");
    } finally {
      setMeterBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setPayError(null);
    btnSc.value = withSpring(0.96, { damping: 15 });
    try {
      const token = await getToken();
      if (!token) { router.replace("/login"); return; }
      if (!lease) {
        setPayError("No active lease found. Cannot process payment.");
        return;
      }
      if (amountDue <= 0) {
        setPayError("There is no outstanding rent amount for this period.");
        return;
      }
      if (lease.electricityIncluded === false && !electricityApproved && period === currentPeriod) {
        setPayError("Wait for your landlord to approve the meter reading before submitting rent.");
        return;
      }

      const response = await fetch(`${API_URL}/api/renter/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          leaseId: lease._id,
          method: "UPI",
          amount: quote?.amount ?? requestedPaymentAmount,
          reference: ref,
          period: quote?.period ?? period,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setPayError(json?.error?.message ?? "Payment request could not be saved.");
        return;
      }
      setRef(json?.data?.reference ?? ref);
      await fetchPaymentData();
      setStep("success");
      succOp.value = withTiming(1, { duration: 400 });
      succSc.value = withSpring(1, { damping: 12, stiffness: 180 });
    } catch {
      setPayError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  };

  const hOp = useSharedValue(0); const hTy = useSharedValue(-14);
  useEffect(() => { hOp.value = withTiming(1, { duration: 350 }); hTy.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }); }, []);
  const hStyle   = useAnimatedStyle(() => ({ opacity: hOp.value, transform: [{ translateY: hTy.value }] }));
  const succStyle = useAnimatedStyle(() => ({ opacity: succOp.value, transform: [{ scale: succSc.value }] }));
  const btnStyle  = useAnimatedStyle(() => ({ transform: [{ scale: btnSc.value }] }));

  if (step === "success") return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.succRoot, { paddingTop: pt }]}>
        <Animated.View style={[s.succCard, succStyle]}>
          <View style={s.succIconWrap}><Text style={s.succIconTxt}>✓</Text></View>
          <Text style={s.succTitle}>Payment Request Saved</Text>
          <Text style={s.succSub}>Your landlord must verify the transfer and confirm receipt.</Text>
          <View style={s.succDetail}>
                {[["Method", "UPI"], ["Reference", ref || "Generated by server"], ["Date", new Date().toLocaleDateString("en-IN")], ["Status", "Pending confirmation"]].map(([l, v]) => (
              <View key={l} style={s.succRow}><Text style={s.succLbl}>{l}</Text>              <Text style={[s.succVal, l === "Status" && { color: WARNING }]}>{v}</Text></View>
            ))}
          </View>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} activeOpacity={0.85}><Text style={s.doneTxt}>Back to Dashboard</Text></TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[s.header, { paddingTop: pt }, hStyle]}>
        <TouchableOpacity onPress={() => step === "confirm" ? setStep("select") : router.back()} style={s.backBtn} activeOpacity={0.7}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <View style={s.hCenter}><Text style={s.hTitle}>{step === "confirm" ? "Confirm UPI Payment" : "Pay Rent"}</Text><Text style={s.hSub}>{period}</Text></View>
        <View style={{ width: 38 }} />
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={s.body}
          contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={dataLoading} onRefresh={() => { void fetchPaymentData(); }} tintColor={TEAL} />}
        >

          {step === "select" && <>
            <FadeIn delay={0}>
              <View style={s.dueBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={s.dueLabel}>AVAILABLE TO PAY</Text>
                  <Text style={s.dueAmt}>{lease ? `₹${amountDue.toLocaleString("en-IN")}` : dataLoading ? "Loading…" : "—"}</Text>
                  <Text style={s.dueSub}>
                    {lease
                      ? rentSchedule.isPaymentWindowOpen
                        ? `${rentSchedule.isEarlyPaymentWindowOpen ? `Early payment for ${period} · ` : ""}Due by ${formatIndiaDate(rentSchedule.dueDate ?? new Date())}`
                        : rentSchedule.paymentStartDate && rentSchedule.dueDate
                          ? `Rent opens ${formatIndiaDate(rentSchedule.paymentStartDate)} · due by ${formatIndiaDate(rentSchedule.dueDate)}`
                          : `Rent is not available for ${period}`
                      : dataError || "No active lease"}
                  </Text>
                </View>
                <View style={s.daysRing}><Text style={s.daysNum}>10</Text><Text style={s.daysLbl}>due day</Text></View>
              </View>
            </FadeIn>

            <FadeIn delay={20}>
              <View style={s.card}>
                <Text style={s.cardTitle}>Your rent balance</Text>
                <View style={s.balanceRow}>
                  <Text style={s.balanceLabel}>Total outstanding</Text>
                  <Text style={s.balanceValue}>₹{(rentBalance?.outstanding ?? 0).toLocaleString("en-IN")}</Text>
                </View>
                <View style={s.balanceRow}>
                  <Text style={s.balanceLabel}>Paid and confirmed</Text>
                  <Text style={[s.balanceValue, { color: SUCCESS }]}>₹{(rentBalance?.totalPaid ?? 0).toLocaleString("en-IN")}</Text>
                </View>
                {(rentBalance?.totalElectricityDue ?? 0) > 0 ? (
                  <View style={s.balanceRow}>
                    <Text style={s.balanceLabel}>Approved electricity charges</Text>
                    <Text style={s.balanceValue}>₹{rentBalance!.totalElectricityDue.toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {(rentBalance?.awaitingConfirmation ?? 0) > 0 ? (
                  <View style={s.balanceRow}>
                    <Text style={s.balanceLabel}>Awaiting landlord confirmation</Text>
                    <Text style={[s.balanceValue, { color: WARNING }]}>₹{rentBalance!.awaitingConfirmation.toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                <Text style={[s.refHint, { marginTop: 10 }]}>
                  You can pay any amount up to ₹{amountDue.toLocaleString("en-IN")}. Any remaining balance carries forward to next month.
                </Text>
                <Text style={s.amountInputLabel}>Amount to pay</Text>
                <TextInput
                  value={paymentAmount}
                  onChangeText={(value) => {
                    setPaymentAmount(value);
                    setQuote(null);
                  }}
                  placeholder="Enter any amount"
                  placeholderTextColor={WHITE_40}
                  keyboardType="decimal-pad"
                  style={s.referenceInput}
                />
              </View>
            </FadeIn>

            {lease?.electricityIncluded === false && electricity ? (
              <FadeIn delay={40}>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Electricity Meter Reading</Text>
                  <Text style={s.refHint}>
                    Starting from meter reading {electricity.lastVerifiedReading ?? lease.electricityLastReading ?? 0}.
                    Enter the current cumulative meter reading and upload a clear photo. Units and charges are calculated by the server at ₹{electricity.ratePerUnit ?? lease.electricityRatePerUnit ?? 7} per unit.
                  </Text>
                  {electricity.reading?.status === "APPROVED" ? (
                    <View style={s.readingStatus}>
                      <Text style={s.readingStatusTitle}>Reading approved</Text>
                      <Text style={s.readingStatusText}>
                        {electricity.reading.unitsConsumed.toLocaleString("en-IN")} units · ₹{electricity.reading.chargeAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : electricity.reading?.status === "PENDING" ? (
                    <View style={s.readingStatus}>
                      <Text style={s.readingStatusTitle}>Waiting for landlord approval</Text>
                      <Text style={s.readingStatusText}>Electricity will be added to rent after the photo is reviewed.</Text>
                    </View>
                  ) : (
                    <>
                      {electricity.reading?.status === "REJECTED" ? (
                        <Text style={s.rejectionText}>
                          Previous reading rejected: {electricity.reading.rejectionReason || "Please submit a new clear photo and reading."}
                        </Text>
                      ) : null}
                      <TextInput
                        value={meterReading}
                        onChangeText={setMeterReading}
                        placeholder="Current meter reading"
                        placeholderTextColor={WHITE_40}
                        keyboardType="decimal-pad"
                        style={s.meterInput}
                      />
                      <TouchableOpacity style={s.photoButton} onPress={() => { void pickMeterPhoto(); }} disabled={meterBusy}>
                        <Text style={s.photoButtonText}>{meterPhoto ? `Photo: ${meterPhoto.name}` : "Choose meter photo"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.submitReadingButton, meterBusy && { opacity: 0.6 }]}
                        onPress={() => { void submitMeterReading(); }}
                        disabled={meterBusy}
                      >
                        <Text style={s.submitReadingText}>{meterBusy ? "Submitting…" : "Submit reading for approval"}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {electricityApproved ? (
                    <View style={s.billBreakdown}>
                      <Text style={s.billRow}>Monthly rent: ₹{(lease.monthlyRent ?? 0).toLocaleString("en-IN")}</Text>
                      <Text style={s.billRow}>Electricity: ₹{electricityCharge.toLocaleString("en-IN")}</Text>
                      <Text style={s.billTotal}>Total: ₹{((lease.monthlyRent ?? 0) + electricityCharge).toLocaleString("en-IN")}</Text>
                    </View>
                  ) : null}
                </View>
              </FadeIn>
            ) : null}

            <FadeIn delay={80}>
              <View style={s.statsRow}>
                {[[SUCCESS, SUCCESS_BG, String(payments.filter((payment) => payment.status === "PAID").length), "Paid"],
                  [ACCENT_LIGHT, "rgba(74,144,217,0.12)", `₹${payments.filter((payment) => payment.status === "PAID" && new Date(payment.paidAt ?? payment.createdAt).getFullYear() === new Date().getFullYear()).reduce((sum, payment) => sum + payment.amount, 0).toLocaleString("en-IN")}`, "Paid YTD"],
                  [DANGER, DANGER_BG, String(payments.filter((payment) => payment.status === "LATE").length), "Late"]].map(([c, bg, val, lbl]) => (
                  <View key={lbl as string} style={[s.statCard, { borderColor: `${c}30`, backgroundColor: bg as string }]}>
                    <Text style={[s.statVal, { color: c as string }]}>{val}</Text>
                    <Text style={s.statLbl}>{lbl}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>

            <FadeIn delay={150}>
              <View style={s.card}>
                <Text style={s.cardTitle}>Pay your landlord with UPI</Text>
                {lease?.landlord?.upiId ? (
                  <>
                    <Text style={s.upiPayee}>{lease.landlord.fullName}</Text>
                    <Text style={s.upiId}>{lease.landlord.upiId}</Text>
                    <Text style={s.refHint}>
                      Pay Now opens the UPI app chooser on your device. Choose Google Pay, CRED, PhonePe, Paytm, or another installed UPI app; the rent amount and any applicable approved electricity charge will be prefilled.
                    </Text>
                    {lease.landlord.hasUpiQr ? (
                      <Image
                        source={{
                          uri: `${API_URL}/api/renter/payment-details/qr`,
                          headers: { Authorization: `Bearer ${qrAuthToken}` },
                        }}
                        resizeMode="contain"
                        style={s.renterQr}
                      />
                    ) : null}
                  </>
                ) : (
                  <Text style={s.refHint}>Your landlord has not added a UPI ID yet. Ask them to set it up in their profile.</Text>
                )}
              </View>
            </FadeIn>

            <FadeIn delay={290}>
              <View style={s.card}>
                <Text style={s.cardTitle}>Recent Payments</Text>
                {dataLoading ? <ActivityIndicator color={ACCENT_LIGHT} /> : dataError ? (
                  <Text style={{ color: DANGER, fontSize: 13 }}>{dataError}</Text>
                ) : payments.length === 0 ? (
                  <Text style={{ color: WHITE_40, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>No payment history yet</Text>
                ) : payments.slice(0, 3).map((p, i) => (
                  <View key={p._id} style={[s.histRow, i > 0 && s.bt]}>
                    <View style={[s.histIcon, { backgroundColor: p.status === "LATE" ? DANGER_BG : p.status === "PAID" ? SUCCESS_BG : WARNING_BG }]}><Text style={{ fontSize: 14 }}>{p.status === "LATE" ? "⚠️" : p.status === "PAID" ? "✅" : "⏳"}</Text></View>
                    <View style={{ flex: 1 }}><Text style={s.histMonth}>{p.period ?? new Date(p.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text><Text style={s.histDate}>{new Date(p.paidAt ?? p.createdAt).toLocaleDateString("en-IN")}</Text></View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={s.histAmt}>₹{p.amount.toLocaleString("en-IN")}</Text>
                      <View style={[s.badge, { backgroundColor: `${scColor(p.status)}22` }]}><Text style={[s.badgeTxt, { color: scColor(p.status) }]}>{p.status}</Text></View>
                    </View>
                  </View>
                ))}
              </View>
            </FadeIn>
          </>}

          {step === "confirm" && <>
            <FadeIn delay={0}>
              <View style={s.card}>
                <Text style={s.cardTitle}>Payment Summary</Text>
                {[["Payee",quote?.payeeName ?? "Your Landlord"],
                  ["UPI ID",quote?.upiId ?? lease?.landlord?.upiId ?? "—"],
                  ["Period",quote?.period ?? period],
                  ["Current monthly rent",`₹${(lease?.monthlyRent ?? 0).toLocaleString("en-IN")}`],
                  ["Outstanding before payment",`₹${(quote?.outstanding ?? rentBalance?.outstanding ?? 0).toLocaleString("en-IN")}`],
                  ...((quote?.electricityCharge ?? rentBalance?.totalElectricityDue ?? electricityCharge) > 0
                    ? [["Approved electricity charges",`₹${(quote?.electricityCharge ?? rentBalance?.totalElectricityDue ?? electricityCharge).toLocaleString("en-IN")}`]]
                    : []),
                  ["This payment",`₹${(quote?.amount ?? requestedPaymentAmount).toLocaleString("en-IN")}`]].map(([l, v], i) => (
                  <View key={l} style={[s.confRow, i > 0 && s.bt]}>
                    <Text style={s.confLbl}>{l}</Text>
                    <Text style={[s.confVal, l === "This payment" && { color: WARNING, fontSize: 17, fontWeight: "800" }]}>{v}</Text>
                  </View>
                ))}
                <Text style={[s.refHint, { marginTop: 12 }]}>Enter the UPI transaction reference if the app shows one. Your landlord will verify the payment manually.</Text>
                <TextInput
                  value={ref}
                  onChangeText={setRef}
                  placeholder="UPI transaction reference"
                  placeholderTextColor={WHITE_40}
                  autoCapitalize="none"
                  style={s.referenceInput}
                />
              </View>
            </FadeIn>
            <FadeIn delay={80}>
              <View style={s.secureBox}>
                <Text style={{ fontSize: 16 }}>ℹ️</Text>
                <Text style={s.secureTxt}>Only submit this request after you have completed the UPI transfer. The payment stays pending until your landlord confirms receipt.</Text>
              </View>
            </FadeIn>
          </>}

          {payError ? (
            <View style={{ paddingHorizontal: 4, marginBottom: 4 }}>
              <Text style={{ color: "#F87171", fontSize: 12, textAlign: "center" }}>{payError}</Text>
            </View>
          ) : null}

          <FadeIn delay={step === "confirm" ? 140 : 350}>
            <Animated.View style={btnStyle}>
              <TouchableOpacity
                style={[s.payBtn, { backgroundColor: step === "confirm" ? SUCCESS : WARNING }, busy && { opacity: 0.65 }]}
                onPress={step === "select" ? startUpiPayment : pay}
                activeOpacity={0.85}
                disabled={busy || (step === "select" && !canPay)}
              >
                <Text style={s.payTxt}>
                  {busy ? step === "confirm" ? "Saving…" : "Opening UPI apps…" : step === "confirm" ? "I’ve paid — notify landlord" : `Pay Now · ₹${requestedPaymentAmount.toLocaleString("en-IN")}`}
                </Text>
              </TouchableOpacity>
            </Animated.View>
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
  dueBanner: { backgroundColor: `${WARNING}18`, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: `${WARNING}30`, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dueLabel: { fontSize: 10, fontWeight: "700", color: WARNING, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  dueAmt: { fontSize: 36, fontWeight: "800", color: WHITE, marginBottom: 4 },
  dueSub: { fontSize: 12, color: WHITE_72 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  balanceLabel: { color: WHITE_72, fontSize: 12, flex: 1 },
  balanceValue: { color: WHITE, fontSize: 13, fontWeight: "700" },
  amountInputLabel: { color: WHITE_72, fontSize: 12, fontWeight: "600", marginBottom: 7 },
  daysRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 5, borderColor: WARNING, alignItems: "center", justifyContent: "center", marginLeft: 16 },
  daysNum: { fontSize: 22, fontWeight: "800", color: WHITE, lineHeight: 26 },
  daysLbl: { fontSize: 9, color: WHITE_40, letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 18, fontWeight: "800" },
  statLbl: { fontSize: 10, color: WHITE_40, textAlign: "center" },
  upiPayee: { color: WHITE, fontSize: 15, fontWeight: "700", marginBottom: 3 },
  upiId: { color: TEAL, fontSize: 13, fontWeight: "600", marginBottom: 10 },
  renterQr: { width: 190, height: 190, alignSelf: "center", marginVertical: 8, backgroundColor: WHITE, borderRadius: 12 },
  refHint: { fontSize: 12, color: WHITE_40, marginBottom: 12, lineHeight: 17 },
  meterInput: { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE, marginBottom: 10 },
  photoButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: ACCENT_LIGHT, alignItems: "center", justifyContent: "center", marginBottom: 10, paddingHorizontal: 10 },
  photoButtonText: { color: ACCENT_LIGHT, fontSize: 12, fontWeight: "700" },
  submitReadingButton: { minHeight: 46, borderRadius: 12, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  submitReadingText: { color: WHITE, fontSize: 13, fontWeight: "700" },
  readingStatus: { backgroundColor: `${TEAL}18`, borderRadius: 12, padding: 12 },
  readingStatusTitle: { color: WHITE, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  readingStatusText: { color: WHITE_72, fontSize: 12, lineHeight: 18 },
  rejectionText: { color: DANGER, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  billBreakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: WHITE_15, gap: 6 },
  billRow: { color: WHITE_72, fontSize: 12 },
  billTotal: { color: SUCCESS, fontSize: 14, fontWeight: "800", marginTop: 2 },
  referenceInput: { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE },
  histRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  histIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  histMonth: { fontSize: 13, fontWeight: "600", color: WHITE, marginBottom: 2 },
  histDate: { fontSize: 11, color: WHITE_40 },
  histAmt: { fontSize: 13, fontWeight: "700", color: WHITE },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  confRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11 },
  confLbl: { fontSize: 13, color: WHITE_40 },
  confVal: { fontSize: 13, fontWeight: "600", color: WHITE },
  secureBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: `${TEAL}12`, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${TEAL}25` },
  secureTxt: { fontSize: 12, color: WHITE_72, flex: 1, lineHeight: 18 },
  payBtn: { borderRadius: 16, height: 56, alignItems: "center", justifyContent: "center" },
  payTxt: { fontSize: 16, fontWeight: "800", color: WHITE, letterSpacing: 0.4 },
  succRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  succCard: { width: "100%", backgroundColor: WHITE_08, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: WHITE_15, alignItems: "center" },
  succIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: SUCCESS_BG, borderWidth: 2, borderColor: SUCCESS, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  succIconTxt: { fontSize: 32, color: SUCCESS },
  succTitle: { fontSize: 24, fontWeight: "800", color: WHITE, marginBottom: 6 },
  succSub: { fontSize: 14, color: WHITE_72, marginBottom: 24 },
  succDetail: { width: "100%", backgroundColor: WHITE_05, borderRadius: 14, padding: 16 },
  succRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: WHITE_08 },
  succLbl: { fontSize: 13, color: WHITE_40 },
  succVal: { fontSize: 13, fontWeight: "600", color: WHITE },
  doneBtn: { marginTop: 24, backgroundColor: SUCCESS, borderRadius: 14, height: 52, width: "100%", alignItems: "center", justifyContent: "center" },
  doneTxt: { fontSize: 15, fontWeight: "800", color: WHITE },
});
