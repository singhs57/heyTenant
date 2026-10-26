import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView,
  useWindowDimensions,
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
import { Redirect, useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";

const BRAND_BLUE = "#1A3C5E";
const ACCENT = "#4A90D9";
const ACCENT_LIGHT = "rgba(74,144,217,0.12)";
const WHITE = "#FFFFFF";
const WHITE_72 = "rgba(255,255,255,0.72)";
const WHITE_40 = "rgba(255,255,255,0.40)";
const WHITE_15 = "rgba(255,255,255,0.15)";
const WHITE_08 = "rgba(255,255,255,0.08)";

const FEATURES = [
  {
    icon: "🏠",
    title: "Manage Your Home",
    body: "Raise maintenance requests, track status, and chat with your property team — all in one place.",
  },
  {
    icon: "💬",
    title: "Instant Communication",
    body: "Stay connected with your landlord and building management through real-time messaging.",
  },
  {
    icon: "📄",
    title: "Documents & Payments",
    body: "Access your lease, receipts, and make rent payments securely without the paperwork.",
  },
];

function FeatureCard({
  icon,
  title,
  body,
  delay,
}: {
  icon: string;
  title: string;
  body: string;
  delay: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.card, animStyle]}>
      <View style={styles.cardIcon}>
        <Text style={styles.cardIconText}>{icon}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── ALL hooks declared unconditionally FIRST ─────────────────────────────
  // React's Rules of Hooks forbid calling hooks after a conditional return.
  // Every useSharedValue / useAnimatedStyle / useEffect must be called on
  // every render regardless of auth state, otherwise React sees a different
  // hook count between renders and throws "Rendered fewer hooks than expected".
  const heroOpacity = useSharedValue(0);
  const heroTranslateY = useSharedValue(30);
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(24);
  const buttonScale = useSharedValue(1);
  const orb1Scale = useSharedValue(0.6);
  const orb2Scale = useSharedValue(0.6);

  useEffect(() => {
    orb1Scale.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
    orb2Scale.value = withDelay(
      200,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) })
    );

    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    badgeScale.value = withDelay(
      100,
      withSpring(1, { damping: 14, stiffness: 150 })
    );

    heroOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    heroTranslateY.value = withDelay(
      200,
      withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) })
    );

    buttonOpacity.value = withDelay(1600, withTiming(1, { duration: 500 }));
    buttonTranslateY.value = withDelay(
      1600,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslateY.value }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [
      { translateY: buttonTranslateY.value },
      { scale: buttonScale.value },
    ],
  }));

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb1Scale.value }],
  }));

  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ scale: orb2Scale.value }],
  }));

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  // Early return AFTER all hooks — redirects signed-in users to the index
  // gate which will route them to the correct role-based dashboard.
  if (isLoaded && isSignedIn) {
    return <Redirect href="/" />;
  }

  const handleGetStarted = () => {
    router.push("/login");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Decorative background orbs */}
      <Animated.View style={[styles.orb1, { width: width * 0.85, height: width * 0.85, borderRadius: (width * 0.85) / 2, top: -width * 0.35, right: -width * 0.3 }, orb1Style]} />
      <Animated.View style={[styles.orb2, { width: width * 0.65, height: width * 0.65, borderRadius: (width * 0.65) / 2, bottom: height * 0.12, left: -width * 0.25 }, orb2Style]} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 16, 40) : Math.max(insets.top + 16, 40),
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top section */}
        <View style={styles.topSection}>
          {/* Version badge */}
          <Animated.View style={[styles.badge, badgeStyle]}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>Tenant Portal · v1.0</Text>
          </Animated.View>

          {/* Logo */}
          <Animated.View style={[styles.logoWrapper, heroStyle]}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoInitial}>hT</Text>
              </View>
            </View>
          </Animated.View>

          {/* Headline */}
          <Animated.View style={heroStyle}>
            <Text style={styles.headline}>
              hey<Text style={styles.headlineAccent}>Tenant</Text>
            </Text>
            <Text style={styles.tagline}>Effortless Living</Text>
          </Animated.View>
        </View>

        {/* Feature cards */}
        <View style={styles.cardsSection}>
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              icon={f.icon}
              title={f.title}
              body={f.body}
              delay={600 + i * 180}
            />
          ))}
        </View>

        {/* CTA */}
        <Animated.View style={[styles.ctaWrapper, buttonAnimStyle]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handleGetStarted}
            activeOpacity={1}
          >
            <Text style={styles.ctaText}>Get Started</Text>
            <View style={styles.ctaArrow}>
              <Text style={styles.ctaArrowText}>→</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.signInHint}>
            Already have an account?{" "}
            <Text style={styles.signInLink} onPress={handleGetStarted}>
              Sign in
            </Text>
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_BLUE,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  orb1: {
    position: "absolute",
    backgroundColor: "rgba(74,144,217,0.10)",
    // width/height/borderRadius/position set dynamically in component
  },
  orb2: {
    position: "absolute",
    backgroundColor: "rgba(74,144,217,0.07)",
    // width/height/borderRadius/position set dynamically in component
  },

  topSection: {
    alignItems: "center",
    paddingBottom: 24,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WHITE_08,
    borderWidth: 1,
    borderColor: WHITE_15,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 32,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    color: WHITE_72,
    letterSpacing: 0.5,
    fontWeight: "500",
  },

  logoWrapper: {
    marginBottom: 22,
  },
  logoOuter: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: {
    fontSize: 28,
    fontWeight: "800",
    color: BRAND_BLUE,
    letterSpacing: -1,
  },

  headline: {
    fontSize: 40,
    fontWeight: "300",
    color: WHITE,
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 6,
  },
  headlineAccent: {
    fontWeight: "700",
    color: ACCENT,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "400",
    color: WHITE_72,
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
  },

  cardsSection: {
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: WHITE_08,
    borderWidth: 1,
    borderColor: WHITE_15,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: ACCENT_LIGHT,
    borderWidth: 1,
    borderColor: "rgba(74,144,217,0.25)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 14,
  },
  cardIconText: {
    fontSize: 20,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: WHITE,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  cardBody: {
    fontSize: 12,
    color: WHITE_72,
    lineHeight: 18,
  },

  ctaWrapper: {
    alignItems: "center",
    paddingTop: 20,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    borderRadius: 16,
    width: "100%",
    height: 56,
    gap: 10,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: WHITE,
    letterSpacing: 0.4,
  },
  ctaArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaArrowText: {
    fontSize: 15,
    color: WHITE,
    fontWeight: "600",
  },
  signInHint: {
    marginTop: 16,
    fontSize: 13,
    color: WHITE_40,
  },
  signInLink: {
    color: ACCENT,
    fontWeight: "600",
  },
});
