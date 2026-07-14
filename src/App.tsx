import { useState } from "react";
import Web3Provider from "./providers/Web3Provider";
import EnhancedCarRaceGame from "./components/EnhancedCarRaceGame";
import ConnectButton from "./components/ConnectButton";
import ErrorBoundary from "./components/ErrorBoundary";

function GameWrapper() {
  const [username, setUsername] = useState("");
  const [gameStarted, setGameStarted] = useState(false);

  if (gameStarted) {
    return <EnhancedCarRaceGame username={username || "Guest"} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a3a5c 0%, #2266cc 50%, #77bbff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        padding: "20px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 50,
        }}
      >
        <ConnectButton />
      </div>

      <div
        style={{
          textAlign: "center",
          color: "white",
          maxWidth: "460px",
          padding: "20px",
        }}
      >
        <h1
          style={{
            fontSize: "56px",
            fontWeight: "900",
            marginBottom: "8px",
            letterSpacing: "-2px",
          }}
        >
          MiniRacer
        </h1>
        <p
          style={{
            fontSize: "18px",
            marginBottom: "36px",
            opacity: 0.85,
          }}
        >
          Race. Score. Repeat.
        </p>

        <div
          style={{
            background: "rgba(0,0,0,0.25)",
            borderRadius: "16px",
            padding: "28px",
            marginBottom: "20px",
          }}
        >
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            onKeyDown={(e) => {
              if (e.key === "Enter" && username.trim()) {
                setGameStarted(true);
              }
            }}
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: "10px",
              border: "2px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              fontSize: "16px",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: "16px",
            }}
          />

          <button
            onClick={() => setGameStarted(true)}
            disabled={!username.trim()}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: username.trim()
                ? "linear-gradient(45deg, #22cc88, #44ddaa)"
                : "#555",
              color: username.trim() ? "#1a1a2e" : "#999",
              fontSize: "17px",
              fontWeight: "bold",
              cursor: username.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
              marginBottom: "12px",
            }}
          >
            Start Racing
          </button>

          <button
            onClick={() => {
              setUsername("Guest");
              setGameStarted(true);
            }}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
              color: "rgba(255,255,255,0.7)",
              fontSize: "15px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Play as Guest
          </button>
        </div>

        <p style={{ fontSize: "13px", opacity: 0.5 }}>
          Arrow keys or mouse to steer. Avoid obstacles. Collect bonuses.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Web3Provider>
        <GameWrapper />
      </Web3Provider>
    </ErrorBoundary>
  );
}

export default App;
