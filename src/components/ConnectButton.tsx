import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { isMiniPay } from "../config/web3Config";

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Auto-connect when inside MiniPay (required by MiniPay guidelines)
  useEffect(() => {
    if (isMiniPay && !isConnected) {
      connect({ connector: injected({ target: "metaMask" }) });
    }
  }, [isConnected, connect]);

  // Inside MiniPay: hide button entirely (auto-connected)
  if (isMiniPay) {
    if (isConnected) {
      return (
        <span
          style={{
            fontSize: "13px",
            color: "#a0f0c8",
            fontFamily: "monospace",
          }}
        >
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
      );
    }
    return null;
  }

  // Outside MiniPay: show connect/disconnect button
  if (isConnected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "13px",
            color: "#a0f0c8",
            fontFamily: "monospace",
          }}
        >
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          style={{
            padding: "8px 14px",
            backgroundColor: "rgba(239, 68, 68, 0.8)",
            color: "white",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  const handleConnect = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
  };

  return (
    <button
      onClick={handleConnect}
      style={{
        padding: "10px 20px",
        backgroundColor: "#22cc88",
        color: "#1a1a2e",
        border: "none",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "15px",
        fontWeight: "bold",
      }}
    >
      Connect Wallet
    </button>
  );
}
