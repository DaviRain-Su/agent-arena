"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { XLAYER_CHAIN } from "@/lib/contracts";

interface Web3ContextType {
  address: string | null;
  signer: ethers.Signer | null;
  provider: ethers.BrowserProvider | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToXLayer: () => Promise<void>;
  openWalletModal: () => Promise<void>;
  chainId: number | null;
}

const Web3Context = createContext<Web3ContextType>({
  address: null, signer: null, provider: null,
  isConnected: false, isConnecting: false, chainId: null,
  connect: async () => {}, disconnect: () => {},
  switchToXLayer: async () => {}, openWalletModal: async () => {},
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Please install MetaMask or OKX Wallet");
      return;
    }
    setIsConnecting(true);
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const s = await prov.getSigner();
      const addr = await s.getAddress();
      const network = await prov.getNetwork();
      setProvider(prov);
      setSigner(s);
      setAddress(addr);
      setChainId(Number(network.chainId));
    } catch (e) {
      console.error("Connect failed", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null); setSigner(null); setProvider(null); setChainId(null);
  };

  const switchToXLayer = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN.chainId }],
      });
    } catch (err: unknown) {
      if ((err as { code: number }).code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [XLAYER_CHAIN],
        });
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    window.ethereum.on?.("accountsChanged", ((...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) disconnect();
      else connect();
    }));
    window.ethereum.on?.("chainChanged", (() => connect()));
  }, []);

  return (
    <Web3Context.Provider value={{
      address, signer, provider, chainId,
      isConnected: !!address, isConnecting,
      connect, disconnect,
      switchToXLayer,
      openWalletModal: connect,
    }}>
      {children}
    </Web3Context.Provider>
  );
}

export const useWeb3 = () => useContext(Web3Context);
