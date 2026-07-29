import confetti from "canvas-confetti";

export function fireConfetti(intensity: "normal" | "big" = "normal") {
  const count = intensity === "big" ? 220 : 110;
  confetti({
    particleCount: count,
    spread: intensity === "big" ? 110 : 75,
    origin: { y: 0.7 },
    colors: ["#1f7a8c", "#e0a526", "#e8d8b4", "#1f5c3d"],
  });
}
