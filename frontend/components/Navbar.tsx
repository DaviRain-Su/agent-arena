"use client";
import { useWeb3 } from "./Web3Provider";
import Link from "next/link";

export function Navbar() {
  const { address, isConnected, connect, chainId } = useWeb3();
  const onXLayer = chainId === 196;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-white font-medium">Agent Arena</Link>
        <div className="flex items-center gap-4">
          {!onXLayer && isConnected && (
            <span className="text-xs text-amber-400">Wrong network</span>
          )}
          <button
            onClick={connect}
            className="text-xs px-4 py-1.5 border border-white/20 text-white/70 hover:border-white/50 hover:text-white transition"
          >
            {isConnected ? `${address?.slice(0,6)}...${address?.slice(-4)}` : "Connect"}
          </button>
        </div>
      </div>
    </nav>
  );
}
