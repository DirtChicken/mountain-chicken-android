import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, space } from "../theme/theme";

export function BigButton({
  label,
  onPress,
  tone = "copper",
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "copper" | "sand" | "slate" | "danger";
  disabled?: boolean;
}) {
  const background =
    tone === "sand" ? colors.sand : tone === "slate" ? colors.slate : tone === "danger" ? colors.danger : colors.copper;
  const ink = tone === "sand" || tone === "copper" ? colors.ink : colors.chalk;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.multiline && styles.inputMulti, props.style]}
      />
    </View>
  );
}

export function Muted({ children }: { children: string }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Title({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  buttonText: { fontSize: 18, fontWeight: "800", letterSpacing: 0.2 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bgRaised,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  chipOn: { backgroundColor: colors.copper, borderColor: colors.copper },
  chipText: { color: colors.chalk, fontSize: 15, fontWeight: "700" },
  chipTextOn: { color: colors.ink },
  chipRow: { paddingVertical: 4 },
  field: { gap: 6 },
  label: { color: colors.sand, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.bgRaised,
    color: colors.chalk,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  inputMulti: { minHeight: 88, textAlignVertical: "top", paddingTop: 12 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  title: { color: colors.chalk, fontSize: 32, fontWeight: "800", letterSpacing: -0.4 },
});

export const card = {
  backgroundColor: colors.bgRaised,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.line,
  padding: space.md,
  gap: 4,
} as const;
