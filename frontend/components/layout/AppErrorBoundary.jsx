import { Component } from "react";

/**
 * Surfaces render errors instead of a silent blank / “dead” UI after a failed hydration or child throw.
 */
export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Sentinel] UI error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center px-4 py-16">
          <div className="glass-card max-w-lg w-full p-8 text-center space-y-4">
            <h1 className="text-xl font-semibold text-red-300">Something broke in the interface</h1>
            <p className="text-gray-400 text-sm">
              Open the browser console (F12) for the technical message, then reload. If this persists after a hard
              refresh, report it with a screenshot of the console.
            </p>
            <button
              type="button"
              className="btn-pro"
              onClick={() => {
                this.setState({ error: null });
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
