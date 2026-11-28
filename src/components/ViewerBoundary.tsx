import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { logError } from "../log";
import { colors, space } from "../theme/theme";

type Props = { children: ReactNode };
type State = { message: string | null };

export class ViewerBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error?.message || "The 3D view stopped. The scan is still saved." };
  }

  componentDidCatch(error: Error): void {
    logError("viewer", error);
  }

  render(): ReactNode {
    if (this.state.message) return <ViewerFallback message={this.state.message} />;
    return this.props.children;
  }
}

export function ViewerFallback({ message }: { message: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Could not show this rock</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    minHeight: 220,
    backgroundColor: colors.bg,
    padding: space.lg,
    justifyContent: "center",
    gap: 8,
  },
  title: { color: colors.chalk, fontSize: 22, fontWeight: "800" },
  body: { color: colors.sand, fontSize: 16, lineHeight: 22 },
});
