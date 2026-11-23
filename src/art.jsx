import { useId } from "react";
import { WHEEL_ZONES } from "./wheel.js";

export function WheelArt({ small = false }) {
  return (
    <svg
      className={small ? "art small" : "art"}
      viewBox="0 0 300 180"
      aria-hidden="true"
    >
      <path d="M30 150a120 120 0 0 1 240 0" fill="#edc8ad" />
      <path d="M54 150a96 96 0 0 1 192 0" fill="#f5e5bd" />
      <path d="M83 150a67 67 0 0 1 134 0" fill="#bdc6ab" />
      <path d="M113 150a37 37 0 0 1 74 0" fill="#b9694d" />
      <g stroke="#775b46" strokeWidth="2" opacity=".4">
        <path d="M40 150h12m7-49 10 6m21-44 7 10m53-30v13m60 7-7 10m38 28-10 6m17 43h12" />
      </g>
      <path
        d="M150 150 191 62"
        stroke="#543c2f"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="150" cy="150" r="10" fill="#543c2f" />
      <circle cx="150" cy="150" r="4" fill="#f9f1e5" />
      <path d="m247 32 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#bc7955" />
    </svg>
  );
}
export function WordArt() {
  return (
    <svg className="art" viewBox="0 0 300 180" aria-hidden="true">
      <g transform="rotate(-9 150 90)">
        <rect
          x="42"
          y="48"
          width="61"
          height="72"
          rx="12"
          fill="#faf6ec"
          stroke="#a9b299"
        />
        <text
          x="72"
          y="97"
          textAnchor="middle"
          fill="#65745b"
          fontSize="39"
          fontFamily="Georgia"
        >
          C
        </text>
        <rect
          x="115"
          y="48"
          width="61"
          height="72"
          rx="12"
          fill="#faf6ec"
          stroke="#a9b299"
        />
        <text
          x="145"
          y="98"
          textAnchor="middle"
          fill="#65745b"
          fontSize="37"
          fontFamily="Georgia"
        >
          o
        </text>
        <rect
          x="188"
          y="48"
          width="61"
          height="72"
          rx="12"
          fill="#d0d8c2"
          stroke="#a9b299"
        />
        <circle cx="218" cy="87" r="4" fill="#77856a" />
      </g>
      <path
        d="M213 144c17-8 28-7 35-3m-8-9 9 9-12 4"
        stroke="#7b886f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="m42 138 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#9ca98d" />
    </svg>
  );
}
export function ClueArt() {
  return (
    <svg className="art" viewBox="0 0 300 180" aria-hidden="true">
      <g transform="rotate(-12 105 90)">
        <rect
          x="51"
          y="34"
          width="84"
          height="114"
          rx="12"
          fill="#eee2b3"
          stroke="#b9a772"
        />
        <text
          x="93"
          y="104"
          textAnchor="middle"
          fill="#a28a4f"
          fontSize="49"
          fontFamily="Georgia"
        >
          1
        </text>
      </g>
      <g transform="rotate(9 199 90)">
        <rect
          x="158"
          y="34"
          width="84"
          height="114"
          rx="12"
          fill="#dfc58c"
          stroke="#b9a772"
        />
        <text
          x="200"
          y="104"
          textAnchor="middle"
          fill="#907640"
          fontSize="49"
          fontFamily="Georgia"
        >
          3
        </text>
      </g>
      <rect
        x="106"
        y="24"
        width="88"
        height="122"
        rx="12"
        fill="#fffbec"
        stroke="#b9a772"
      />
      <text
        x="150"
        y="102"
        textAnchor="middle"
        fill="#9e7c3e"
        fontSize="51"
        fontFamily="Georgia"
      >
        2
      </text>
      <path d="m254 26 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#b89a57" />
    </svg>
  );
}
export function GameArt({ game }) {
  if (game === 'reverse') return <svg className="art" viewBox="0 0 300 190" aria-hidden="true">
    <ellipse cx="150" cy="161" rx="84" ry="12" fill="#d9b8b1" opacity=".3" />
    <rect x="122" y="32" width="56" height="92" rx="28" fill="#bb756d" />
    <path d="M108 91v9a42 42 0 0 0 84 0v-9M150 143v19M130 163h40" fill="none" stroke="#724e4b" strokeWidth="7" strokeLinecap="round" />
    {[0,1,2].map((i) => <g key={i} stroke="#bb756d" strokeWidth="5" strokeLinecap="round">
      <path d={`M${84-i*15} ${73+i*7}v${43-i*14}`} /><path d={`M${216+i*15} ${73+i*7}v${43-i*14}`} />
    </g>)}
    <path d="M136 59h28M136 73h28M136 87h28" stroke="#f7e7df" strokeWidth="4" strokeLinecap="round" />
  </svg>;
  return game === "wheel" ? (
    <WheelArt />
  ) : game === "chain" ? (
    <WordArt />
  ) : (
    <ClueArt />
  );
}
export function Dial({ target, guess = 50, showGuess = false, spinning = false }) {
  const clipId = useId();
  const xy = (v, radius = 112) => {
    const angle = Math.PI * (1 - v / 100);
    return [150 + radius * Math.cos(angle), 145 - radius * Math.sin(angle)];
  };
  const p = xy(guess);
  return (
    <svg className="dial" viewBox="0 0 300 174" role="img"
      aria-label={spinning ? "Spinning the wheel" : target == null
        ? "The scoring band is hidden"
        : `Scoring band: 1, 2, 3, 4, 3, 2, 1. Four-point center: ${target} out of 100${showGuess ? `. Guess: ${guess}` : ""}`}>
      <path d="M22 145a128 128 0 0 1 256 0Z" fill="#eee2cf" />
      {spinning && <g clipPath={`url(#${clipId})`}>
        <defs><clipPath id={clipId}><path d="M22 145a128 128 0 0 1 256 0Z" /></clipPath></defs>
        <g className="wheel-spin-disc">{Array.from({ length: 14 }, (_, i) => <path key={i}
          d="M150 145 L150 17 A128 128 0 0 1 205.5 29.7 Z"
          transform={`rotate(${i * 360 / 14} 150 145)`}
          fill={WHEEL_ZONES[i % 7].color} stroke="#faf6ec" strokeWidth="1" />)}</g>
      </g>}
      {!spinning && target != null && WHEEL_ZONES.map((zone, index) => {
        const from = Math.max(0, target + zone.from);
        const to = Math.min(100, target + zone.to);
        if (from >= to) return null;
        const start = xy(from, 128), end = xy(to, 128), label = xy((from + to) / 2, 99);
        return <g key={index}>
          <path d={`M150 145 L${start.join(" ")} A128 128 0 0 1 ${end.join(" ")} Z`}
            fill={zone.color} stroke="#faf6ec" strokeWidth=".7" />
          <text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle"
            fill={zone.points === 4 ? "#fff" : "#473f32"} fontSize="12" fontWeight="700">{zone.points}</text>
        </g>;
      })}
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => {
        const dot = xy(value, 136);
        return <circle key={value} cx={dot[0]} cy={dot[1]} r="1.3" fill="#8c8171" />;
      })}
      {showGuess && <path d={`M150 145L${p[0]} ${p[1]}`} stroke="#4a4436"
        strokeWidth="3.5" strokeLinecap="round" />}
      <circle cx="150" cy="145" r="9" fill="#4a4436" />
      {!spinning && !showGuess && target == null && <text x="150" y="92" textAnchor="middle"
        fontSize="26" fill="#6c634e" fontFamily="Georgia">?</text>}
      <text x="20" y="168" fill="#8c8171" fontSize="10">0</text>
      <text x="271" y="168" fill="#8c8171" fontSize="10">100</text>
    </svg>
  );
}
