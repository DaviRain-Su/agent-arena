"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Error caught by error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#020202] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <h2 className="text-2xl font-light mb-4">Something went wrong</h2>
        <div className="bg-white/5 border border-white/10 p-4 mb-6 rounded">
          <p className="text-white/60 text-sm font-mono break-all">
            {error.message || "An unexpected error occurred"}
          </p>
          {error.digest && (
            <p className="text-white/40 text-xs mt-2">Error ID: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition rounded"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
