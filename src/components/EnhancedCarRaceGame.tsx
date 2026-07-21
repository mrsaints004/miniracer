import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
// GAME CONSTANTS — everything tunable lives here
// ─────────────────────────────────────────────────────────────

// Road geometry
const ROAD_WIDTH = 10;            // total road surface width
const ROAD_HALF = ROAD_WIDTH / 2; // 5
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT; // ~3.33
const LANE_CENTERS = [
  -LANE_WIDTH,                    // left lane  ≈ -3.33
  0,                              // center lane
  LANE_WIDTH,                     // right lane ≈ +3.33
];

// Road segment recycling
const SEG_LENGTH = 80;            // z-length of one road segment
const SEG_COUNT = 8;              // total segments alive at once
// Total road z-coverage: SEG_LENGTH * SEG_COUNT = 640

// Obstacle spawning — wider gaps for breathing room
const MIN_OBSTACLE_GAP = 60;      // min z-distance between consecutive obstacle rows
const MAX_LANES_BLOCKED = 2;      // at most 2 of 3 lanes blocked at once (always 1 free)

// Road events
type RoadEvent = "normal" | "speed_boost" | "construction" | "overpass" | "coin_streak";
const ROAD_EVENT_CHANCE = 0.50;   // 50% chance a recycled segment gets an event

// Car physics
const CAR_LANE_SPEED = 0.12;      // how fast car switches lanes (units per frame)
const CAR_HALF_W = 1.0;           // half-width for collision
const CAR_HALF_Z = 1.75;          // half-length for collision

// Colors
const CAR_COLORS = [0x3388ff, 0xff4444, 0x44cc44, 0xff8800, 0xcc44cc, 0x00cccc];

// ─────────────────────────────────────────────────────────────

interface GameGroup extends THREE.Group {
  collected?: boolean;
}

interface EnhancedCarRaceGameProps {
  username: string;
  selectedCarColor?: number;
}

const EnhancedCarRaceGame: React.FC<EnhancedCarRaceGameProps> = ({ username, selectedCarColor }) => {
  // ── Refs ──
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const carRef = useRef<THREE.Group | null>(null);
  const obstaclesRef = useRef<GameGroup[]>([]);
  const bonusBoxesRef = useRef<GameGroup[]>([]);
  const goldenKeysRef = useRef<GameGroup[]>([]);
  const invisibilityIndicatorRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>(0);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);

  // Road segment groups (recycled)
  const roadSegsRef = useRef<THREE.Group[]>([]);
  // Environment groups attached to each segment
  const buildingGroupsRef = useRef<THREE.Group[]>([]);
  const treeGroupsRef = useRef<THREE.Group[]>([]);
  const wheelMeshesRef = useRef<THREE.Mesh[]>([]);

  const keysRef = useRef({ left: false, right: false, up: false, down: false });

  // The car's current lane index (0 = left, 1 = center, 2 = right)
  const carLaneRef = useRef(1); // start center
  // Actual x-position (smoothly lerps toward target lane)
  const carXRef = useRef(0);

  // Last z where an obstacle row was spawned — ensures minimum gap
  const lastObstacleZRef = useRef(0);
  // Cumulative distance traveled (for spawning logic, car stays at z=0)
  const distanceTraveledRef = useRef(0);

  // Road event objects (attached to segments, cleaned up on recycle)
  const roadEventObjectsRef = useRef<Map<number, THREE.Group[]>>(new Map());
  // Speed boost zones active in the scene: { zStart, zEnd }
  const speedBoostZonesRef = useRef<{ z: number; segIdx: number }[]>([]);
  // Coin streak objects
  const coinStreakRef = useRef<{ mesh: THREE.Mesh; segIdx: number }[]>([]);

  const gameStateRef = useRef({
    baseGameSpeed: 0.005,
    speedMultiplier: 0.7,
    obstacleSpawnRate: 0.008,
    nextBonusThreshold: 70,
    gameStartTime: Date.now(),
    nextKeySpawnTime: 20,
    keySpawnInterval: 40,
    isInvisible: false,
    invisibilityTimer: 0,
    currentScore: 0,
    maxSpeed: 1.6,
    coinsCollected: 0,
    lives: 3,
    respawnInvincible: false,
    respawnTimer: 0,
  });

  const gameStatsRef = useRef({
    distance: 0,
    obstaclesAvoided: 0,
    bonusBoxesCollected: 0,
    gameStartTime: Date.now(),
    finalScore: 0,
    lapTime: 0,
  });

  const gameRunningRef = useRef(false);
  const lastFrameTimeRef = useRef(0);

  // Shared geometry / material refs (created once in init)
  const sharedRef = useRef<{
    mats: Record<string, THREE.Material>;
    geos: Record<string, THREE.BufferGeometry>;
  } | null>(null);

  // ── React state ──
  const [gameRunning, setGameRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [highScore, setHighScore] = useState(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [invisibilityActive, setInvisibilityActive] = useState(false);
  const [invisibilityCountdown, setInvisibilityCountdown] = useState(0);
  const [popup, setPopup] = useState<string | null>(null);
  const [speedBoostActive, setSpeedBoostActive] = useState(false);
  const speedBoostActiveRef = useRef(false);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [currentLane, setCurrentLane] = useState(1);

  // ── Load high score ──
  useEffect(() => {
    const saved = localStorage.getItem("miniRacer_highScore");
    if (saved) setHighScore(parseInt(saved));
  }, []);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── Helpers ──
  const showPopup = useCallback((text: string) => {
    setPopup(text);
    setTimeout(() => setPopup(null), 2500);
  }, []);

  const saveHighScore = useCallback(
    (s: number) => {
      if (s > highScore) {
        setHighScore(s);
        setIsNewHighScore(true);
        localStorage.setItem("miniRacer_highScore", s.toString());
        return true;
      }
      return false;
    },
    [highScore]
  );

  // ── Invisibility ──
  const activateInvisibility = useCallback(() => {
    gameStateRef.current.isInvisible = true;
    gameStateRef.current.invisibilityTimer = 15000;
    setInvisibilityActive(true);
    setInvisibilityCountdown(15);
    if (invisibilityIndicatorRef.current) invisibilityIndicatorRef.current.visible = true;
    if (carRef.current) {
      carRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m) { m.transparent = true; m.opacity = 0.55; }
        }
      });
    }
    showPopup("INVISIBLE MODE (15s)");
  }, [showPopup]);

  const deactivateInvisibility = useCallback(() => {
    gameStateRef.current.isInvisible = false;
    gameStateRef.current.invisibilityTimer = 0;
    setInvisibilityActive(false);
    setInvisibilityCountdown(0);
    if (invisibilityIndicatorRef.current) invisibilityIndicatorRef.current.visible = false;
    if (carRef.current) {
      carRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m) { m.transparent = false; m.opacity = 1.0; }
        }
      });
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // OBSTACLE SPAWNING — lane-based, guaranteed passable
  // ─────────────────────────────────────────────────────────
  const createObstacleRow = useCallback(
    (spawnZ: number) => {
      if (!sceneRef.current || !sharedRef.current) return;
      const { mats, geos } = sharedRef.current;

      // Decide how many lanes to block: 1 or 2 (never all 3)
      const blockCount = Math.random() < 0.6 ? 1 : Math.min(MAX_LANES_BLOCKED, 2);

      // Pick which lanes to block
      const laneIndices = [0, 1, 2];
      // Shuffle
      for (let i = laneIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [laneIndices[i], laneIndices[j]] = [laneIndices[j], laneIndices[i]];
      }
      const blockedLanes = laneIndices.slice(0, blockCount);

      for (const laneIdx of blockedLanes) {
        const laneX = LANE_CENTERS[laneIdx];
        const group = new THREE.Group() as GameGroup;

        const rand = Math.random();
        if (rand < 0.35) {
          // Traffic cone cluster
          const count = 1 + Math.floor(Math.random() * 2);
          for (let c = 0; c < count; c++) {
            const cone = new THREE.Mesh(
              geos.cone as THREE.ConeGeometry,
              mats.cone
            );
            cone.position.set(c * 0.5 - (count - 1) * 0.25, 0.35, 0);
            cone.castShadow = true;
            group.add(cone);
          }
        } else if (rand < 0.7) {
          // Barrier
          const barrier = new THREE.Mesh(geos.barrier, mats.barrier);
          barrier.position.y = 0.35;
          barrier.castShadow = true;
          group.add(barrier);
          const stripe = new THREE.Mesh(geos.barrierStripe, mats.barrierStripe);
          stripe.position.y = 0.48;
          group.add(stripe);
        } else {
          // Stalled car
          const body = new THREE.Mesh(geos.stalledBody, mats.stalledCar);
          body.position.y = 0.55;
          body.castShadow = true;
          group.add(body);
          const roof = new THREE.Mesh(geos.stalledRoof, mats.stalledCar);
          roof.position.set(0, 1.0, -0.15);
          roof.castShadow = true;
          group.add(roof);
        }

        group.position.set(laneX, 0, spawnZ);
        sceneRef.current!.add(group);
        obstaclesRef.current.push(group);
      }
    },
    []
  );

  // ─────────────────────────────────────────────────────────
  // ROAD EVENTS — dynamic segment features
  // ─────────────────────────────────────────────────────────
  const clearRoadEvent = useCallback((segIdx: number) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove 3D objects attached to this segment
    const objs = roadEventObjectsRef.current.get(segIdx);
    if (objs) {
      objs.forEach((g) => scene.remove(g));
      roadEventObjectsRef.current.delete(segIdx);
    }

    // Remove speed boost zones for this segment
    speedBoostZonesRef.current = speedBoostZonesRef.current.filter(
      (z) => z.segIdx !== segIdx
    );

    // Remove coin streaks for this segment
    coinStreakRef.current = coinStreakRef.current.filter((c) => {
      if (c.segIdx === segIdx) {
        scene.remove(c.mesh);
        return false;
      }
      return true;
    });
  }, []);

  const spawnRoadEvent = useCallback(
    (segIdx: number, segZ: number) => {
      if (!sceneRef.current || !sharedRef.current) return;
      if (Math.random() > ROAD_EVENT_CHANCE) return; // no event this time

      const scene = sceneRef.current;
      const { mats } = sharedRef.current;
      const eventObjs: THREE.Group[] = [];

      // Pick a random event — coin_streak weighted higher for more coin visibility
      const events: RoadEvent[] = ["speed_boost", "construction", "overpass", "coin_streak", "coin_streak", "coin_streak"];
      const event = events[Math.floor(Math.random() * events.length)];

      if (event === "speed_boost") {
        // Blue/cyan ramp on the road surface
        const rampGroup = new THREE.Group();
        const rampMat = new THREE.MeshStandardMaterial({
          color: 0x00ccff,
          emissive: new THREE.Color(0x00aaff),
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.7,
        });

        // Arrow-shaped boost pad
        const padGeo = new THREE.PlaneGeometry(ROAD_WIDTH * 0.8, 8);
        const pad = new THREE.Mesh(padGeo, rampMat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(0, 0.02, 0);
        rampGroup.add(pad);

        // Chevron arrows on the pad (3 arrows)
        const arrowMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.8,
        });
        for (let a = -2; a <= 2; a += 2) {
          const arrowGeo = new THREE.PlaneGeometry(1.5, 0.15);
          const arrowL = new THREE.Mesh(arrowGeo, arrowMat);
          arrowL.rotation.x = -Math.PI / 2;
          arrowL.rotation.z = 0.4;
          arrowL.position.set(-0.5, 0.025, a);
          rampGroup.add(arrowL);

          const arrowR = new THREE.Mesh(arrowGeo, arrowMat);
          arrowR.rotation.x = -Math.PI / 2;
          arrowR.rotation.z = -0.4;
          arrowR.position.set(0.5, 0.025, a);
          rampGroup.add(arrowR);
        }

        rampGroup.position.set(0, 0, segZ);
        scene.add(rampGroup);
        eventObjs.push(rampGroup);

        speedBoostZonesRef.current.push({ z: segZ, segIdx });
      } else if (event === "construction") {
        // Orange construction zone — narrows road with cone lines on sides
        const conGroup = new THREE.Group();
        const coneMat = mats.cone;
        const coneGeo = new THREE.ConeGeometry(0.2, 0.6, 6);

        // Two lines of cones narrowing the road
        for (let z = -SEG_LENGTH / 2 + 4; z < SEG_LENGTH / 2 - 4; z += 5) {
          [-3.5, 3.5].forEach((x) => {
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.set(x, 0.3, z);
            cone.castShadow = true;
            conGroup.add(cone);
          });
        }

        // Warning stripes on ground
        const stripeMat = new THREE.MeshStandardMaterial({
          color: 0xff8800,
          transparent: true,
          opacity: 0.5,
        });
        const stripeGeo = new THREE.PlaneGeometry(1.5, SEG_LENGTH - 8);
        [-3.5, 3.5].forEach((x) => {
          const stripe = new THREE.Mesh(stripeGeo, stripeMat);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(x, 0.008, 0);
          conGroup.add(stripe);
        });

        conGroup.position.set(0, 0, segZ);
        scene.add(conGroup);
        eventObjs.push(conGroup);
      } else if (event === "overpass") {
        // Concrete overpass bridge above the road
        const overGroup = new THREE.Group();
        const concreteMat = new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.9,
        });

        // Bridge deck
        const deckGeo = new THREE.BoxGeometry(28, 0.6, 6);
        const deck = new THREE.Mesh(deckGeo, concreteMat);
        deck.position.set(0, 7.5, 0);
        deck.castShadow = true;
        deck.receiveShadow = true;
        overGroup.add(deck);

        // Support columns
        [-10, 10].forEach((x) => {
          const colGeo = new THREE.BoxGeometry(1.2, 7.5, 1.2);
          const col = new THREE.Mesh(colGeo, concreteMat);
          col.position.set(x, 3.75, 0);
          col.castShadow = true;
          overGroup.add(col);
        });

        // Railing on top
        const railGeo = new THREE.BoxGeometry(28, 0.6, 0.1);
        const railMat = new THREE.MeshStandardMaterial({
          color: 0xaaaaaa,
          metalness: 0.6,
        });
        [-2.9, 2.9].forEach((z) => {
          const rail = new THREE.Mesh(railGeo, railMat);
          rail.position.set(0, 8.1, z);
          overGroup.add(rail);
        });

        overGroup.position.set(0, 0, segZ);
        scene.add(overGroup);
        eventObjs.push(overGroup);
      } else if (event === "coin_streak") {
        // Line of floating coins down one lane — big & glowing like Subway Surfers
        const coinLane = LANE_CENTERS[Math.floor(Math.random() * LANE_COUNT)];
        const coinMat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          metalness: 1.0,
          roughness: 0.05,
          emissive: new THREE.Color(0xffcc00),
          emissiveIntensity: 1.2,
        });
        const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 20);

        // Glow ring around each coin
        const glowMat = new THREE.MeshStandardMaterial({
          color: 0xffee44,
          emissive: new THREE.Color(0xffdd00),
          emissiveIntensity: 1.5,
          transparent: true,
          opacity: 0.35,
        });
        const glowGeo = new THREE.RingGeometry(0.6, 1.0, 20);

        for (let z = -SEG_LENGTH / 2 + 5; z < SEG_LENGTH / 2 - 5; z += 3.5) {
          const coinGroup = new THREE.Group();

          const coin = new THREE.Mesh(coinGeo, coinMat);
          coin.rotation.x = Math.PI / 2;
          coin.castShadow = true;
          coinGroup.add(coin);

          // Add glow ring
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.rotation.x = Math.PI / 2;
          coinGroup.add(glow);

          coinGroup.position.set(coinLane, 1.2, segZ + z);
          scene.add(coinGroup);
          coinStreakRef.current.push({ mesh: coinGroup as unknown as THREE.Mesh, segIdx });
        }
      }

      if (eventObjs.length > 0) {
        roadEventObjectsRef.current.set(segIdx, eventObjs);
      }
    },
    []
  );

  // ── Bonus box ──
  const createBonusBox = useCallback((spawnZ: number) => {
    if (!sceneRef.current || !sharedRef.current) return;
    const { mats, geos } = sharedRef.current;

    const group = new THREE.Group() as GameGroup;
    const box = new THREE.Mesh(geos.bonusBox, mats.bonusBox);
    box.position.y = 1.2;
    box.castShadow = true;
    group.add(box);

    (group as any).userData = { bobPhase: Math.random() * Math.PI * 2 };

    // Pick a random lane
    const lane = LANE_CENTERS[Math.floor(Math.random() * LANE_COUNT)];
    group.position.set(lane, 0, spawnZ);

    sceneRef.current.add(group);
    bonusBoxesRef.current.push(group);
  }, []);

  // ── Golden key ──
  const createGoldenKey = useCallback((spawnZ: number) => {
    if (!sceneRef.current || !sharedRef.current) return;
    const { mats, geos } = sharedRef.current;

    const group = new THREE.Group() as GameGroup;
    const handle = new THREE.Mesh(geos.keyHandle, mats.goldenKey);
    handle.position.y = 1.8;
    handle.castShadow = true;
    group.add(handle);

    const shaft = new THREE.Mesh(geos.keyShaft, mats.goldenKey);
    shaft.position.set(0, 1.8, -0.75);
    shaft.castShadow = true;
    group.add(shaft);

    (group as any).userData = {
      rotationSpeed: 0.06,
      bobPhase: Math.random() * Math.PI * 2,
    };

    const lane = LANE_CENTERS[Math.floor(Math.random() * LANE_COUNT)];
    group.position.set(lane, 0, spawnZ);

    sceneRef.current.add(group);
    goldenKeysRef.current.push(group);
  }, []);

  // ── Lose a life / end game ──
  const loseLife = useCallback(() => {
    if (!gameRunningRef.current || gameOver) return;
    const gs = gameStateRef.current;

    gs.lives -= 1;
    setLives(gs.lives);

    if (gs.lives <= 0) {
      // Game over — no lives left
      setGameRunning(false);
      gameRunningRef.current = false;
      setGameOver(true);

      gameStatsRef.current.lapTime =
        (Date.now() - gameStatsRef.current.gameStartTime) / 1000;
      gameStatsRef.current.finalScore = gs.currentScore;

      const isNew = saveHighScore(gameStatsRef.current.finalScore);
      if (isNew) showPopup(`NEW HIGH SCORE! ${gameStatsRef.current.finalScore} pts!`);
    } else {
      // Respawn with brief invincibility
      gs.respawnInvincible = true;
      gs.respawnTimer = 2500; // 2.5 seconds of invincibility after crash
      showPopup(`CRASHED! ${gs.lives} ${gs.lives === 1 ? "life" : "lives"} left`);

      // Flash car to indicate invincibility
      if (carRef.current) {
        carRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (m) { m.transparent = true; m.opacity = 0.4; }
          }
        });
      }
    }
  }, [gameOver, saveHighScore, showPopup]);

  // Keep endGame as alias for direct game-over (used nowhere now but kept for safety)
  const endGame = loseLife;

  // ─────────────────────────────────────────────────────────
  // ANIMATION LOOP
  // ─────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    if (!gameRunningRef.current) return;
    if (
      !rendererRef.current ||
      !sceneRef.current ||
      !cameraRef.current ||
      !carRef.current
    ) {
      animationIdRef.current = requestAnimationFrame(animate);
      return;
    }

    const car = carRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const now = Date.now();
    const time = now * 0.001;
    const deltaMs = lastFrameTimeRef.current ? Math.min(now - lastFrameTimeRef.current, 50) : 16;
    lastFrameTimeRef.current = now;
    const gs = gameStateRef.current;

    // ── Speed ──
    if (keysRef.current.up) {
      gs.speedMultiplier = Math.min(gs.maxSpeed, gs.speedMultiplier + 0.015);
    }
    if (keysRef.current.down) {
      gs.speedMultiplier = Math.max(0.3, gs.speedMultiplier - 0.02);
    }
    const frameSpeed = gs.baseGameSpeed * gs.speedMultiplier; // units/frame factor
    const moveZ = frameSpeed * 30; // actual z-units the car moves this frame
    // Only update React state when displayed value changes (1 decimal)
    const roundedSpeed = Math.round(gs.speedMultiplier * 10) / 10;
    setSpeed((prev) => (Math.round(prev * 10) / 10 === roundedSpeed ? prev : gs.speedMultiplier));

    // ── Invisibility ──
    if (gs.isInvisible) {
      gs.invisibilityTimer -= deltaMs;
      setInvisibilityCountdown(Math.max(0, Math.ceil(gs.invisibilityTimer / 1000)));
      if (invisibilityIndicatorRef.current)
        invisibilityIndicatorRef.current.rotation.y += 0.1;
      if (gs.invisibilityTimer <= 0) deactivateInvisibility();
    }

    // ── Respawn invincibility ──
    if (gs.respawnInvincible) {
      gs.respawnTimer -= deltaMs;
      // Flash the car (blink effect)
      if (carRef.current) {
        const shouldShow = Math.floor(time * 10) % 2 === 0;
        carRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (m) { m.opacity = shouldShow ? 0.8 : 0.3; }
          }
        });
      }
      if (gs.respawnTimer <= 0) {
        gs.respawnInvincible = false;
        // Restore car opacity
        if (carRef.current) {
          carRef.current.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
              if (m) { m.transparent = false; m.opacity = 1.0; }
            }
          });
        }
      }
    }

    // ── Move world toward car (car stays at z=0) ──
    distanceTraveledRef.current += moveZ;

    // Move all world objects toward the car
    obstaclesRef.current.forEach(obs => { obs.position.z += moveZ; });
    bonusBoxesRef.current.forEach(box => { box.position.z += moveZ; });
    goldenKeysRef.current.forEach(key => { key.position.z += moveZ; });

    roadSegsRef.current.forEach((seg, idx) => {
      seg.position.z += moveZ;
      if (buildingGroupsRef.current[idx]) buildingGroupsRef.current[idx].position.z += moveZ;
      if (treeGroupsRef.current[idx]) treeGroupsRef.current[idx].position.z += moveZ;
    });

    roadEventObjectsRef.current.forEach((objs) => {
      objs.forEach(g => { g.position.z += moveZ; });
    });

    coinStreakRef.current.forEach(c => { c.mesh.position.z += moveZ; });

    speedBoostZonesRef.current.forEach(zone => { zone.z += moveZ; });

    // ── Lane-based steering ──
    // Keyboard: switch target lane
    // (handled via keydown, sets carLaneRef)
    const targetX = LANE_CENTERS[carLaneRef.current];
    const dx = targetX - carXRef.current;
    if (Math.abs(dx) > 0.05) {
      carXRef.current += Math.sign(dx) * CAR_LANE_SPEED;
    } else {
      carXRef.current = targetX;
    }
    // Clamp to road boundaries
    carXRef.current = Math.max(
      -ROAD_HALF + CAR_HALF_W,
      Math.min(ROAD_HALF - CAR_HALF_W, carXRef.current)
    );
    car.position.x = carXRef.current;
    setCurrentLane(carLaneRef.current);

    // Slight car tilt when turning
    const tiltTarget = -dx * 0.06;
    car.rotation.z += (tiltTarget - car.rotation.z) * 0.1;

    // ── Distance / score ──
    const newDist = Math.floor(
      (Date.now() - gameStatsRef.current.gameStartTime) / 100
    );
    gameStatsRef.current.distance = newDist;

    // ── Chase camera ──
    const speedNorm = Math.min(gs.speedMultiplier / gs.maxSpeed, 1.0);
    const camTarget = new THREE.Vector3(
      car.position.x * 0.25,
      3.2 + speedNorm * 0.8,
      car.position.z + 8 + speedNorm * 2
    );
    camera.position.lerp(camTarget, 0.06);
    camera.lookAt(
      car.position.x * 0.5,
      0.8,
      car.position.z - 15 - speedNorm * 8
    );

    // FOV speed effect (65 → 78)
    const fovTarget = 65 + speedNorm * 13;
    camera.fov += (fovTarget - camera.fov) * 0.05;
    camera.updateProjectionMatrix();

    // ── Move sun with car ──
    if (sunRef.current) {
      sunRef.current.position.set(30, 50, car.position.z - 20);
      sunRef.current.target.position.set(0, 0, car.position.z - 30);
    }

    // ── Recycle road segments + spawn road events ──
    roadSegsRef.current.forEach((seg, idx) => {
      if (seg.position.z > SEG_LENGTH) {
        let minZ = Infinity;
        roadSegsRef.current.forEach((s) => {
          if (s.position.z < minZ) minZ = s.position.z;
        });
        seg.position.z = minZ - SEG_LENGTH;

        if (buildingGroupsRef.current[idx]) {
          buildingGroupsRef.current[idx].position.z = seg.position.z;
        }
        if (treeGroupsRef.current[idx]) {
          treeGroupsRef.current[idx].position.z = seg.position.z;
        }

        // Clear old road event and maybe spawn a new one
        clearRoadEvent(idx);
        spawnRoadEvent(idx, seg.position.z);
      }
    });

    // ── Speed boost zone detection ──
    let inBoostZone = false;
    speedBoostZonesRef.current.forEach((zone) => {
      const dz = car.position.z - zone.z;
      if (Math.abs(dz) < 5) {
        inBoostZone = true;
      }
    });
    if (inBoostZone) {
      gs.speedMultiplier = Math.min(gs.maxSpeed, gs.speedMultiplier + 0.04);
      if (!speedBoostActiveRef.current) {
        speedBoostActiveRef.current = true;
        setSpeedBoostActive(true);
        showPopup("SPEED BOOST!");
      }
    } else if (speedBoostActiveRef.current) {
      speedBoostActiveRef.current = false;
      setSpeedBoostActive(false);
    }

    // ── Coin streak collection ──
    for (let i = coinStreakRef.current.length - 1; i >= 0; i--) {
      const coin = coinStreakRef.current[i];
      // Rotate coins
      coin.mesh.rotation.y += 0.08;
      // Bob coins (higher amplitude)
      coin.mesh.position.y = 1.2 + Math.sin(time * 5 + i * 0.4) * 0.25;

      // Collect (slightly larger pickup radius)
      const cdz = Math.abs(coin.mesh.position.z - car.position.z);
      const cdx = Math.abs(coin.mesh.position.x - car.position.x);
      if (cdz < 2.0 && cdx < 1.5) {
        scene.remove(coin.mesh);
        coinStreakRef.current.splice(i, 1);
        gs.currentScore += 10;
        gs.coinsCollected += 1;
        setScore(gs.currentScore);
        setCoins(gs.coinsCollected);
      }
    }

    // ── Wheel spin ──
    wheelMeshesRef.current.forEach((w) => {
      w.rotation.x += moveZ * 0.8;
    });

    // ── Bonus box animation ──
    bonusBoxesRef.current.forEach((box) => {
      const ud = (box as any).userData;
      if (ud?.bobPhase !== undefined && box.children[0]) {
        box.children[0].position.y =
          1.2 + Math.sin(time * 3 + ud.bobPhase) * 0.25;
      }
      box.rotation.y += 0.025;
    });

    // ── Golden key animation ──
    goldenKeysRef.current.forEach((key) => {
      const ud = (key as any).userData;
      key.rotation.y += ud.rotationSpeed;
      if (ud.bobPhase !== undefined) {
        const bob = Math.sin(time * 4 + ud.bobPhase) * 0.25;
        key.children.forEach((child: THREE.Object3D) => {
          if (child.position.y > 0.5) child.position.y = 1.8 + bob;
        });
      }
    });

    // ── Spawn obstacle rows ──
    // Spawn obstacles ahead based on cumulative distance traveled
    const spawnHorizon = distanceTraveledRef.current + 350;
    while (lastObstacleZRef.current < spawnHorizon) {
      lastObstacleZRef.current += MIN_OBSTACLE_GAP;
      if (Math.random() < gs.obstacleSpawnRate * 5) {
        createObstacleRow(-(lastObstacleZRef.current - distanceTraveledRef.current));
      }
    }

    // ── Spawn bonuses at score thresholds ──
    if (gs.currentScore >= gs.nextBonusThreshold) {
      createBonusBox(-150 - Math.random() * 50);
      gs.nextBonusThreshold += 70;
    }

    // ── Spawn golden keys on timer ──
    const elapsed = (Date.now() - gs.gameStartTime) / 1000;
    if (elapsed >= gs.nextKeySpawnTime) {
      createGoldenKey(-180 - Math.random() * 40);
      gs.nextKeySpawnTime += gs.keySpawnInterval;
    }

    // ── Collision detection — obstacles ──
    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];

      // Passed behind car — remove and score
      if (obs.position.z > 5) {
        scene.remove(obs);
        obstaclesRef.current.splice(i, 1);
        gs.currentScore += 5;
        setScore(gs.currentScore);
        gameStatsRef.current.obstaclesAvoided++;
        continue;
      }

      // Collision check (axis-aligned bounding box)
      if (!gs.isInvisible && !gs.respawnInvincible) {
        const dz = Math.abs(obs.position.z - car.position.z);
        const dx = Math.abs(obs.position.x - car.position.x);
        if (dz < CAR_HALF_Z && dx < (CAR_HALF_W + 0.6)) {
          endGame();
          // Remove the obstacle that hit us
          scene.remove(obs);
          obstaclesRef.current.splice(i, 1);
          // If game over (no lives left), stop the loop
          if (!gameRunningRef.current) return;
          // Otherwise lives remain — keep going (break out of obstacle loop only)
          break;
        }
      }
    }

    // ── Collision — bonus boxes ──
    for (let i = bonusBoxesRef.current.length - 1; i >= 0; i--) {
      const box = bonusBoxesRef.current[i];
      if (box.position.z > 8) {
        scene.remove(box);
        bonusBoxesRef.current.splice(i, 1);
      } else if (
        Math.abs(box.position.z - car.position.z) < 2.0 &&
        Math.abs(box.position.x - car.position.x) < 1.5
      ) {
        scene.remove(box);
        bonusBoxesRef.current.splice(i, 1);
        gs.currentScore += 30;
        setScore(gs.currentScore);
        gameStatsRef.current.bonusBoxesCollected++;
        showPopup("+30 BONUS!");
      }
    }

    // ── Collision — golden keys ──
    for (let i = goldenKeysRef.current.length - 1; i >= 0; i--) {
      const key = goldenKeysRef.current[i];
      if (key.position.z > 8) {
        scene.remove(key);
        goldenKeysRef.current.splice(i, 1);
      } else if (
        Math.abs(key.position.z - car.position.z) < 2.0 &&
        Math.abs(key.position.x - car.position.x) < 1.5
      ) {
        scene.remove(key);
        goldenKeysRef.current.splice(i, 1);
        activateInvisibility();
      }
    }

    // ── Gradual difficulty (slower ramp) ──
    gs.baseGameSpeed += 0.000004;
    gs.obstacleSpawnRate = Math.min(0.02, gs.obstacleSpawnRate + 0.000001);

    renderer.render(scene, camera);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [
    createObstacleRow,
    createBonusBox,
    createGoldenKey,
    activateInvisibility,
    deactivateInvisibility,
    clearRoadEvent,
    spawnRoadEvent,
    showPopup,
    endGame,
  ]);

  // ─────────────────────────────────────────────────────────
  // BUILD A SINGLE ROAD SEGMENT (reusable)
  // ─────────────────────────────────────────────────────────
  const buildRoadSegment = useCallback(
    (scene: THREE.Scene, zCenter: number, mats: Record<string, THREE.Material>) => {
      const seg = new THREE.Group();

      // Asphalt surface
      const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, SEG_LENGTH);
      const roadMesh = new THREE.Mesh(roadGeo, mats.road);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.receiveShadow = true;
      seg.add(roadMesh);

      // Grass on both sides
      const grassGeo = new THREE.PlaneGeometry(40, SEG_LENGTH);
      [-25, 25].forEach((x) => {
        const grass = new THREE.Mesh(grassGeo, mats.ground);
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(x, -0.02, 0);
        grass.receiveShadow = true;
        seg.add(grass);
      });

      // Curbs (raised concrete strips at road edge)
      const curbGeo = new THREE.BoxGeometry(0.3, 0.15, SEG_LENGTH);
      const curbMat = mats.curb;
      [-ROAD_HALF, ROAD_HALF].forEach((x) => {
        const curb = new THREE.Mesh(curbGeo, curbMat);
        curb.position.set(x, 0.075, 0);
        curb.castShadow = true;
        seg.add(curb);
      });

      // Guardrails (metal rails on top of curbs)
      const railGeo = new THREE.BoxGeometry(0.08, 0.5, SEG_LENGTH);
      [-ROAD_HALF - 0.15, ROAD_HALF + 0.15].forEach((x) => {
        const rail = new THREE.Mesh(railGeo, mats.guardrail);
        rail.position.set(x, 0.4, 0);
        rail.castShadow = true;
        seg.add(rail);
      });

      // Guardrail posts
      const postGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
      for (let z = -SEG_LENGTH / 2 + 4; z < SEG_LENGTH / 2; z += 8) {
        [-ROAD_HALF - 0.15, ROAD_HALF + 0.15].forEach((x) => {
          const post = new THREE.Mesh(postGeo, mats.guardrail);
          post.position.set(x, 0.25, z);
          seg.add(post);
        });
      }

      // Solid yellow edge lines
      const edgeGeo = new THREE.PlaneGeometry(0.12, SEG_LENGTH);
      [-(ROAD_HALF - 0.3), ROAD_HALF - 0.3].forEach((x) => {
        const edge = new THREE.Mesh(edgeGeo, mats.edgeLine);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(x, 0.005, 0);
        seg.add(edge);
      });

      // White dashed lane dividers
      const dashGeo = new THREE.PlaneGeometry(0.12, 2.5);
      for (let z = -SEG_LENGTH / 2 + 2; z < SEG_LENGTH / 2; z += 6) {
        [-LANE_WIDTH * 0.5, LANE_WIDTH * 0.5].forEach((x) => {
          const dash = new THREE.Mesh(dashGeo, mats.dash);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.005, z);
          seg.add(dash);
        });
      }

      seg.position.set(0, 0, zCenter);
      scene.add(seg);
      return seg;
    },
    []
  );

  // ─────────────────────────────────────────────────────────
  // SCENE INITIALIZATION
  // ─────────────────────────────────────────────────────────
  const initializeGame = useCallback(() => {
    if (!mountRef.current) return;

    // === SCENE ===
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcceeff, 150, 500);
    scene.background = new THREE.Color(0x88bbee);
    sceneRef.current = scene;

    // === SKY DOME ===
    const skyGeo = new THREE.SphereGeometry(450, 24, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2266cc) },
        midColor: { value: new THREE.Color(0x77bbff) },
        bottomColor: { value: new THREE.Color(0xcceeff) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor, midColor, bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col = h > 0.0 ? mix(midColor, topColor, h) : mix(midColor, bottomColor, -h*2.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // === CAMERA ===
    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    camera.position.set(0, 3.5, 15);
    cameraRef.current = camera;

    // === RENDERER ===
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    rendererRef.current = renderer;

    while (mountRef.current.firstChild)
      mountRef.current.removeChild(mountRef.current.firstChild);
    mountRef.current.appendChild(renderer.domElement);

    // === LIGHTING (3 lights) ===
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    scene.add(sun);
    scene.add(sun.target);
    sunRef.current = sun;

    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x556644, 0.7));
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // === SHARED MATERIALS & GEOMETRIES ===
    const mats: Record<string, THREE.Material> = {
      road: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.92 }),
      ground: new THREE.MeshStandardMaterial({ color: 0x55aa44, roughness: 1.0 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }),
      guardrail: new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        metalness: 0.7,
        roughness: 0.3,
      }),
      edgeLine: new THREE.MeshStandardMaterial({ color: 0xffcc00 }),
      dash: new THREE.MeshStandardMaterial({ color: 0xffffff }),
      cone: new THREE.MeshStandardMaterial({
        color: 0xff4400,
        roughness: 0.5,
        emissive: new THREE.Color(0xff2200),
        emissiveIntensity: 0.3,
      }),
      barrier: new THREE.MeshStandardMaterial({
        color: 0xff5500,
        roughness: 0.6,
        emissive: new THREE.Color(0xff3300),
        emissiveIntensity: 0.3,
      }),
      barrierStripe: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.4,
      }),
      stalledCar: new THREE.MeshStandardMaterial({
        color: 0x882222,
        roughness: 0.5,
        metalness: 0.4,
        emissive: new THREE.Color(0x661111),
        emissiveIntensity: 0.2,
      }),
      bonusBox: new THREE.MeshStandardMaterial({
        color: 0x22cc44,
        emissive: new THREE.Color(0x22cc44),
        emissiveIntensity: 0.5,
        roughness: 0.4,
      }),
      goldenKey: new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 1.0,
        roughness: 0.1,
        emissive: new THREE.Color(0xffaa00),
        emissiveIntensity: 0.8,
      }),
      treeGreen: new THREE.MeshStandardMaterial({ color: 0x33aa44, roughness: 0.9 }),
      treeTrunk: new THREE.MeshStandardMaterial({ color: 0x885533, roughness: 0.9 }),
    };

    const geos: Record<string, THREE.BufferGeometry> = {
      cone: new THREE.ConeGeometry(0.4, 1.2, 8),
      barrier: new THREE.BoxGeometry(2.0, 1.2, 0.5),
      barrierStripe: new THREE.BoxGeometry(2.02, 0.15, 0.52),
      stalledBody: new THREE.BoxGeometry(2.0, 0.6, 3.2),
      stalledRoof: new THREE.BoxGeometry(1.6, 0.5, 1.5),
      bonusBox: new THREE.BoxGeometry(1.0, 1.0, 1.0),
      keyHandle: new THREE.TorusGeometry(0.5, 0.12, 8, 16),
      keyShaft: new THREE.BoxGeometry(0.18, 0.18, 1.2),
    };

    sharedRef.current = { mats, geos };

    // === BUILD ROAD SEGMENTS ===
    roadSegsRef.current = [];
    buildingGroupsRef.current = [];
    treeGroupsRef.current = [];

    const buildingColors = [0x8888aa, 0x9999bb, 0x7777aa, 0xaaaacc, 0x7799bb, 0xbbbbdd, 0x667799, 0x99aacc];

    for (let i = 0; i < SEG_COUNT; i++) {
      const zCenter = -i * SEG_LENGTH;
      const seg = buildRoadSegment(scene, zCenter, mats);
      roadSegsRef.current.push(seg);

      // Buildings for this segment (2 per side)
      const bGroup = new THREE.Group();
      for (let side = -1; side <= 1; side += 2) {
        for (let b = 0; b < 2; b++) {
          const h = 12 + Math.random() * 28;
          const w = 4 + Math.random() * 6;
          const d = 4 + Math.random() * 6;
          const bGeo = new THREE.BoxGeometry(w, h, d);
          const bMat = new THREE.MeshStandardMaterial({
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
            roughness: 0.85,
          });
          const mesh = new THREE.Mesh(bGeo, bMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.set(
            side * (ROAD_HALF + 4 + Math.random() * 10),
            h / 2,
            -SEG_LENGTH / 4 + b * SEG_LENGTH / 2 + (Math.random() - 0.5) * 10
          );
          bGroup.add(mesh);
        }
      }
      bGroup.position.z = zCenter;
      scene.add(bGroup);
      buildingGroupsRef.current.push(bGroup);

      // Trees for this segment (1 per side)
      const tGroup = new THREE.Group();
      for (let side = -1; side <= 1; side += 2) {
        const trunkGeo = new THREE.CylinderGeometry(0.25, 0.3, 2.5, 6);
        const trunk = new THREE.Mesh(trunkGeo, mats.treeTrunk);
        trunk.position.set(
          side * (ROAD_HALF + 2 + Math.random() * 3),
          1.25,
          (Math.random() - 0.5) * SEG_LENGTH * 0.6
        );
        trunk.castShadow = true;
        tGroup.add(trunk);

        const topGeo = new THREE.ConeGeometry(1.8, 4, 8);
        const top = new THREE.Mesh(topGeo, mats.treeGreen);
        top.position.set(trunk.position.x, 4.5, trunk.position.z);
        top.castShadow = true;
        tGroup.add(top);
      }
      tGroup.position.z = zCenter;
      scene.add(tGroup);
      treeGroupsRef.current.push(tGroup);
    }

    // === CAR ===
    const carGroup = new THREE.Group();
    const carColor = selectedCarColor ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

    const paintMat = new THREE.MeshStandardMaterial({
      color: carColor,
      metalness: 0.65,
      roughness: 0.25,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x223344,
      transparent: true,
      opacity: 0.45,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.95,
    });

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 3.2),
      paintMat
    );
    body.position.y = 0.5;
    body.castShadow = true;
    carGroup.add(body);

    // Roof (slightly darker)
    const roofMat = paintMat.clone();
    roofMat.color = new THREE.Color(carColor).multiplyScalar(0.82);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.4, 1.4),
      roofMat
    );
    roof.position.set(0, 0.95, -0.1);
    roof.castShadow = true;
    carGroup.add(roof);

    // Windshield
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.38), glassMat);
    ws.position.set(0, 0.98, 0.6);
    ws.rotation.x = -0.45;
    carGroup.add(ws);

    // Rear window
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.3), glassMat);
    rw.position.set(0, 0.95, -0.85);
    rw.rotation.x = 0.35;
    carGroup.add(rw);

    // Wheels
    wheelMeshesRef.current = [];
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12);
    (
      [
        [-0.85, 0.26, 1.1],
        [0.85, 0.26, 1.1],
        [-0.85, 0.26, -1.1],
        [0.85, 0.26, -1.1],
      ] as [number, number, number][]
    ).forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.position.set(...pos);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      carGroup.add(wheel);
      wheelMeshesRef.current.push(wheel);
    });

    // Headlights
    const hlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xffffee),
      emissiveIntensity: 1.5,
    });
    [-0.65, 0.65].forEach((x) => {
      const hl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.12),
        hlMat
      );
      hl.position.set(x, 0.55, 1.61);
      carGroup.add(hl);
    });

    // Taillights
    const tlMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: new THREE.Color(0xff0000),
      emissiveIntensity: 1.2,
    });
    [-0.65, 0.65].forEach((x) => {
      const tl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.1),
        tlMat
      );
      tl.position.set(x, 0.55, -1.61);
      tl.rotation.y = Math.PI;
      carGroup.add(tl);
    });

    // Invisibility indicator
    const indMat = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: new THREE.Color(0xffff00),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
    });
    const ind = new THREE.Mesh(new THREE.SphereGeometry(0.3), indMat);
    ind.position.set(0, 1.8, 0);
    ind.visible = false;
    carGroup.add(ind);
    invisibilityIndicatorRef.current = ind;

    carGroup.position.set(0, 0, 0);
    scene.add(carGroup);
    carRef.current = carGroup;

    // === RESET GAME STATE ===
    carLaneRef.current = 1;
    carXRef.current = 0;
    lastObstacleZRef.current = 50; // first obstacle after 50 units of distance
    distanceTraveledRef.current = 0;

    gameStatsRef.current = {
      distance: 0,
      obstaclesAvoided: 0,
      bonusBoxesCollected: 0,
      gameStartTime: Date.now(),
      finalScore: 0,
      lapTime: 0,
    };

    gameStateRef.current = {
      baseGameSpeed: 0.005,
      speedMultiplier: 0.7,
      obstacleSpawnRate: 0.008,
      nextBonusThreshold: 70,
      gameStartTime: Date.now(),
      nextKeySpawnTime: 20,
      keySpawnInterval: 40,
      isInvisible: false,
      invisibilityTimer: 0,
      currentScore: 0,
      maxSpeed: 1.6,
      coinsCollected: 0,
      lives: 3,
      respawnInvincible: false,
      respawnTimer: 0,
    };

    setScore(0);
    setSpeed(0.7);
    setCoins(0);
    setLives(3);
    setGameOver(false);
    setIsNewHighScore(false);
    setInvisibilityActive(false);
    setInvisibilityCountdown(0);

    lastFrameTimeRef.current = 0;
    setGameRunning(true);
    gameRunningRef.current = true;
    setTimeout(() => animate(), 50);
  }, [animate, buildRoadSegment]);

  // ─────────────────────────────────────────────────────────
  // CONTROLS
  // ─────────────────────────────────────────────────────────
  const setupControls = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRunningRef.current) return;
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          keysRef.current.left = true;
          // Discrete lane switch
          carLaneRef.current = Math.max(0, carLaneRef.current - 1);
          break;
        case "KeyD":
        case "ArrowRight":
          keysRef.current.right = true;
          carLaneRef.current = Math.min(LANE_COUNT - 1, carLaneRef.current + 1);
          break;
        case "ArrowUp":
        case "KeyW":
          keysRef.current.up = true;
          break;
        case "ArrowDown":
        case "KeyS":
          keysRef.current.down = true;
          break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          keysRef.current.left = false;
          break;
        case "KeyD":
        case "ArrowRight":
          keysRef.current.right = false;
          break;
        case "ArrowUp":
        case "KeyW":
          keysRef.current.up = false;
          break;
        case "ArrowDown":
        case "KeyS":
          keysRef.current.down = false;
          break;
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      // Only steer with mouse when left button is held down
      if (!gameRunningRef.current || !rendererRef.current || !(e.buttons & 1)) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1 to 1

      // Map mouse x to lane
      if (mx < -0.25) carLaneRef.current = 0;
      else if (mx > 0.25) carLaneRef.current = 2;
      else carLaneRef.current = 1;
    };
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // ── Effects ──
  useEffect(() => {
    if (gameRunning && !animationIdRef.current) {
      gameRunningRef.current = true;
      gameStatsRef.current.gameStartTime = Date.now();
      gameStateRef.current.gameStartTime = Date.now();
      setTimeout(() => animate(), 50);
    } else if (!gameRunning && animationIdRef.current) {
      gameRunningRef.current = false;
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = 0;
    }
  }, [gameRunning, animate]);

  useEffect(() => {
    if (!rendererRef.current) {
      const t = setTimeout(() => initializeGame(), 100);
      return () => clearTimeout(t);
    }
  }, [initializeGame]);

  useEffect(() => {
    const cleanup = setupControls();
    return cleanup;
  }, [setupControls]);

  useEffect(() => {
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (rendererRef.current && mountRef.current) {
        try {
          if (mountRef.current.contains(rendererRef.current.domElement))
            mountRef.current.removeChild(rendererRef.current.domElement);
          rendererRef.current.dispose();
        } catch (_) {
          /* cleanup */
        }
      }
    };
  }, []);

  // ── Restart ──
  const handleRestart = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = 0;
    }
    const scene = sceneRef.current;
    if (scene) {
      obstaclesRef.current.forEach((o) => scene.remove(o));
      bonusBoxesRef.current.forEach((b) => scene.remove(b));
      goldenKeysRef.current.forEach((k) => scene.remove(k));
      obstaclesRef.current = [];
      bonusBoxesRef.current = [];
      goldenKeysRef.current = [];

      // Clean up road events + coins
      roadEventObjectsRef.current.forEach((objs) =>
        objs.forEach((g) => scene.remove(g))
      );
      roadEventObjectsRef.current.clear();
      coinStreakRef.current.forEach((c) => scene.remove(c.mesh));
      coinStreakRef.current = [];
      speedBoostZonesRef.current = [];
    }
    if (rendererRef.current && mountRef.current) {
      try {
        if (mountRef.current.contains(rendererRef.current.domElement))
          mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      } catch (_) {
        /* */
      }
      rendererRef.current = null;
    }
    sceneRef.current = null;
    carRef.current = null;
    setGameRunning(false);
    gameRunningRef.current = false;
    setGameOver(false);
    setScore(0);
    setSpeed(0.7);
    setCoins(0);
    setLives(3);
    setIsNewHighScore(false);
    setPopup(null);
    setSpeedBoostActive(false);
    speedBoostActiveRef.current = false;
    setTimeout(() => initializeGame(), 100);
  };

  // ── Mobile touch — lane switch ──
  const handleTouchLeft = () => {
    if (gameRunningRef.current) {
      carLaneRef.current = Math.max(0, carLaneRef.current - 1);
    }
  };
  const handleTouchRight = () => {
    if (gameRunningRef.current) {
      carLaneRef.current = Math.min(LANE_COUNT - 1, carLaneRef.current + 1);
    }
  };

  // ─────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* 3D Canvas */}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* HUD */}
      {gameRunning && (
        <>
          {/* Score + Coins */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 10,
              padding: "8px 18px",
              color: "#fff",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: "bold", lineHeight: 1 }}>
              {score}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: "normal",
                  opacity: 0.6,
                  marginLeft: 4,
                }}
              >
                pts
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: "bold", color: "#ffd700", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 18 }}>&#9679;</span>
              {coins}
            </div>
          </div>

          {/* Lives */}
          <div
            style={{
              position: "absolute",
              top: 60,
              right: 16,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 10,
              padding: "5px 14px",
              color: "#ff4444",
              fontSize: 20,
              fontWeight: "bold",
              display: "flex",
              gap: 4,
            }}
          >
            {Array.from({ length: lives }).map((_, i) => (
              <span key={i}>&#9829;</span>
            ))}
          </div>

          {/* Speed */}
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 10,
              padding: "8px 18px",
              color: "#fff",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: "bold" }}>
              {speed.toFixed(1)}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: "normal",
                  opacity: 0.6,
                  marginLeft: 3,
                }}
              >
                x
              </span>
            </div>
          </div>

          {/* Username */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.55)",
              borderRadius: 10,
              padding: "5px 18px",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {username}
          </div>

          {/* Speed boost */}
          {speedBoostActive && (
            <div
              style={{
                position: "absolute",
                top: 58,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,170,255,0.35)",
                borderRadius: 10,
                padding: "5px 18px",
                color: "#00ddff",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              SPEED BOOST
            </div>
          )}

          {/* Invisibility */}
          {invisibilityActive && (
            <div
              style={{
                position: "absolute",
                top: 58,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(255,215,0,0.35)",
                borderRadius: 10,
                padding: "5px 18px",
                color: "#ffd700",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              INVISIBLE {invisibilityCountdown}s
            </div>
          )}

          {/* Popup */}
          {popup && (
            <div
              style={{
                position: "absolute",
                top: 100,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.75)",
                borderRadius: 10,
                padding: "10px 28px",
                color: "#44ff88",
                fontSize: 20,
                fontWeight: "bold",
                whiteSpace: "nowrap",
              }}
            >
              {popup}
            </div>
          )}

          {/* Lane indicators (subtle) */}
          <div
            style={{
              position: "absolute",
              bottom: isMobile ? 160 : 20,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
            }}
          >
            {[0, 1, 2].map((l) => (
              <div
                key={l}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background:
                    currentLane === l
                      ? "rgba(255,255,255,0.8)"
                      : "rgba(255,255,255,0.2)",
                  transition: "background 0.15s",
                }}
              />
            ))}
          </div>

          {/* Mobile touch zones */}
          {isMobile && (
            <>
              <div
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleTouchLeft();
                }}
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: "50%",
                  height: "35%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  touchAction: "none",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: "50%",
                    width: 70,
                    height: 70,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  &#9664;
                </div>
              </div>
              <div
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleTouchRight();
                }}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "50%",
                  height: "35%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  touchAction: "none",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: "50%",
                    width: 70,
                    height: 70,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  &#9654;
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Game Over */}
      {gameOver && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "rgba(10,10,20,0.9)",
              borderRadius: 20,
              padding: "36px 40px",
              textAlign: "center",
              color: "#fff",
              maxWidth: 380,
              width: "90%",
            }}
          >
            <h2 style={{ fontSize: 34, marginBottom: 6 }}>Game Over</h2>
            {isNewHighScore && (
              <div
                style={{
                  color: "#ffd700",
                  fontSize: 17,
                  marginBottom: 10,
                  fontWeight: "bold",
                }}
              >
                NEW HIGH SCORE!
              </div>
            )}
            <div
              style={{ fontSize: 52, fontWeight: "bold", marginBottom: 6 }}
            >
              {gameStatsRef.current.finalScore}
              <span
                style={{
                  fontSize: 18,
                  fontWeight: "normal",
                  opacity: 0.5,
                }}
              >
                {" "}
                pts
              </span>
            </div>
            <div
              style={{
                fontSize: 14,
                opacity: 0.5,
                marginBottom: 6,
              }}
            >
              Best: {highScore} pts
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#ffd700",
                fontWeight: "bold",
                marginBottom: 8,
              }}
            >
              &#9679; {gameStateRef.current.coinsCollected} coins collected
            </div>
            <div
              style={{
                fontSize: 13,
                opacity: 0.4,
                marginBottom: 22,
              }}
            >
              Avoided {gameStatsRef.current.obstaclesAvoided} obstacles
              &nbsp;&middot;&nbsp;
              {gameStatsRef.current.bonusBoxesCollected} bonuses collected
            </div>
            <button
              onClick={handleRestart}
              style={{
                width: "100%",
                padding: 15,
                borderRadius: 12,
                border: "none",
                background: "#22cc88",
                color: "#111",
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
                transition: "transform 0.1s",
              }}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(0.97)")
              }
              onMouseUp={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedCarRaceGame;
