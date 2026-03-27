"use client";

import { useWeb3 } from "./Web3Provider";

export function ConnectButton() {
  const { address, isConnected, connect, disconnect } = useWeb3();

  if (isConnected) {
    return (
      <button
        onClick={disconnect}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
      >
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect()}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
    >
      Connect Wallet
    </button>
  );
}
