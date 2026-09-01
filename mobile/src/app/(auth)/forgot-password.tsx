import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { api } from "@/api/client";
import { Button, Input } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setMessage("If the account exists, a password reset email has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Reset password</Text>
      <Text style={styles.message}>We will email you a one-hour password reset link.</Text>
      <View style={styles.form}>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        {message ? <Text style={styles.result}>{message}</Text> : null}
        <Button title="Send reset link" onPress={submit} loading={busy} disabled={!email} />
        <Button title="Back to login" variant="secondary" onPress={() => router.back()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  message: { color: colors.textMuted, textAlign: "center", marginVertical: spacing.lg },
  result: { color: colors.textMuted, lineHeight: 20, textAlign: "center" },
  form: { gap: spacing.md },
});
