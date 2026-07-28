import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useSetExerciseVideo } from "@/api/hooks";
import type { Exercise } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

/** Readable on the dark surfaces, unlike YouTube's own #ff0000. */
export const YOUTUBE_RED = "#ff4d4d";

/** Hands the link to the OS so Android opens it in the YouTube app when installed. */
export async function openVideo(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open the video", url);
  }
}

/**
 * Play / attach / change the form-demo link for one exercise. Used both inside
 * the mid-workout info sheet and on the exercise detail screen, so it lays out
 * as a full-width stack — no side-by-side rows that would squeeze on a narrow
 * phone (Z Flip) or at a large system font scale.
 */
export function ExerciseVideoLink({ exercise }: { exercise: Exercise }) {
  const setVideo = useSetExerciseVideo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(exercise.video_url ?? "");
    setEditing(true);
  };

  const save = () => {
    const url = draft.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      Alert.alert(
        "That doesn't look like a link",
        "Paste the full URL from YouTube — it should start with https://",
      );
      return;
    }
    setVideo.mutate(
      { id: exercise.id, videoUrl: url || null },
      {
        onSuccess: () => setEditing(false),
        onError: (err) =>
          Alert.alert("Link not saved", err instanceof Error ? err.message : "Please try again."),
      },
    );
  };

  const remove = () => {
    Alert.alert("Remove video link?", exercise.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => setVideo.mutate({ id: exercise.id, videoUrl: null }),
      },
    ]);
  };

  if (editing) {
    return (
      <View style={styles.stack}>
        <Text style={styles.hint}>
          Paste a YouTube link (Share → Copy link). It opens in the YouTube app.
        </Text>
        <Input
          placeholder="https://youtube.com/watch?v=..."
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Button title="Save link" onPress={save} loading={setVideo.isPending} />
        <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
      </View>
    );
  }

  if (!exercise.video_url) {
    return (
      <View style={styles.stack}>
        <Button title="＋ Add a YouTube link" variant="secondary" onPress={startEditing} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Pressable
        onPress={() => openVideo(exercise.video_url!)}
        style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="logo-youtube" size={20} color={YOUTUBE_RED} />
        <Text style={styles.playText}>Watch how it&apos;s done</Text>
      </Pressable>
      <Text style={styles.url} numberOfLines={1} ellipsizeMode="middle">
        {exercise.video_url}
      </Text>
      <View style={styles.linkRow}>
        <Pressable onPress={startEditing} hitSlop={8}>
          <Text style={styles.linkAction}>Change link</Text>
        </Pressable>
        <Pressable onPress={remove} hitSlop={8}>
          <Text style={[styles.linkAction, { color: colors.textFaint }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12 },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  // shrinks instead of pushing the icon off-screen when the font scale is large
  playText: { color: colors.text, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  url: { color: colors.textFaint, fontSize: 11 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
  linkAction: { color: colors.accentBright, fontSize: 13, fontWeight: "700" },
});
