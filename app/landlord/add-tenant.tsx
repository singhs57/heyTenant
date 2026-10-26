import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, StatusBar, KeyboardAvoidingView, ActivityIndicator, Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { API_URL } from "../../constants/api";
import { useStableFocusEffect } from "../../hooks/useStableFocusEffect";

const BRAND_BLUE   = "#1A3C5E";
const BRAND_DEEP   = "#122B44";
const ACCENT_LIGHT = "#4A90D9";
const SUCCESS      = "#22C55E";
const SUCCESS_BG   = "rgba(34,197,94,0.12)";
const WARNING      = "#F59E0B";
const DANGER       = "#F87171";
const WHITE        = "#FFFFFF";
const WHITE_72     = "rgba(255,255,255,0.72)";
const WHITE_40     = "rgba(255,255,255,0.40)";
const WHITE_15     = "rgba(255,255,255,0.15)";
const WHITE_08     = "rgba(255,255,255,0.08)";
const WHITE_05     = "rgba(255,255,255,0.05)";

type Property = {
  _id: string;
  name: string;
  addressLine1: string;
  city: string;
  monthlyRent: number;
  status: "VACANT" | "OCCUPIED";
};

function Section({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

function Field({
  label, placeholder, value, onChangeText, keyboardType = "default",
  multiline = false, error, secureTextEntry = false, autoCapitalize = "sentences",
}: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fi.wrap}>
      <Text style={fi.label}>{label}</Text>
      <TextInput
        style={[fi.input, focused && fi.focused, multiline && fi.multi, error && fi.err]}
        placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.25)"
        value={value} onChangeText={onChangeText} keyboardType={keyboardType}
        multiline={multiline} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      />
      {error ? <Text style={fi.errTxt}>{error}</Text> : null}
    </View>
  );
}
const fi = StyleSheet.create({
  wrap:  { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "600", color: WHITE_72, marginBottom: 6, letterSpacing: 0.3 },
  input: { backgroundColor: WHITE_05, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: WHITE },
  focused: { borderColor: ACCENT_LIGHT },
  multi: { minHeight: 80, textAlignVertical: "top" },
  err:   { borderColor: DANGER },
  errTxt: { fontSize: 11, color: DANGER, marginTop: 4 },
});

export default function AddTenant() {
  const router = useRouter();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "android" ? Math.max((StatusBar.currentHeight ?? 0) + 8, 32) : Math.max(insets.top + 8, 32);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertyLoadError, setPropertyLoadError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [phone,      setPhone]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob,        setDob]        = useState("");
  const [nin,        setNin]        = useState("");
  const [leaseStart, setLeaseStart] = useState("");
  const [leaseEnd,   setLeaseEnd]   = useState("");
  const [emergName,  setEmergName]  = useState("");
  const [emergPhone, setEmergPhone] = useState("");
  const [notes,      setNotes]      = useState("");
  const [checklist,  setChecklist]  = useState<string[]>([]);
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [credentialsCopied, setCredentialsCopied] = useState(false);

  const loadAvailableProperties = useCallback(async () => {
    setPropertiesLoading(true);
    setPropertyLoadError(null);
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await fetch(`${API_URL}/api/landlord/properties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Could not load your properties.");
      }
      const allProperties = Array.isArray(json?.data) ? json.data as Property[] : [];
      const availableProperties = allProperties.filter((property) => property.status === "VACANT");
      setProperties(availableProperties);
      setSelectedUnit((current) => current
        && !availableProperties.some((property) => property._id === current)
        ? null
        : current);
    } catch (error) {
      setPropertyLoadError(error instanceof Error ? error.message : "Could not load your properties.");
    } finally {
      setPropertiesLoading(false);
    }
  }, [getToken, router]);

  useStableFocusEffect(() => {
    void loadAvailableProperties();
  });

  const CHECKLIST = [
    "Right-to-rent checks completed",
    "ID document verified",
    "Security deposit received",
    "Tenancy agreement signed",
    "Keys handed over",
    "Move-in inventory completed",
  ];
  const toggleCheck = (item: string) =>
    setChecklist(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedUnit)             e.unit       = "Please select a property unit.";
    if (!firstName.trim())         e.firstName  = "First name is required.";
    if (!lastName.trim())          e.lastName   = "Last name is required.";
    if (!/\S+@\S+\.\S+/.test(email)) e.email   = "Enter a valid email address.";
    if (!phone.trim())             e.phone      = "Phone number is required.";
    if (password.length < 8)       e.password   = "Use at least 8 characters.";
    if (password !== confirmPassword) e.confirmPassword = "Passwords do not match.";
    if (!leaseStart.trim())        e.leaseStart = "Lease start date is required.";
    if (!leaseEnd.trim())          e.leaseEnd   = "Lease end date is required.";
    const parseDMY = (date: string) => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim());
      if (!match) return null;
      const [, day, month, year] = match;
      const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
      if (Number.isNaN(parsed.getTime())
        || parsed.getFullYear() !== Number(year)
        || parsed.getMonth() !== Number(month) - 1
        || parsed.getDate() !== Number(day)) return null;
      return `${year}-${month}-${day}`;
    };
    const startDate = parseDMY(leaseStart);
    const endDate = parseDMY(leaseEnd);
    if (leaseStart.trim() && !startDate) e.leaseStart = "Use a valid date in DD/MM/YYYY format.";
    if (leaseEnd.trim() && !endDate) e.leaseEnd = "Use a valid date in DD/MM/YYYY format.";
    if (startDate && endDate && endDate <= startDate) e.leaseEnd = "Lease end must be after the start date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getToken();
      if (!token) { router.replace("/login"); return; }

      const parseDMY = (date: string) => {
        const [, day, month, year] = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim())!;
        return `${year}-${month}-${day}`;
      };

      const response = await fetch(`${API_URL}/api/landlord/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
        propertyId:             selectedUnit,
        firstName:              firstName.trim(),
        lastName:               lastName.trim(),
        email:                  email.trim().toLowerCase(),
        phone:                  phone.trim(),
        password,
        dateOfBirth:            dob.trim() || undefined,
        nationalInsuranceNumber: nin.trim() || undefined,
        leaseStart:             parseDMY(leaseStart),
        leaseEnd:               parseDMY(leaseEnd),
        emergencyContactName:   emergName.trim() || undefined,
        emergencyContactPhone:  emergPhone.trim() || undefined,
        checklistCompleted:     checklist.length > 0 ? checklist : undefined,
        notes:                  notes.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setSubmitError(result?.error?.message ?? `Failed to add renter (${response.status}).`);
        return;
      }
      setRegistrationComplete(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not connect to the server. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = () => {
    Clipboard.setString(`Email: ${email.trim().toLowerCase()}\nPassword: ${password}`);
    setCredentialsCopied(true);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={[s.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.hCenter}>
          <Text style={s.hTitle}>Add Tenant</Text>
          <Text style={s.hSub}>Register a new tenancy</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {registrationComplete ? (
            <Section>
              <View style={s.card}>
                <Text style={s.successTitle}>Renter account created</Text>
                <Text style={s.successMessage}>
                  Share these sign-in details with {firstName.trim()}. The renter can sign in without you logging out.
                </Text>
                <View style={s.credentialRow}>
                  <Text style={s.credentialLabel}>Email</Text>
                  <Text selectable style={s.credentialValue}>{email.trim().toLowerCase()}</Text>
                </View>
                <View style={s.credentialRow}>
                  <Text style={s.credentialLabel}>Password</Text>
                  <Text selectable style={s.credentialValue}>{password}</Text>
                </View>
                <TouchableOpacity
                  style={s.copyBtn}
                  onPress={copyCredentials}
                  activeOpacity={0.85}
                >
                  <Text style={s.submitTxt}>{credentialsCopied ? "Credentials Copied" : "Copy Sign-in Details"}</Text>
                </TouchableOpacity>
                <Text style={s.securityHint}>Share these credentials privately with the renter.</Text>
                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={s.doneBtn}>
                  <Text style={s.doneTxt}>Back to Dashboard</Text>
                </TouchableOpacity>
              </View>
            </Section>
          ) : (
            <>
          {/* Assign unit */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Choose an Available Property</Text>
              {errors.unit ? <Text style={s.errMsg}>{errors.unit}</Text> : null}
              {propertiesLoading ? (
                <ActivityIndicator color={ACCENT_LIGHT} style={{ marginVertical: 16 }} />
              ) : propertyLoadError ? (
                <View>
                  <Text style={s.errMsg}>{propertyLoadError}</Text>
                  <TouchableOpacity onPress={() => void loadAvailableProperties()} activeOpacity={0.75}>
                    <Text style={s.retryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : properties.length === 0 ? (
                <View>
                  <Text style={s.emptyMessage}>There are no vacant properties available right now.</Text>
                  <TouchableOpacity onPress={() => router.push("/landlord/add-property")} activeOpacity={0.75}>
                    <Text style={s.retryText}>Add a property</Text>
                  </TouchableOpacity>
                </View>
              ) : properties.map((property) => (
                <TouchableOpacity key={property._id} onPress={() => setSelectedUnit(property._id)} activeOpacity={0.75}
                  style={[s.unitRow, selectedUnit === property._id && s.unitActive]}>
                  <View style={[s.radio, selectedUnit === property._id && s.radioActive]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.unitName, selectedUnit === property._id && { color: WHITE }]}>{property.name}</Text>
                    <Text style={s.unitRent}>{property.addressLine1}, {property.city}</Text>
                    <Text style={s.unitRent}>₹{property.monthlyRent.toLocaleString("en-IN")}/mo</Text>
                  </View>
                  {selectedUnit === property._id && (
                    <View style={s.checkBadge}><Text style={s.checkTxt}>✓</Text></View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Personal info */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Personal Information</Text>
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}><Field label="First Name" placeholder="Alex" value={firstName} onChangeText={setFirstName} error={errors.firstName} /></View>
                <View style={{ flex: 1 }}><Field label="Last Name" placeholder="Lee" value={lastName} onChangeText={setLastName} error={errors.lastName} /></View>
              </View>
              <Field label="Email Address" placeholder="alex.lee@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" error={errors.email} />
              <Field label="Phone Number (country code optional)" placeholder="7700 900000" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
              <Text style={s.credentialsHint}>Create the sign-in password and share it with the renter after registration.</Text>
              <Field label="Sign-in Password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" error={errors.password} />
              <Field label="Confirm Password" placeholder="Enter the password again" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" error={errors.confirmPassword} />
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}><Field label="Date of Birth" placeholder="DD/MM/YYYY" value={dob} onChangeText={setDob} /></View>
                <View style={{ flex: 1 }}><Field label="NI Number" placeholder="AB 12 34 56 C" value={nin} onChangeText={setNin} /></View>
              </View>
            </View>
          </Section>

          {/* Lease terms */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Lease Terms</Text>
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}><Field label="Lease Start" placeholder="01/01/2025" value={leaseStart} onChangeText={setLeaseStart} error={errors.leaseStart} /></View>
                <View style={{ flex: 1 }}><Field label="Lease End" placeholder="31/12/2025" value={leaseEnd} onChangeText={setLeaseEnd} error={errors.leaseEnd} /></View>
              </View>
              <Text style={s.leaseSummaryLbl}>Monthly rent is payable from the 1st and due by the 10th.</Text>
              {selectedUnit && properties.find((property) => property._id === selectedUnit) && (
                <View style={s.leaseSummary}>
                  <View style={s.leaseSummaryRow}>
                    <Text style={s.leaseSummaryLbl}>Unit</Text>
                    <Text style={s.leaseSummaryVal}>{properties.find((property) => property._id === selectedUnit)?.name}</Text>
                  </View>
                  <View style={[s.leaseSummaryRow, { marginTop: 6 }]}>
                    <Text style={s.leaseSummaryLbl}>Monthly Rent</Text>
                    <Text style={[s.leaseSummaryVal, { color: SUCCESS }]}>
                      ₹{properties.find((property) => property._id === selectedUnit)?.monthlyRent.toLocaleString("en-IN")}/mo
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Section>

          {/* Emergency contact */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Emergency Contact</Text>
              <Field label="Full Name" placeholder="Jane Lee (Sister)" value={emergName} onChangeText={setEmergName} />
              <Field label="Phone Number (country code optional)" placeholder="7700 900111" value={emergPhone} onChangeText={setEmergPhone} keyboardType="phone-pad" />
            </View>
          </Section>

          {/* Pre-tenancy checklist */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Pre-tenancy Checklist</Text>
              <View style={s.checklistProgress}>
                <View style={[s.checklistBar, { width: `${Math.round((checklist.length / CHECKLIST.length) * 100)}%` }]} />
              </View>
              <Text style={s.checklistPct}>{checklist.length}/{CHECKLIST.length} items complete</Text>
              {CHECKLIST.map((item, i) => (
                <TouchableOpacity key={i} onPress={() => toggleCheck(item)} activeOpacity={0.7}
                  style={[s.checkItem, i > 0 && s.borderTop]}>
                  <View style={[s.checkbox, checklist.includes(item) && s.checkboxDone]}>
                    {checklist.includes(item) && <Text style={s.checkMark}>✓</Text>}
                  </View>
                  <Text style={[s.checkLbl, checklist.includes(item) && s.checkLblDone]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Notes */}
          <Section>
            <View style={s.card}>
              <Text style={s.cardTitle}>Notes</Text>
              <Field label="" placeholder="Any additional notes about this tenant or tenancy…" value={notes} onChangeText={setNotes} multiline />
            </View>
          </Section>

          {submitError ? (
            <View style={{ paddingHorizontal: 4, marginBottom: -6 }}>
              <Text style={{ color: "#F87171", fontSize: 12, textAlign: "center" }}>{submitError}</Text>
            </View>
          ) : null}
          <Section>
            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} activeOpacity={0.85} disabled={submitting}>
              <Text style={s.submitTxt}>{submitting ? "Creating Account…" : "Create Renter Account"}</Text>
            </TouchableOpacity>
          </Section>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  body:    { flex: 1 },
  content: { padding: 16, gap: 14 },
  card:    { backgroundColor: WHITE_08, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: WHITE_15 },
  cardTitle:    { fontSize: 14, fontWeight: "700", color: WHITE, marginBottom: 14, letterSpacing: 0.2 },
  credentialsHint: { color: WHITE_40, fontSize: 11, marginBottom: 12, lineHeight: 16 },
  emptyMessage: { color: WHITE_72, fontSize: 13, lineHeight: 19 },
  retryText: { color: ACCENT_LIGHT, fontWeight: "700", fontSize: 13, marginTop: 10 },
  twoCol:       { flexDirection: "row", gap: 12 },
  errMsg:       { fontSize: 11, color: DANGER, marginBottom: 10 },
  unitRow:      { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: WHITE_15, marginBottom: 8, backgroundColor: WHITE_05 },
  unitActive:   { borderColor: ACCENT_LIGHT, backgroundColor: `${ACCENT_LIGHT}10` },
  unitName:     { fontSize: 13, fontWeight: "600", color: WHITE_72, marginBottom: 2 },
  unitRent:     { fontSize: 11, color: WHITE_40 },
  radio:        { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: WHITE_40 },
  radioActive:  { borderColor: ACCENT_LIGHT, backgroundColor: ACCENT_LIGHT },
  checkBadge:   { width: 22, height: 22, borderRadius: 11, backgroundColor: SUCCESS_BG, alignItems: "center", justifyContent: "center" },
  checkTxt:     { fontSize: 12, color: SUCCESS, fontWeight: "800" },
  leaseSummary: { marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: WHITE_05 },
  leaseSummaryRow: { flexDirection: "row", justifyContent: "space-between" },
  leaseSummaryLbl: { fontSize: 12, color: WHITE_40 },
  leaseSummaryVal: { fontSize: 12, fontWeight: "600", color: WHITE_72 },
  checklistProgress: { height: 4, backgroundColor: WHITE_08, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  checklistBar:      { height: 4, backgroundColor: SUCCESS, borderRadius: 2 },
  checklistPct:      { fontSize: 11, color: WHITE_40, marginBottom: 10 },
  checkItem:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  borderTop:    { borderTopWidth: 1, borderTopColor: WHITE_08 },
  checkbox:     { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: WHITE_15, alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  checkMark:    { fontSize: 11, color: WHITE, fontWeight: "800" },
  checkLbl:     { fontSize: 13, color: WHITE_72, flex: 1 },
  checkLblDone: { color: WHITE_40, textDecorationLine: "line-through" },
  submitBtn:    { backgroundColor: SUCCESS, borderRadius: 16, height: 54, alignItems: "center", justifyContent: "center" },
  submitTxt:    { fontSize: 15, fontWeight: "800", color: WHITE, letterSpacing: 0.3 },
  successTitle: { fontSize: 20, fontWeight: "800", color: SUCCESS, marginBottom: 8 },
  successMessage: { fontSize: 13, lineHeight: 19, color: WHITE_72, marginBottom: 16 },
  credentialRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: WHITE_08 },
  credentialLabel: { color: WHITE_40, fontSize: 11, marginBottom: 4 },
  credentialValue: { color: WHITE, fontSize: 14, fontWeight: "700" },
  copyBtn: { backgroundColor: SUCCESS, borderRadius: 14, height: 50, alignItems: "center", justifyContent: "center", marginTop: 16 },
  securityHint: { color: WARNING, fontSize: 11, lineHeight: 16, marginTop: 12 },
  doneBtn: { alignItems: "center", paddingVertical: 14 },
  doneTxt: { color: WHITE_72, fontWeight: "700", fontSize: 13 },
});
