"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#020202] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <h2 className="text-6xl font-light mb-4">404</h2>
        <h3 className="text-xl font-light mb-4">Page Not Found</h3>
        <p className="text-white/60 mb-8">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition rounded"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
