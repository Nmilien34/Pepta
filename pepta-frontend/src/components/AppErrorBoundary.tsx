// Last-resort error boundary around the whole app. In a release build an
// uncaught render error otherwise paints a permanent blank screen (which App
// Review rejects under 2.1(a)). Deliberately styled with plain RN primitives
// and hardcoded brand colors: the theme/font providers may be part of what
// crashed, so this screen must depend on nothing.

import React, { type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

interface AppErrorBoundaryState {
  error: unknown;
}

export class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown): void {
    // Surfaces in os_log / crash tooling; never rethrow.
    console.error("AppErrorBoundary caught:", error);
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error == null) {
      return this.props.children;
    }
    // The one-line cause, shown small under the apology. This is the entire
    // field diagnosability of a release build: the hooks-order crash that
    // blanked builds 20-22 took hours to pin because the report was a
    // screenshot of this screen carrying zero information. An error message
    // is code-level text, not user data — safe to show, and it turns the
    // next "something went wrong" screenshot into a diagnosis.
    const raw =
      this.state.error instanceof Error
        ? this.state.error.message
        : String(this.state.error);
    const detail = raw ? raw.slice(0, 140) : null;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FAFAFB",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#0E0E12" }}>
          Something went wrong
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: "#6B6B76",
            textAlign: "center",
            lineHeight: 21,
          }}
        >
          Pepta hit an unexpected error. Your logs are safe — tap below to try
          again, or reopen the app.
        </Text>
        {detail ? (
          <Text
            style={{
              fontSize: 12,
              color: "#9A9AA5",
              textAlign: "center",
              lineHeight: 16,
              maxWidth: 300,
            }}
          >
            {detail}
          </Text>
        ) : null}
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          style={{
            marginTop: 8,
            backgroundColor: "#7C5CFC",
            borderRadius: 999,
            paddingVertical: 14,
            paddingHorizontal: 36,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
}
