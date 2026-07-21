import { useState } from "react";
import Web3Provider from "./providers/Web3Provider";
import EnhancedCarRaceGame from "./components/EnhancedCarRaceGame";
import ConnectButton from "./components/ConnectButton";
import ErrorBoundary from "./components/ErrorBoundary";

const CAR_OPTIONS = [
  { color: 0x3388ff, name: "Blue Bolt", hex: "#3388ff" },
  { color: 0xff4444, name: "Red Fury", hex: "#ff4444" },
  { color: 0x44cc44, name: "Green Machine", hex: "#44cc44" },
  { color: 0xff8800, name: "Orange Blaze", hex: "#ff8800" },
  { color: 0xcc44cc, name: "Purple Storm", hex: "#cc44cc" },
  { color: 0x00cccc, name: "Cyan Surge", hex: "#00cccc" },
];

function GameWrapper() {
  const [username, setUsername] = useState("");
  const [step, setStep] = useState<"username" | "car_select" | "playing">("username");
  const [selectedCar, setSelectedCar] = useState(0);

  if (step === "playing") {
    return (
      <EnhancedCarRaceGame
        username={username || "Guest"}
        selectedCarColor={CAR_OPTIONS[selectedCar].color}
      />
    );
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

        {step === "username" && (
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
                  setStep("car_select");
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
              onClick={() => setStep("car_select")}
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
              Next
            </button>

            <button
              onClick={() => {
                setUsername("Guest");
                setStep("car_select");
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
        )}

        {step === "car_select" && (
          <div
            style={{
              background: "rgba(0,0,0,0.25)",
              borderRadius: "16px",
              padding: "28px",
              marginBottom: "20px",
            }}
          >
            <h3
              style={{
                fontSize: "22px",
                fontWeight: "bold",
                marginBottom: "20px",
              }}
            >
              Choose Your Ride
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              {CAR_OPTIONS.map((car, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedCar(i)}
                  style={{
                    padding: "16px 8px",
                    borderRadius: "12px",
                    border: selectedCar === i
                      ? "3px solid #22cc88"
                      : "2px solid rgba(255,255,255,0.2)",
                    background: selectedCar === i
                      ? "rgba(34,204,136,0.15)"
                      : "rgba(255,255,255,0.05)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {/* Car preview block */}
                  <div
                    style={{
                      width: "50px",
                      height: "30px",
                      borderRadius: "6px",
                      background: car.hex,
                      boxShadow: selectedCar === i
                        ? `0 0 16px ${car.hex}88`
                        : "none",
                    }}
                  />
                  <span
                    style={{
                      color: "white",
                      fontSize: "11px",
                      fontWeight: selectedCar === i ? "bold" : "normal",
                      opacity: selectedCar === i ? 1 : 0.7,
                    }}
                  >
                    {car.name}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep("playing")}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "10px",
                border: "none",
                background: "linear-gradient(45deg, #22cc88, #44ddaa)",
                color: "#1a1a2e",
                fontSize: "17px",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s ease",
                marginBottom: "12px",
              }}
            >
              Start Racing
            </button>

            <button
              onClick={() => setStep("username")}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              Back
            </button>
          </div>
        )}

        <p style={{ fontSize: "13px", opacity: 0.5 }}>
          Arrow keys to steer (or click + drag). Avoid obstacles. Collect coins.
          <br />
          You have 3 lives per run!
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
