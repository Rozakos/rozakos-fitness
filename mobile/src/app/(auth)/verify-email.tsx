import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { api } from "@/api/client";
import { Button, Input } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

export default function VerifyEmail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const [email, setEmail] = useState(initialEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Open the confirmation link we sent, then return here to log in.",
  );

  const resend = async () => {
    setBusy(true);
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email: email.trim() } });
      setMessage("If this account still needs confirmation, a new email has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The email could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Confirm your email</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.form}>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Button title="Resend confirmation" onPress={resend} loading={busy} disabled={!email} />
        <Button title="Back to login" variant="secondary" onPress={() => router.replace("/login")} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" },
  message: { color: colors.textMuted, lineHeight: 20, textAlign: "center", marginVertical: spacing.lg },
  form: { gap: spacing.md },
});
