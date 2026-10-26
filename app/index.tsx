import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { API_URL } from "../constants/api";

// Central redirect gate. We MUST wait for Clerk to finish loading before
// issuing any redirect. Firing a <Redirect> while isLoaded=false means React
// can push a new route while the previous screen is still mid-render (hooks
// still running), which causes "Rendered fewer hooks than expected".
export default function Index() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const [role, setRole] = useState<string | null>(null);

  // Resolve the role from the backend — it knows which collection (users /
  // renters) the account lives in. Clerk metadata is only a fallback since it
  // may be missing (Google sign-in) or stored in lowercase.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      let resolved: string | undefined;
      try {
        const token = await getToken();
        if (token) {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json().catch(() => null);
          if (res.ok) resolved = json?.data?.user?.role;
        }
      } catch {
        // fall through to metadata
      }
      if (!resolved) resolved = user?.unsafeMetadata?.role as string | undefined;
      if (!cancelled) setRole((resolved ?? "RENTER").toUpperCase());
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, user]);

  // Clerk not ready yet — render nothing, let it load silently.
  if (!isLoaded) return null;

  // Signed in → route to the correct dashboard based on the user's role
  if (isSignedIn) {
    if (!role) return null;
    if (role === "LANDLORD") return <Redirect href="/landlord/dashboard" />;
    return <Redirect href="/renter/dashboard" />;
  }

  // Not signed in → welcome screen
  return <Redirect href="/welcome" />;
}
