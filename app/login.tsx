import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
// useSignIn must come from @clerk/expo/legacy — it returns the legacy
// { isLoaded, signIn, setActive } shape needed for custom sign-in flows.
// The non-legacy useSignIn from @clerk/expo returns a Signal-based API with
// no isLoaded or setActive — designed for Clerk's prebuilt components only.
// useSSO and useAuth stay on the main path; they are separate hooks.
import { useSignIn } from "@clerk/expo/legacy";
import { useSSO, useAuth, useClerk } from "@clerk/expo";
import { API_URL } from "../constants/api";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

// Warm up the browser so the OAuth redirect feels instant on Android
WebBrowser.maybeCompleteAuthSession();

// -- Palette
const BRAND_BLUE  = "#1A3C5E";
const ACCENT      = "#4A90D9";
const LANDLORD    = "#3B6FA8";   // slightly deeper accent for Landlord mode
const WHITE       = "#FFFFFF";
const WHITE_72    = "rgba(255,255,255,0.72)";
const WHITE_40    = "rgba(255,255,255,0.40)";
const WHITE_20    = "rgba(255,255,255,0.20)";
const WHITE_15    = "rgba(255,255,255,0.15)";
const WHITE_08    = "rgba(255,255,255,0.08)";

type Role = "renter" | "landlord";

const ROLE_CONFIG: Record<
  Role,
  { label: string; subtitle: string; btnLabel: string; btnColor: string }
> = {
  renter: {
    label:       "Renter",
    subtitle:    "Access your home, raise requests\nand manage your tenancy.",
    btnLabel:    "Sign in as Renter",
    btnColor:    ACCENT,
  },
  landlord: {
    label:       "Landlord",
    subtitle:    "Manage properties, review tenants\nand track maintenance.",
    btnLabel:    "Sign in as Landlord",
    btnColor:    LANDLORD,
  },
};

// TAB_WIDTH computed dynamically inside switchRole using live width from useWindowDimensions

// -- Component
export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const kavOffset = Platform.OS === "android" ? insets.top : 0;

  const [role, setRole] = useState<Role>("renter");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState<"identifier" | "password" | "verificationCode" | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [clientTrustRequired, setClientTrustRequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  // -- Clerk hooks
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken } = useAuth();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signOut } = useClerk();

  // -- Entry animations
  const pageOpacity    = useSharedValue(0);
  const pageTranslateY = useSharedValue(28);
  const formOpacity    = useSharedValue(0);
  const formTranslateY = useSharedValue(20);
  const buttonScale    = useSharedValue(1);
  const orb1Scale      = useSharedValue(0.7);
  const orb2Scale      = useSharedValue(0.7);

  // -- Role-switcher pill indicator
  const pillX = useSharedValue(0);

  useEffect(() => {
    orb1Scale.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
    orb2Scale.value = withDelay(150, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));

    pageOpacity.value    = withTiming(1, { duration: 500 });
    pageTranslateY.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });

    formOpacity.value    = withDelay(250, withTiming(1, { duration: 500 }));
    formTranslateY.value = withDelay(250, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  // -- Switch role
  const switchRole = (next: Role) => {
    if (next === role) return;
    setRole(next);
    setIdentifier("");
    setPassword("");
    setLoginError("");
    setClientTrustRequired(false);
    setVerificationCode("");
    const TAB_WIDTH = (width - 48 - 8) / 2;
    pillX.value = withSpring(next === "renter" ? 0 : TAB_WIDTH, {
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    });

    // Bounce the form content out and back in
    formOpacity.value    = withTiming(0, { duration: 120 }, () => {
      formOpacity.value    = withTiming(1, { duration: 300 });
      formTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    });
    formTranslateY.value = withTiming(8, { duration: 120 });
  };

  // -- Press handlers
  const handlePressIn  = () => { buttonScale.value = withSpring(0.97, { damping: 15, stiffness: 300 }); };
  const handlePressOut = () => { buttonScale.value = withSpring(1,    { damping: 15, stiffness: 300 }); };
  const finishLogin = useCallback(async (sessionId: string | null) => {
    if (!sessionId) throw new Error("Clerk did not create a session.");
    await setActive!({ session: sessionId });

    try {
      const token = await getToken();
      if (token) {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ role: role.toUpperCase() }),
        });
        if (!response.ok) {
          await signOut();
          const body = await response.json().catch(() => null);
          setLoginError(body?.error?.message ?? (role === "landlord"
            ? "This account is not registered as a Landlord."
            : "This account is not registered as a Renter."));
          return;
        }
      }
    } catch {
      // Network failure — still allow navigation rather than hard-blocking.
    }

    router.replace(role === "landlord" ? "/landlord/dashboard" : "/renter/dashboard");
  }, [getToken, role, router, setActive, signOut]);

  const handleLogin = useCallback(async () => {
    if (!isLoaded || !identifier.trim() || !password) {
      setLoginError("Please enter your email or username and password.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await signIn!.create({
        identifier: identifier.trim().toLowerCase(),
        strategy: "password",
        password,
      });
      if (result.status === "complete") {
        await finishLogin(result.createdSessionId);
      } else if (result.status === "needs_client_trust") {
        const emailCodeFactor = result.supportedSecondFactors?.find(
          (factor) => factor.strategy === "email_code",
        );
        if (!emailCodeFactor) {
          setLoginError("This device needs verification, but email-code verification is not enabled for this account.");
          return;
        }
        await signIn!.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setVerificationCode("");
        setClientTrustRequired(true);
        setLoginError("");
      } else {
        setLoginError(`Sign-in requires additional verification (${result.status}). Please contact support.`);
      }
    } catch (err: any) {
      const msg: string =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        "Invalid email, username, or password.";
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  }, [isLoaded, identifier, password, signIn, finishLogin]);

  const handleVerifyClientTrust = useCallback(async () => {
    if (!isLoaded || !verificationCode.trim()) {
      setLoginError("Enter the verification code sent to your email.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await signIn!.attemptSecondFactor({
        strategy: "email_code",
        code: verificationCode.trim(),
      });
      if (result.status === "complete") {
        await finishLogin(result.createdSessionId);
      } else {
        setLoginError(`Verification requires another step (${result.status}).`);
      }
    } catch (err: any) {
      const msg: string = err?.errors?.[0]?.longMessage
        ?? err?.errors?.[0]?.message
        ?? err?.message
        ?? "Unable to verify the code. Please try again.";
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  }, [isLoaded, verificationCode, signIn, finishLogin]);
  const handleBack = () => router.back();

  // -- Google Sign-In via Clerk SSO
  const handleGoogleSignIn = useCallback(async () => {
    try {
      setGoogleLoading(true);

      // Already signed in — just navigate, skip the OAuth flow entirely
      if (isSignedIn) {
        router.replace(role === "landlord" ? "/landlord/dashboard" : "/renter/dashboard");
        return;
      }

      const redirectUrl = Linking.createURL("/");
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace(role === "landlord" ? "/landlord/dashboard" : "/renter/dashboard");
      }
    } catch (err: any) {
      // Clerk throws "You're already signed in." if a session slipped through the guard.
      // Treat it as a successful sign-in rather than a crash.
      const msg: string = err?.message ?? String(err);
      if (msg.toLowerCase().includes("already signed in")) {
        router.replace(role === "landlord" ? "/landlord/dashboard" : "/renter/dashboard");
      } else {
        setLoginError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, isSignedIn, role, router]);

  // -- Animated styles
  const pageStyle = useAnimatedStyle(() => ({
    opacity:   pageOpacity.value,
    transform: [{ translateY: pageTranslateY.value }],
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity:   formOpacity.value,
    transform: [{ translateY: formTranslateY.value }],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb1Scale.value }],
  }));
  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb2Scale.value }],
  }));

  const cfg = ROLE_CONFIG[role];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={kavOffset}
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative orbs -- sized dynamically so they respond to screen changes */}
      <Animated.View style={[styles.orb1, { width: width * 0.9, height: width * 0.9, borderRadius: (width * 0.9) / 2 }, orb1Style]} />
      <Animated.View style={[styles.orb2, { width: width * 0.55, height: width * 0.55, borderRadius: (width * 0.55) / 2 }, orb2Style]} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* -- Back button -- marginTop driven by real status bar / notch inset */}
        <Animated.View style={pageStyle}>
          <TouchableOpacity style={[styles.backBtn, { marginTop: Math.max(insets.top + 12, 44) }]} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* -- Logo + headline */}
        <Animated.View style={[styles.headerSection, pageStyle]}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoInitial}>hT</Text>
            </View>
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>{cfg.subtitle}</Text>
        </Animated.View>

        {/* -- Role switcher pill */}
        <Animated.View style={[styles.tabTrack, pageStyle]}>
          {/* sliding indicator */}
          <Animated.View style={[styles.tabPill, pillStyle]} />

          {(["renter", "landlord"] as Role[]).map((r) => (
            <TouchableOpacity
              key={r}
              style={styles.tabBtn}
              onPress={() => switchRole(r)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, role === r && styles.tabLabelActive]}>
                {r === "renter" ? "🏠  Renter" : "🏢  Landlord"}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* -- Role context chip */}
        <Animated.View style={[styles.roleChipRow, formStyle]}>
          <View style={[styles.roleChip, { backgroundColor: role === "renter" ? "rgba(74,144,217,0.15)" : "rgba(59,111,168,0.15)" }]}>
            <View style={[styles.roleChipDot, { backgroundColor: cfg.btnColor }]} />
            <Text style={[styles.roleChipText, { color: cfg.btnColor }]}>
              {role === "renter" ? "Tenant account" : "Property owner account"}
            </Text>
          </View>
        </Animated.View>

        {/* -- Form */}
        <Animated.View style={[styles.formSection, formStyle]}>
          {!clientTrustRequired ? <>
          {/* Email or username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email or username</Text>
            <View style={[styles.inputWrapper, focused === "identifier" && styles.inputFocused]}>
              <Text style={styles.inputIcon}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="Email or username"
                placeholderTextColor={WHITE_40}
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={(v) => { setIdentifier(v); setLoginError(""); }}
                onFocus={() => setFocused("identifier")}
                onBlur={() => setFocused(null)}
                selectionColor={cfg.btnColor}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={[styles.forgotText, { color: cfg.btnColor }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputWrapper, focused === "password" && styles.inputFocused]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={[styles.input, styles.inputPassword]}
                placeholder="Enter your password"
                placeholderTextColor={WHITE_40}
                secureTextEntry={!passwordVisible}
                value={password}
                onChangeText={(v) => { setPassword(v); setLoginError(""); }}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                selectionColor={cfg.btnColor}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setPasswordVisible((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: cfg.btnColor }]}>
                  {passwordVisible ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          </> : <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Verify this device</Text>
            <Text style={[styles.subtitle, { textAlign: "left", marginBottom: 12 }]}>
              Enter the verification code sent to your email address.
            </Text>
            <View style={[styles.inputWrapper, focused === "verificationCode" && styles.inputFocused]}>
              <Text style={styles.inputIcon}>✉</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit verification code"
                placeholderTextColor={WHITE_40}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                value={verificationCode}
                onChangeText={(value) => { setVerificationCode(value.replace(/\D/g, "").slice(0, 6)); setLoginError(""); }}
                onFocus={() => setFocused("verificationCode")}
                onBlur={() => setFocused(null)}
                selectionColor={cfg.btnColor}
              />
            </View>
          </View>}

          {/* Error message */}
          {!!loginError && (
            <Text style={styles.loginError}>⚠ {loginError}</Text>
          )}

          {/* Sign-in button */}
          <Animated.View style={[{ marginTop: 6 }, buttonAnimStyle]}>
            <TouchableOpacity
              style={[styles.signInBtn, { backgroundColor: cfg.btnColor }, loginLoading && { opacity: 0.6 }]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={clientTrustRequired ? handleVerifyClientTrust : handleLogin}
              activeOpacity={1}
              disabled={loginLoading}
            >
              {loginLoading
                ? <ActivityIndicator color={WHITE} />
                : <Text style={styles.signInText}>{clientTrustRequired ? "Verify code" : cfg.btnLabel}</Text>}
            </TouchableOpacity>
          </Animated.View>
          {clientTrustRequired && (
            <TouchableOpacity
              style={{ alignSelf: "center", marginTop: 16 }}
              onPress={() => {
                setClientTrustRequired(false);
                setVerificationCode("");
                setLoginError("");
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.forgotText, { color: cfg.btnColor }]}>Back to sign in</Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          {/* <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View> */}

          {/* Social */}
          {/* <View style={styles.socialRow}>
            <TouchableOpacity
              style={styles.socialBtn}
              activeOpacity={0.75}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={WHITE_72} />
              ) : (
                <Text style={styles.socialText}>Google</Text>
              )}
            </TouchableOpacity>

            {[
              { id: "apple", label: "Apple" },
              { id: "sso",   label: "SSO"   },
            ].map(({ id, label }) => (
              <TouchableOpacity key={id} style={styles.socialBtn} activeOpacity={0.75}>
                <Text style={styles.socialText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View> */}
        </Animated.View>

        {/* -- Footer */}
        <Animated.View style={[styles.footer, formStyle]}>
          <Text style={styles.footerText}>
            New to heyTenant?{" "}
            <Text
              style={[styles.footerLink, { color: cfg.btnColor }]}
              onPress={() => router.push("/register")}
            >
              Create an account
            </Text>
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// -- Styles
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_BLUE,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },

  // Orbs - width/height/borderRadius set dynamically in component
  orb1: {
    position: "absolute",
    backgroundColor: "rgba(74,144,217,0.09)",
    top: -60,
    left: -40,
  },
  orb2: {
    position: "absolute",
    backgroundColor: "rgba(74,144,217,0.06)",
    bottom: 80,
    right: -40,
  },

  // Back - marginTop set dynamically via insets in component
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  backArrow: { fontSize: 18, color: WHITE_72 },
  backText:  { fontSize: 14, color: WHITE_72, fontWeight: "500" },

  // Header
  headerSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 24,
  },
  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoInner: {
    width: 54,
    height: 54,
    borderRadius: 13,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: {
    fontSize: 20,
    fontWeight: "800",
    color: BRAND_BLUE,
    letterSpacing: -1,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: WHITE,
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: WHITE_72,
    textAlign: "center",
    lineHeight: 20,
  },

  // Role switcher track
  tabTrack: {
    flexDirection: "row",
    backgroundColor: WHITE_08,
    borderWidth: 1,
    borderColor: WHITE_15,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    position: "relative",
  },
  tabPill: {
    position: "absolute",
    top: 4,
    left: 4,
    bottom: 4,
    width: "50%",
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  tabBtn: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: WHITE_40,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: WHITE,
  },

  // Role chip
  roleChipRow: {
    alignItems: "flex-start",
    marginBottom: 20,
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: WHITE_15,
  },
  roleChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // Form
  formSection: {},
  fieldGroup:  { marginBottom: 16 },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: WHITE_72,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WHITE_08,
    borderWidth: 1,
    borderColor: WHITE_15,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inputFocused: {
    borderColor: ACCENT,
    backgroundColor: "rgba(74,144,217,0.08)",
  },
  inputIcon: {
    fontSize: 14,
    color: WHITE_40,
    width: 18,
    textAlign: "center",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: WHITE,
    alignSelf: "center",
    paddingVertical: 0,
  },
  inputPassword: { paddingRight: 4 },
  eyeBtn: { paddingLeft: 6, paddingVertical: 4 },
  eyeText: { fontSize: 12, fontWeight: "600" },

  loginError: {
    fontSize: 12,
    color: "#F87171",
    marginTop: 6,
    marginBottom: 2,
    fontWeight: "500",
  },

  // CTA
  signInBtn: {
    borderRadius: 16,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: {
    fontSize: 15,
    fontWeight: "700",
    color: WHITE,
    letterSpacing: 0.4,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 18,
    gap: 10,
  },
  dividerLine:  { flex: 1, height: 1, backgroundColor: WHITE_15 },
  dividerLabel: { fontSize: 12, color: WHITE_40, letterSpacing: 0.3 },

  // Social
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WHITE_15,
    backgroundColor: WHITE_08,
    alignItems: "center",
    justifyContent: "center",
  },
  socialText: { fontSize: 13, color: WHITE_72, fontWeight: "600" },

  // Footer
  footer: { alignItems: "center", paddingTop: 24 },
  footerText: { fontSize: 13, color: WHITE_40 },
  footerLink: { fontWeight: "600" },
});
