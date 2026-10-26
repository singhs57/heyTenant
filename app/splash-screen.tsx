import { useEffect } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const BRAND_BLUE = "#1A3C5E";
const ACCENT = "#4A90D9";
const WHITE = "#FFFFFF";

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  // useWindowDimensions re-renders on orientation change / split-screen
  const { width } = useWindowDimensions();

  const containerOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const descOpacity = useSharedValue(0);
  const dividerWidth = useSharedValue(0);

  useEffect(() => {
    // Logo pop-in
    logoScale.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.back(1.4)),
    });
    logoOpacity.value = withTiming(1, { duration: 500 });

    // Brand name fades in after logo
    textOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));

    // Divider expands left-to-right
    dividerWidth.value = withDelay(
      750,
      withTiming(width * 0.45, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Description fades in
    descOpacity.value = withDelay(900, withTiming(1, { duration: 400 }));

    // Fade out whole screen then hand off to app
    containerOpacity.value = withDelay(
      4400,
      withTiming(0, { duration: 600 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      })
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const descStyle = useAnimatedStyle(() => ({
    opacity: descOpacity.value,
  }));

  const dividerStyle = useAnimatedStyle(() => ({
    width: dividerWidth.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Logo mark */}
      <Animated.View style={[styles.logoWrapper, logoStyle]}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoInitial}>hT</Text>
          </View>
        </View>
      </Animated.View>

      {/* Brand name */}
      <Animated.Text style={[styles.brandName, textStyle]}>
        hey<Text style={styles.brandAccent}>Tenant</Text>
      </Animated.Text>

      {/* Animated divider */}
      <Animated.View style={[styles.divider, dividerStyle]} />

      {/* Tagline */}
      <Animated.Text style={[styles.description, descStyle]}>
        Effortless Living
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BRAND_BLUE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999, // Android: ensures it renders above nav-bar chrome
  },
  logoWrapper: {
    marginBottom: 28,
  },
  logoOuter: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 18,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitial: {
    fontSize: 32,
    fontWeight: "800",
    color: BRAND_BLUE,
    letterSpacing: -1,
  },
  brandName: {
    fontSize: 36,
    fontWeight: "300",
    color: WHITE,
    letterSpacing: 1,
    marginBottom: 14,
  },
  brandAccent: {
    fontWeight: "700",
    color: ACCENT,
  },
  divider: {
    height: 2,
    backgroundColor: ACCENT,
    borderRadius: 1,
    marginBottom: 14,
  },
  description: {
    fontSize: 14,
    fontWeight: "400",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
});
