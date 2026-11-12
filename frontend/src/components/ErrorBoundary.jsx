import { Component } from "react";
import { AlertCircle } from "lucide-react";

// Catches rendering errors anywhere below so a single broken screen never
// blanks the whole application for the user.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in the browser console; never surface internals to users.
    console.error("SchoolFlow UI error", error?.name ?? "Error", info?.componentStack ?? "");
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="error-panel error-boundary" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Something went wrong on this screen.</strong>
        <p>Your data is safe. You can retry or reload the page.</p>
      </div>
      <div className="row-actions">
        <button className="button button-quiet" onClick={this.reset}>Try again</button>
        <button className="button button-outline" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </div>;
  }
}
