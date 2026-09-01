import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View } from "react-native";

import { api } from "@/api/client";
import { PRIVACY_POLICY_URL } from "@/api/config";
import type { RegistrationResponse } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { colors, spacing } from "@/theme/colors";

export default function Register() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<RegistrationResponse>("/auth/register", {
        method: "POST",
        body: { email: email.trim(), password, display_name: displayName.trim() },
      });
      if (res.email_verification_required || !res.access_token) {
        router.replace({ pathname: "/verify-email", params: { email: email.trim() } });
      } else {
        await signIn(res.access_token, res.user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Create account</Text>
      <View style={styles.form}>
        <Input placeholder="Display name" value={displayName} onChangeText={setDisplayName} />
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input
          placeholder="Password (min 8 characters)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.privacy}>
          Account mode sends your email, workouts, and bodyweight data to the Rozakos Fitness
          server for sync, history, and stats. You can instead choose local mode on the login
          screen. By creating an account, you agree to the{" "}
          <Text style={styles.inlineLink} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
        <Button
          title="Sign up"
          onPress={submit}
          loading={busy}
          disabled={!email || password.length < 8 || !displayName}
        />
        <Link href="/login" style={styles.link}>
          Already have an account? Log in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: spacing.xl },
  form: { gap: spacing.md },
  error: { color: colors.alert, textAlign: "center" },
  link: { color: colors.accentBright, textAlign: "center", marginTop: spacing.sm },
  privacy: { color: colors.textFaint, fontSize: 12, lineHeight: 17, textAlign: "center" },
  inlineLink: { color: colors.accentBright, textDecorationLine: "underline" },
});
