import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { api } from "@/api/client";
import type { TokenResponse } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { colors, spacing } from "@/theme/colors";

export default function Login() {
  const signIn = useAuth((s) => s.signIn);
  const enterLocalMode = useAuth((s) => s.enterLocalMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<TokenResponse>("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      await signIn(res.access_token, res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.logo}>
        ROZAKOS<Text style={{ color: colors.accentBright }}> FITNESS</Text>
      </Text>
      <Text style={styles.tagline}>Build your ideas. Lift your goals.</Text>
      <View style={styles.form}>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Log in" onPress={submit} loading={busy} disabled={!email || !password} />
        <Link href="/register" style={styles.link}>
          New here? Create an account
        </Link>
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>
        <Button title="Use without an account" variant="secondary" onPress={enterLocalMode} />
        <Text style={styles.localHint}>
          Local mode keeps everything on this phone — no sign-up, no sync, no device API.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg },
  logo: { color: colors.text, fontSize: 28, fontWeight: "900", textAlign: "center", letterSpacing: 2 },
  tagline: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  error: { color: colors.alert, textAlign: "center" },
  link: { color: colors.accentBright, textAlign: "center", marginTop: spacing.sm },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.surfaceRaised },
  dividerText: { color: colors.textFaint, fontSize: 12 },
  localHint: { color: colors.textFaint, fontSize: 12, textAlign: "center" },
});
