import { Component } from "react";
import LoadingScreen from './components/LoadingScreen.jsx'

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
        <LoadingScreen
          error
          message="The application files may have changed during a deployment. Retry to load the latest version."
          onRetry={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
