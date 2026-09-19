import { Component, type ReactNode, type ErrorInfo } from 'react';

export interface EnvironmentErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface EnvironmentErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error Boundary isolating the WebGL Environment / CubeCamera cubemap pipeline.
 *
 * Rationale:
 * Procedural environment capture (@react-three/drei's <Environment />) renders
 * sky and atmospheric shaders into an off-screen WebGLCubeRenderTarget across 6 passes.
 * On memory-constrained mobile devices (especially iOS Safari with tight WebKit jetsam limits)
 * or during WebGL context interruptions, cubemap allocation or shader compilation can fail.
 *
 * This boundary isolates environment reflection failures, preventing the 3D scene from
 * crashing and degrading gracefully to ambient lighting.
 */
export class EnvironmentErrorBoundary extends Component<
  EnvironmentErrorBoundaryProps,
  EnvironmentErrorBoundaryState
> {
  public override state: EnvironmentErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): EnvironmentErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown environment capture error',
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.warn(
      '[EnvironmentErrorBoundary] Environment reflection capture encountered an error. Falling back to ambient lighting:',
      error,
      errorInfo,
    );
    this.props.onError?.(error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
