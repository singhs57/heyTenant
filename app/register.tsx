import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Platform, StatusBar,
  type TextInputInstance,
  useWindowDimensions, ActivityIndicator, Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
// useSignUp must come from @clerk/expo/legacy — it returns the legacy
// { isLoaded, signUp, setActive } shape needed for custom sign-up flows.
// The non-legacy useSignUp from @clerk/expo returns a Signal-based API
// { errors, fetchStatus, signUp } with no isLoaded or setActive — that is
// only for Clerk's prebuilt components, not custom flows.
// useAuth stays on the main path; it is a separate hook with no conflict.
import { useSignUp } from "@clerk/expo/legacy";
import { useAuth } from "@clerk/expo";
import { syncUserWithDB, validateLandlordCode } from "../constants/api";

// ─── Palette ────────────────────────────────────────────────────────────────
const BRAND_BLUE = "#1A3C5E";
const ACCENT     = "#4A90D9";
const LANDLORD_C = "#3B6FA8";
const SUCCESS    = "#22C55E";
const WARNING    = "#F59E0B";
const ERROR_RED  = "#F87171";
const WHITE      = "#FFFFFF";
const WHITE_72   = "rgba(255,255,255,0.72)";
const WHITE_40   = "rgba(255,255,255,0.40)";
const WHITE_15   = "rgba(255,255,255,0.15)";
const WHITE_08   = "rgba(255,255,255,0.08)";

type Role = "landlord" | "renter";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string) {
  const value = v.trim();
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
}

// Split a full name into firstName / lastName for Clerk
function splitName(full: string): { firstName: string; lastName?: string } {
  const parts     = full.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName  = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return { firstName, lastName };
}

// Normalise Clerk error messages for display
function clerkMsg(err: unknown): string {
  const e = err as any;
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    "Something went wrong. Please try again."
  );
}

// ─── Step progress bar ───────────────────────────────────────────────────────
function StepBar({ total, current, color }: { total: number; current: number; color: string }) {
  return (
    <View style={sb.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[sb.seg, { backgroundColor: i < current ? color : WHITE_15 }]} />
      ))}
    </View>
  );
}
const sb = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, marginBottom: 22 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
});

// ─── OTP Box Row ─────────────────────────────────────────────────────────────
function OtpInput({
  value, onChange, accent,
}: { value: string; onChange: (v: string) => void; accent: string }) {
  const inputRef = useRef<TextInputInstance>(null);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  // Focus the hidden input on mount (delayed so the slide-in animation finishes first)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    // Outer touchable so tapping anywhere on the OTP area re-opens the keyboard
    <TouchableOpacity
      style={otp.wrapper}
      onPress={() => inputRef.current?.focus()}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel="Enter 6-digit email verification code"
    >
      <TextInput
        ref={inputRef}
        style={otp.hidden}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        caretHidden
        showSoftInputOnFocus
        accessibilityLabel="Email verification code"
      />
      <View style={otp.row}>
        {digits.map((d, i) => (
          <View
            key={i}
            style={[
              otp.box,
              value.length === i && otp.boxActive,
              d ? { borderColor: accent, backgroundColor: "rgba(74,144,217,0.10)" } : undefined,
            ]}
          >
            <Text style={otp.digit}>{d}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}
const otp = StyleSheet.create({
  wrapper:   { alignItems: "center", width: "100%", marginBottom: 8 },
  hidden:    { position: "absolute", opacity: 0, width: 1, height: 1 },
  row:       { flexDirection: "row", gap: 8, width: "100%", maxWidth: 338 },
  box:       { flex: 1, minWidth: 0, height: 58, borderRadius: 12, borderWidth: 2, borderColor: WHITE_15,
               backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  boxActive: { borderColor: ACCENT, borderWidth: 2 },
  digit:     { fontSize: 24, fontWeight: "800", color: WHITE, letterSpacing: 1 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const router    = useRouter();
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const kavOffset = Platform.OS === "android" ? insets.top : 0;

  const { signUp, setActive, isLoaded } = useSignUp();
  const { getToken } = useAuth();

  // Guard against calling state setters on an unmounted component.
  // animForm uses a 155 ms setTimeout; if navigation fires before it resolves
  // (e.g. renter OTP success → router.replace) the callback would run after
  // the component has unmounted, causing a React state-update-on-unmounted
  // component warning and potentially another hooks count mismatch.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const [role, setRole] = useState<Role>("landlord");
  const [step, setStep] = useState(1);

  // Personal fields
  const [fullName,    setFN]   = useState("");
  const [username,    setUN]   = useState("");
  const [email,       setEM]   = useState("");
  const [phone,       setPhone] = useState("");
  const [password,    setPW]   = useState("");
  const [confirmPass, setCP]   = useState("");
  const [passVis,     setPVis] = useState(false);
  const [confVis,     setCVis] = useState(false);

  // Email verification (Clerk OTP)
  const [otpValue,     setOtpValue]  = useState("");
  const [otpStatus,    setOtpStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [otpCountdown, setCountdown] = useState(0);
  const [verifiedClerkId, setVerifiedClerkId] = useState<string | null>(null);

  // Landlord success-code display
  const [generatedCode, setCode]   = useState("");
  const [copied,        setCopied] = useState(false);

  // Renter landlord-key state
  const [landlordKey, setLK] = useState("");
  const [keyStatus,   setKS] = useState<"idle" | "checking" | "valid" | "invalid">("idle");

  const [focused,     setFoc] = useState<string | null>(null);
  const [errors,      setErr] = useState<Record<string, string>>({});
  const [submitting,  setSub] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Animations ───────────────────────────────────────────────────────────
  const pillX  = useSharedValue(0);
  const pageOp = useSharedValue(0);
  const pageTY = useSharedValue(24);
  const formOp = useSharedValue(0);
  const formTY = useSharedValue(16);

  useEffect(() => {
    pageOp.value = withTiming(1, { duration: 500 });
    pageTY.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
    formOp.value = withDelay(200, withTiming(1, { duration: 500 }));
    formTY.value = withDelay(200, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  // OTP countdown ticker
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  const pageStyle = useAnimatedStyle(() => ({ opacity: pageOp.value, transform: [{ translateY: pageTY.value }] }));
  const formStyle = useAnimatedStyle(() => ({ opacity: formOp.value, transform: [{ translateY: formTY.value }] }));
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }));

  const animForm = (cb: () => void) => {
    formOp.value = withTiming(0, { duration: 140 });
    formTY.value = withTiming(10, { duration: 140 });
    setTimeout(() => {
      if (!isMounted.current) return;
      cb();
      formOp.value = withTiming(1, { duration: 350 });
      formTY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    }, 155);
  };

  const accent = role === "landlord" ? LANDLORD_C : ACCENT;

  const switchRole = (next: Role) => {
    if (next === role) return;
    animForm(() => { setRole(next); setStep(1); clearAll(); });
    const trackInnerWidth = (width - 48 - 8) / 2;
    pillX.value = withSpring(next === "landlord" ? 0 : trackInnerWidth, { damping: 18, stiffness: 200, mass: 0.8 });
  };

  const clearAll = () => {
    setFN(""); setUN(""); setEM(""); setPhone(""); setPW(""); setCP("");
    setLK(""); setKS("idle"); setErr({}); setSubmitError("");
    setPVis(false); setCVis(false);
    setOtpValue(""); setOtpStatus("idle"); setCountdown(0);
    setVerifiedClerkId(null);
    setCode(""); setCopied(false);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validatePersonal = (): boolean => {
    const e: Record<string, string> = {};
    if (!fullName.trim())                           e.fullName = "Full name is required.";
    if (!username.trim())                           e.username = "Username is required.";
    else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim()))
                                                    e.username = "3–20 chars, letters, numbers and underscores only.";
    if (!isValidEmail(email))                       e.email       = "Enter a valid email address.";
    if (!isValidPhone(phone))                       e.phone       = "Enter a valid phone number (7–15 digits).";
    if (!password)                                  e.password    = "Password is required.";
    if (password !== confirmPass)                   e.confirmPass = "Passwords do not match.";
    setErr(e);
    return Object.keys(e).length === 0;
  };

  // ── Create Clerk sign-up + send verification email ──────────────────────────
  // Called from landlord step 1 and renter step 2 — next step is always the OTP screen.
  const handleStep1 = async () => {
    if (!validatePersonal()) return;
    // isLoaded is false during Clerk initialisation AND after setActive completes
    // (Clerk v4: sign-up is unavailable when a session already exists). In both
    // cases we simply block silently — the button is already visually disabled
    // via `submitting`. Never show a user-visible error for this internal state.
    if (!isLoaded || !signUp) return;
    setSub(true);
    setErr({});
    setSubmitError("");
    try {
      const { firstName, lastName } = splitName(fullName);
      await signUp!.create({
        firstName,
        ...(lastName ? { lastName } : {}),
        username: username.trim().toLowerCase(),
        emailAddress: email.trim().toLowerCase(),
        password,
        unsafeMetadata: {
          role,
          phone: phone.trim(),
          ...(role === "renter" ? { landlordCode: landlordKey } : {}),
        },
      });
      await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      setCountdown(60);
      animForm(() => setStep(role === "landlord" ? 2 : 3));
    } catch (err: any) {
      // Surface field-specific errors under the relevant field,
      // and everything else in the banner above the button.
      const msg = clerkMsg(err);
      const code = err?.errors?.[0]?.code ?? "";
      if (code === "form_identifier_exists" || code.includes("email")) {
        setErr({ email: msg });
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSub(false);
    }
  };

  const finishDatabaseRegistration = async (clerkId: string) => {
    const registeredUser = await syncUserWithDB(
      () => getToken(),
      {
        clerkId,
        fullName,
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role: role === "landlord" ? "LANDLORD" : "RENTER",
        ...(role === "renter" ? { landlordCode: landlordKey.toUpperCase() } : {}),
      }
    );

    if (role === "landlord") {
      if (!registeredUser.landlordCode) {
        throw new Error("Your account was created, but the server did not return a landlord code. Retry account setup.");
      }
      setCode(registeredUser.landlordCode);
      animForm(() => setStep(3));
    } else {
      setTimeout(() => router.replace("/renter/dashboard"), 0);
    }
  };

  // ── STEP 2 → Verify the Clerk email code ────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (verifiedClerkId) {
      setOtpStatus("verifying");
      setErr({});
      try {
        await finishDatabaseRegistration(verifiedClerkId);
        setOtpStatus("verified");
      } catch (err) {
        setOtpStatus("error");
        setErr({ otp: clerkMsg(err) });
      }
      return;
    }

    if (otpValue.length < 6) { setErr({ otp: "Enter the full 6-digit code." }); return; }
    if (!isLoaded) return;
    setOtpStatus("verifying");
    setErr({});
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code: otpValue });
      if (result.status === "complete") {
        // Activate the new session immediately
        await setActive!({ session: result.createdSessionId });
        const clerkId = result.createdUserId ?? signUp?.createdUserId ?? "";
        if (!clerkId) throw new Error("Could not determine the verified Clerk account. Please retry.");
        setVerifiedClerkId(clerkId);
        await finishDatabaseRegistration(clerkId);
        setOtpStatus("verified");
      } else {
        // result.status === "missing_requirements" means Clerk still needs more
        // fields before the sign-up can be completed (e.g. phone number required
        // in the Dashboard).
        const missing = (result as any).missingFields ?? [];
        setOtpStatus("error");
        if (missing.length > 0) {
          setErr({ otp: `Additional info required: ${missing.join(", ")}. Please contact support.` });
        } else {
          setErr({ otp: "Email verified but sign-up could not be completed. Please check your Clerk dashboard configuration." });
        }
      }
    } catch (err) {
      setOtpStatus("error");
      setErr({ otp: clerkMsg(err) });
    }
  };

  // ── Resend code via Clerk ────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (verifiedClerkId || otpCountdown > 0 || !isLoaded) return;
    setOtpValue("");
    setOtpStatus("idle");
    setErr({});
    setCountdown(60);
    try {
      await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (err) {
      setOtpStatus("error");
      setErr({ otp: clerkMsg(err) });
    }
  };

  // ── Renter flow ──────────────────────────────────────────────────────────────
  const handleRenterStep1 = async () => {
    if (landlordKey.length < 6) {
      setErr({ landlordKey: "Enter the full 6-character landlord code." });
      return;
    }
    setErr({});
    setKS("checking");
    try {
      await validateLandlordCode(landlordKey);
      setKS("valid");
      animForm(() => setStep(2));
    } catch (err) {
      setKS("invalid");
      setErr({ landlordKey: clerkMsg(err) });
    }
  };

  const handleCopy = () => {
    Clipboard.setString(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ─── Field renderer ──────────────────────────────────────────────────────────
  const fld = (
    label: string, icon: string, fk: string, val: string,
    onChange: (v: string) => void,
    opts: {
      ph?: string; secure?: boolean; vis?: boolean; togVis?: () => void;
      kb?: "default" | "email-address" | "phone-pad"; caps?: "none" | "words";
    } = {}
  ) => (
    <View style={s.fg} key={fk}>
      <Text style={s.fl}>{label}</Text>
      <View style={[s.iw, focused === fk && s.iFoc, !!errors[fk] && s.iErr]}>
        <Text style={s.iIc}>{icon}</Text>
        <TextInput
          style={s.inp}
          placeholder={opts.ph ?? ""}
          placeholderTextColor={WHITE_40}
          secureTextEntry={opts.secure && !opts.vis}
          keyboardType={opts.kb ?? "default"}
          autoCapitalize={opts.caps ?? "sentences"}
          autoCorrect={false}
          value={val}
          onChangeText={onChange}
          onFocus={() => setFoc(fk)}
          onBlur={() => setFoc(null)}
          selectionColor={accent}
        />
        {opts.secure && (
          <TouchableOpacity onPress={opts.togVis} activeOpacity={0.7} style={s.eye}>
            <Text style={[s.eyeTxt, { color: accent }]}>{opts.vis ? "Hide" : "Show"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {errors[fk] ? <Text style={s.errTxt}>⚠ {errors[fk]}</Text> : null}
    </View>
  );

  const personalForm = () => (<>
    {fld("Full name",        "👤", "fullName",    fullName,    setFN,  { ph: "Your full name", caps: "words" })}
    {fld("Username",         "@",  "username",    username,    setUN,  { ph: "e.g. john_doe", caps: "none" })}
    {fld("Email address",    "✉",  "email",       email,       setEM,  { ph: role === "landlord" ? "landlord@example.com" : "renter@example.com", kb: "email-address", caps: "none" })}
    {fld("Phone number",     "☎",  "phone",       phone,       setPhone, { ph: "Include country code if applicable", kb: "phone-pad", caps: "none" })}
    {fld("Password",         "🔒", "password",    password,    setPW,  { ph: "Enter a password", secure: true, vis: passVis, togVis: () => setPVis(v => !v), caps: "none" })}
    {fld("Confirm password", "🔒", "confirmPass", confirmPass, setCP,  { ph: "Re-enter password", secure: true, vis: confVis, togVis: () => setCVis(v => !v), caps: "none" })}
  </>);

  const content = () => {

    // ── LANDLORD STEP 1: Personal details ─────────────────────────────────────
    if (role === "landlord" && step === 1) return (<>
      <View style={[s.chip, { backgroundColor: "rgba(59,111,168,0.15)", borderColor: LANDLORD_C + "44" }]}>
        <View style={[s.chipDot, { backgroundColor: LANDLORD_C }]} />
        <Text style={[s.chipTxt, { color: LANDLORD_C }]}>Property owner account</Text>
      </View>
      <Text style={s.sh}>Your details</Text>
      <Text style={s.ss}>
        Fill in your information. You'll then verify your email with a one-time code before your account is created.
      </Text>
      {personalForm()}
      {!!submitError && <Text style={s.submitErr}>⚠ {submitError}</Text>}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: LANDLORD_C }, submitting && s.btnOff]}
        onPress={handleStep1}
        activeOpacity={0.88}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color={WHITE} />
          : <Text style={s.btnTxt}>Continue — Verify Email  →</Text>}
      </TouchableOpacity>
    </>);

    // ── LANDLORD STEP 2: Email OTP verification ────────────────────────────────
    if (role === "landlord" && step === 2) return (<>
      <View style={[s.chip, { backgroundColor: "rgba(59,111,168,0.15)", borderColor: LANDLORD_C + "44" }]}>
        <View style={[s.chipDot, { backgroundColor: LANDLORD_C }]} />
        <Text style={[s.chipTxt, { color: LANDLORD_C }]}>Email verification</Text>
      </View>
      <Text style={s.sh}>Check your inbox</Text>
      <Text style={s.ss}>
        {verifiedClerkId
          ? "Your email is verified. Finish setting up your account below."
          : <>We sent a 6-digit verification code to{"\n"}
        <Text style={{ color: WHITE, fontWeight: "700" }}>{email}</Text>.{"\n"}
        Enter it below to confirm it's really you.</>}
      </Text>
      <View style={s.fg}>
        {!verifiedClerkId && <>
          <Text style={s.fl}>Verification code</Text>
          <OtpInput
            value={otpValue}
            onChange={(v) => { setOtpValue(v); setOtpStatus("idle"); setErr({}); }}
            accent={LANDLORD_C}
          />
        </>}
        {errors.otp
          ? <Text style={[s.errTxt, { textAlign: "center", marginTop: 8 }]}>⚠ {errors.otp}</Text>
          : verifiedClerkId || otpStatus === "verified"
          ? <Text style={[s.okTxt, { textAlign: "center", marginTop: 8 }]}>✓  Email verified</Text>
          : null}
      </View>
      {!verifiedClerkId && <View style={s.resendRow}>
        <Text style={s.resendHint}>Didn't receive it?  </Text>
        <TouchableOpacity onPress={handleResendOtp} disabled={otpCountdown > 0} activeOpacity={0.7}>
          <Text style={[s.resendLink, otpCountdown > 0 && { color: WHITE_40 }]}>
            {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: LANDLORD_C }, otpStatus === "verifying" && s.btnOff]}
        onPress={handleVerifyOtp}
        activeOpacity={0.88}
        disabled={otpStatus === "verifying"}
      >
        {otpStatus === "verifying"
          ? <ActivityIndicator color={WHITE} />
          : <Text style={s.btnTxt}>{verifiedClerkId ? "Retry Account Setup  →" : "Verify &amp; Create Account  →"}</Text>}
      </TouchableOpacity>
      {!verifiedClerkId && <Text style={[s.kHint, { marginTop: 16 }]}>
        Wrong email?{" "}
        <Text style={{ color: LANDLORD_C, fontWeight: "600" }} onPress={() => animForm(() => setStep(1))}>
          Go back
        </Text>{" "}to correct it.
      </Text>}
    </>);

    // ── LANDLORD STEP 3: Success + unique landlord code ───────────────────────
    if (role === "landlord" && step === 3) return (<>
      <View style={s.successWrap}><Text style={s.successEmoji}>🎉</Text></View>
      <Text style={s.sh}>Account Created!</Text>
      <Text style={s.ss}>
        Your landlord account is live. Below is your unique 6-character Landlord Code — share it with your tenants so they can link their accounts to your property.
      </Text>
      <TouchableOpacity style={[s.keyCard, { borderColor: LANDLORD_C }]} onPress={handleCopy} activeOpacity={0.75}>
        <Text style={s.kcLabel}>YOUR LANDLORD CODE</Text>
        <Text style={[s.kcVal, { color: LANDLORD_C }]}>{generatedCode}</Text>
        <View style={s.kcDiv} />
        <Text style={[s.kcCopy, { color: copied ? SUCCESS : WHITE_40 }]}>
          {copied ? "✓  Copied to clipboard!" : "Tap to copy"}
        </Text>
      </TouchableOpacity>
      {[
        { i: "🔗", t: "Every tenant who registers with this code is automatically linked to your landlord account." },
        { i: "🔔", t: "You'll receive a notification each time a tenant uses your code to join." },
        { i: "🔄", t: "You can regenerate this code anytime from your dashboard if it is ever compromised." },
      ].map(({ i, t }) => (
        <View key={i} style={s.infoRow}>
          <Text style={s.infoIc}>{i}</Text>
          <Text style={s.infoTxt}>{t}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: LANDLORD_C, marginTop: 20 }]}
        onPress={() => router.replace("/landlord/dashboard")}
        activeOpacity={0.88}
      >
        <Text style={s.btnTxt}>Go to Dashboard</Text>
      </TouchableOpacity>
    </>);

    // ── RENTER STEP 1: Landlord code ──────────────────────────────────────────
    if (role === "renter" && step === 1) return (<>
      <View style={[s.chip, { backgroundColor: "rgba(74,144,217,0.12)", borderColor: ACCENT + "44" }]}>
        <View style={[s.chipDot, { backgroundColor: ACCENT }]} />
        <Text style={[s.chipTxt, { color: ACCENT }]}>Tenant account</Text>
      </View>
      <Text style={s.sh}>Enter landlord code</Text>
      <Text style={s.ss}>
        Your landlord will have shared a 6-character invite code with you. Enter it to link your account to their property.
      </Text>
      <View style={s.fg}>
        <Text style={s.fl}>Landlord invite code</Text>
        <View style={[s.iw, focused === "lk" && s.iFoc, !!errors.landlordKey && s.iErr, keyStatus === "valid" && s.iOk]}>
          <Text style={s.iIc}>🔑</Text>
          <TextInput
            style={[s.inp, s.keyInp]}
            placeholder="e.g.  A3KX9P"
            placeholderTextColor={WHITE_40}
            value={landlordKey}
            onChangeText={v => { setLK(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); setKS("idle"); setErr({}); }}
            onFocus={() => setFoc("lk")}
            onBlur={() => setFoc(null)}
            autoCapitalize="characters"
            autoCorrect={false}
            selectionColor={ACCENT}
            maxLength={6}
          />
          {keyStatus === "checking" && <ActivityIndicator color={ACCENT} size="small" />}
          {keyStatus === "valid"    && <Text style={s.okIc}>✓</Text>}
          {keyStatus === "invalid"  && <Text style={s.errIc}>✗</Text>}
        </View>
        {errors.landlordKey
          ? <Text style={s.errTxt}>⚠ {errors.landlordKey}</Text>
          : keyStatus === "valid"
          ? <Text style={s.okTxt}>✓  Code accepted — proceeding to registration.</Text>
          : null}
      </View>
      <View style={s.kbRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[s.kb, landlordKey[i] && { borderColor: ACCENT, backgroundColor: "rgba(74,144,217,0.13)" }]}>
            <Text style={s.kbC}>{landlordKey[i] ?? ""}</Text>
          </View>
        ))}
      </View>
      <Text style={s.kHint}>Don't have a code? Ask your landlord to share their heyTenant invite code.</Text>
      <TouchableOpacity
        style={[s.btn, { backgroundColor: keyStatus === "valid" ? ACCENT : "rgba(74,144,217,0.38)" }]}
        onPress={handleRenterStep1}
        activeOpacity={0.88}
      >
        <Text style={s.btnTxt}>Verify &amp; Continue  →</Text>
      </TouchableOpacity>
    </>);

    // ── RENTER STEP 2: Personal details ───────────────────────────────────────
    if (role === "renter" && step === 2) return (<>
      <View style={s.linkedBadge}>
        <Text style={s.lbIc}>🔗</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.lbTitle, { color: SUCCESS }]}>Landlord code verified</Text>
          <Text style={s.lbSub}>Your account will be linked to code <Text style={s.lbKey}>{landlordKey}</Text></Text>
        </View>
      </View>
      <Text style={s.sh}>Your details</Text>
      <Text style={s.ss}>Complete your profile to finish creating your tenant account.</Text>
      {personalForm()}
      {!!submitError && <Text style={s.submitErr}>⚠ {submitError}</Text>}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: ACCENT }, submitting && s.btnOff]}
        onPress={handleStep1}
        activeOpacity={0.88}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color={WHITE} />
          : <Text style={s.btnTxt}>Continue — Verify Email  →</Text>}
      </TouchableOpacity>
    </>);

    // ── RENTER STEP 3: Email OTP verification ─────────────────────────────────
    if (role === "renter" && step === 3) return (<>
      <View style={[s.chip, { backgroundColor: "rgba(74,144,217,0.12)", borderColor: ACCENT + "44" }]}>
        <View style={[s.chipDot, { backgroundColor: ACCENT }]} />
        <Text style={[s.chipTxt, { color: ACCENT }]}>Email verification</Text>
      </View>
      <Text style={s.sh}>Check your inbox</Text>
      <Text style={s.ss}>
        {verifiedClerkId
          ? "Your email is verified. Finish setting up your account below."
          : <>We sent a 6-digit verification code to{"\n"}
        <Text style={{ color: WHITE, fontWeight: "700" }}>{email}</Text>.{"\n"}
        Enter it below to confirm it's really you.</>}
      </Text>
      <View style={s.fg}>
        {!verifiedClerkId && <>
          <Text style={s.fl}>Verification code</Text>
          <OtpInput
            value={otpValue}
            onChange={(v) => { setOtpValue(v); setOtpStatus("idle"); setErr({}); }}
            accent={ACCENT}
          />
        </>}
        {errors.otp
          ? <Text style={[s.errTxt, { textAlign: "center", marginTop: 8 }]}>⚠ {errors.otp}</Text>
          : verifiedClerkId || otpStatus === "verified"
          ? <Text style={[s.okTxt, { textAlign: "center", marginTop: 8 }]}>✓  Email verified</Text>
          : null}
      </View>
      {!verifiedClerkId && <View style={s.resendRow}>
        <Text style={s.resendHint}>Didn't receive it?  </Text>
        <TouchableOpacity onPress={handleResendOtp} disabled={otpCountdown > 0} activeOpacity={0.7}>
          <Text style={[s.resendLink, otpCountdown > 0 && { color: WHITE_40 }]}>
            {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: ACCENT }, otpStatus === "verifying" && s.btnOff]}
        onPress={handleVerifyOtp}
        activeOpacity={0.88}
        disabled={otpStatus === "verifying"}
      >
        {otpStatus === "verifying"
          ? <ActivityIndicator color={WHITE} />
          : <Text style={s.btnTxt}>{verifiedClerkId ? "Retry Account Setup  →" : "Verify &amp; Create Account  →"}</Text>}
      </TouchableOpacity>
      {!verifiedClerkId && <Text style={[s.kHint, { marginTop: 16 }]}>
        Wrong email?{" "}
        <Text style={{ color: ACCENT, fontWeight: "600" }} onPress={() => animForm(() => setStep(2))}>
          Go back
        </Text>{" "}to correct it.
      </Text>}
    </>);

    return null;
  };

  // Step count: landlord = 3 steps (details → OTP → success), renter = 3 (code → details → OTP)
  const totalSteps  = 3;
  const showStepBar = !(role === "landlord" && step === 3);

  // Back button logic
  const handleBack = () => {
    if (verifiedClerkId) return;
    if (role === "landlord") {
      if (step === 2) animForm(() => setStep(1));
      else router.back();
    } else {
      if (step === 3) animForm(() => setStep(2));
      else if (step === 2) animForm(() => setStep(1));
      else router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={kavOffset}
    >
      <StatusBar barStyle="light-content" />
      <View style={[s.orb1, { width: width * 0.85, height: width * 0.85, borderRadius: (width * 0.85) / 2, top: -width * 0.4, right: -width * 0.28 }]} />
      <View style={[s.orb2, { width: width * 0.55, height: width * 0.55, borderRadius: (width * 0.55) / 2, bottom: width * 0.1, left: -width * 0.2 }]} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom + 16, 36) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={pageStyle}>
          <TouchableOpacity
            style={[s.back, { marginTop: Math.max(insets.top + 12, 44) }]}
            onPress={handleBack}
            activeOpacity={0.7}
            disabled={Boolean(verifiedClerkId)}
          >
            <Text style={s.backArrow}>←</Text>
            <Text style={s.backTxt}>{step > 1 ? "Back" : "Sign in"}</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[s.header, pageStyle]}>
          <View style={[s.logoOut, { backgroundColor: accent }]}>
            <View style={s.logoIn}><Text style={s.logoTxt}>hT</Text></View>
          </View>
          <Text style={s.title}>Create account</Text>
          <Text style={s.subtitle}>Join heyTenant as a landlord or renter</Text>
        </Animated.View>

        {step === 1 && (
          <Animated.View style={[s.tabTrack, pageStyle]}>
            <Animated.View style={[s.tabPill, pillStyle, { backgroundColor: accent }]} />
            {(["landlord", "renter"] as Role[]).map(r => (
              <TouchableOpacity key={r} style={s.tabBtn} onPress={() => switchRole(r)} activeOpacity={0.85}>
                <Text style={[s.tabLbl, role === r && s.tabLblOn]}>
                  {r === "landlord" ? "🏢  Landlord" : "🏠  Renter"}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {showStepBar && (
          <Animated.View style={pageStyle}>
            <StepBar total={totalSteps} current={step} color={accent} />
          </Animated.View>
        )}

        <Animated.View style={formStyle}>{content()}</Animated.View>

        {step === 1 && (
          <Animated.View style={[s.footer, formStyle]}>
            <Text style={s.footerTxt}>
              Already have an account?{" "}
              <Text style={[s.footerLnk, { color: accent }]} onPress={() => router.replace("/login")}>
                Sign in
              </Text>
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: BRAND_BLUE },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  orb1:  { position: "absolute", backgroundColor: "rgba(74,144,217,0.08)" },
  orb2:  { position: "absolute", backgroundColor: "rgba(74,144,217,0.05)" },

  back:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  backArrow: { fontSize: 18, color: WHITE_72 },
  backTxt:   { fontSize: 14, color: WHITE_72 },

  header:   { alignItems: "center", paddingTop: 16, paddingBottom: 28 },
  logoOut:  { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoIn:   { width: 58, height: 58, borderRadius: 14, backgroundColor: WHITE, alignItems: "center", justifyContent: "center" },
  logoTxt:  { fontSize: 22, fontWeight: "800", color: BRAND_BLUE, letterSpacing: -1 },
  title:    { fontSize: 26, fontWeight: "700", color: WHITE, letterSpacing: 0.2, marginBottom: 4 },
  subtitle: { fontSize: 13, color: WHITE_72, letterSpacing: 0.3, textAlign: "center" },

  tabTrack: { flexDirection: "row", backgroundColor: WHITE_08, borderRadius: 14, padding: 4, marginBottom: 20, position: "relative", overflow: "hidden" },
  tabPill:  { position: "absolute", top: 4, left: 4, width: "50%", bottom: 4, borderRadius: 11 },
  tabBtn:   { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabLbl:   { fontSize: 13, fontWeight: "600", color: WHITE_40 },
  tabLblOn: { color: WHITE },

  chip:    { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 18, gap: 7 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 12, fontWeight: "600" },

  sh: { fontSize: 20, fontWeight: "700", color: WHITE, marginBottom: 6 },
  ss: { fontSize: 13, color: WHITE_72, lineHeight: 20, marginBottom: 20 },

  fg:  { marginBottom: 14 },
  fl:  { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  iw:  { flexDirection: "row", alignItems: "center", backgroundColor: WHITE_08, borderWidth: 1, borderColor: WHITE_15, borderRadius: 14, paddingHorizontal: 14, height: 52 },
  iFoc:{ borderColor: ACCENT },
  iErr:{ borderColor: ERROR_RED },
  iOk: { borderColor: SUCCESS },
  iIc: { fontSize: 16, marginRight: 10 },
  inp: { flex: 1, color: WHITE, fontSize: 15, paddingVertical: 0 },
  eye: { paddingHorizontal: 4 },
  eyeTxt: { fontSize: 13, fontWeight: "600" },
  errTxt:    { fontSize: 12, color: ERROR_RED, marginTop: 5 },
  submitErr: {
    fontSize: 13,
    color: ERROR_RED,
    backgroundColor: "rgba(248,113,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    lineHeight: 18,
  },
  okTxt:  { fontSize: 12, color: SUCCESS,   marginTop: 5 },
  okIc:   { fontSize: 16, color: SUCCESS,   marginLeft: 4 },
  errIc:  { fontSize: 16, color: ERROR_RED, marginLeft: 4 },

  keyInp: { letterSpacing: 6, fontWeight: "800", textTransform: "uppercase" },

  kbRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 14 },
  kb:    { width: 40, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: WHITE_15, backgroundColor: WHITE_08, alignItems: "center", justifyContent: "center" },
  kbC:   { fontSize: 18, fontWeight: "800", color: WHITE, letterSpacing: 1 },

  kHint: { fontSize: 12, color: WHITE_40, textAlign: "center", lineHeight: 18, marginBottom: 20 },

  resendRow:  { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 18 },
  resendHint: { fontSize: 13, color: WHITE_40 },
  resendLink: { fontSize: 13, color: ACCENT, fontWeight: "600" },

  btn:    { height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnOff: { opacity: 0.55 },
  btnTxt: { fontSize: 15, fontWeight: "700", color: WHITE, letterSpacing: 0.3 },

  successWrap:  { alignItems: "center", marginBottom: 12 },
  successEmoji: { fontSize: 48 },

  keyCard:  { borderWidth: 1.5, borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 20, backgroundColor: WHITE_08 },
  kcLabel:  { fontSize: 10, color: WHITE_40, letterSpacing: 2, fontWeight: "600", marginBottom: 8 },
  kcVal:    { fontSize: 36, fontWeight: "800", letterSpacing: 8, marginBottom: 12 },
  kcDiv:    { height: 1, width: "100%", backgroundColor: WHITE_15, marginBottom: 12 },
  kcCopy:   { fontSize: 12, fontWeight: "600" },

  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  infoIc:  { fontSize: 18, marginTop: 1 },
  infoTxt: { flex: 1, fontSize: 13, color: WHITE_72, lineHeight: 19 },

  linkedBadge: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(34,197,94,0.10)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", borderRadius: 14, padding: 14, marginBottom: 20 },
  lbIc:        { fontSize: 22 },
  lbTitle:     { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  lbSub:       { fontSize: 12, color: WHITE_72 },
  lbKey:       { fontWeight: "800", color: WHITE },

  footer:    { alignItems: "center", paddingTop: 24, paddingBottom: 8 },
  footerTxt: { fontSize: 13, color: WHITE_40 },
  footerLnk: { fontWeight: "600" },
});
