import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-failure" role="alert">
          <div className="app-failure-mark">S</div>
          <h1>SCAN could not load this page.</h1>
          <p>The application files may have changed during a deployment. Reload to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload SCAN
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
