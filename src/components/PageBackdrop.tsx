import { memo, useId } from "react";
import type { PlanSubTab, Tab } from "../nav";

type Motif = "book" | "books" | "calendar" | "clipboard" | "timer" | "cards" | "chart" | "cap" | "gear" | "pencil" | "headphones" | "target";
type Scene = Exclude<Tab, "plan"> | PlanSubTab;

const SCENES: Record<Scene, [Motif, Motif]> = {
  home: ["book", "target"],
  calendar: ["calendar", "timer"],
  plans: ["clipboard", "target"],
  subjects: ["books", "pencil"],
  study: ["timer", "headphones"],
  reviews: ["cards", "book"],
  stats: ["chart", "cap"],
  exams: ["clipboard", "cap"],
  settings: ["gear", "target"],
};

/**
 * Static, local SVG scenery: bevelled objects, soft shadows and cinematic rim lighting.
 * No images to download, canvas loop, parallax, interaction or animation. Kept outside
 * the content flow, hidden from assistive technology, and memoized for the live timers.
 */
export const PageBackdrop = memo(function PageBackdrop({ tab, planSub }: { tab: Tab; planSub: PlanSubTab }) {
  const scene: Scene = tab === "plan" ? planSub : tab;
  const [primary, secondary] = SCENES[scene];
  return (
    <div className="page-backdrop" data-scene={scene} aria-hidden="true">
      <div className="page-backdrop__light page-backdrop__light--top" />
      <div className="page-backdrop__light page-backdrop__light--bottom" />
      <div className="page-backdrop__orbit" />
      <Sculpture motif={primary} className="page-backdrop__object page-backdrop__object--primary" />
      <Sculpture motif={secondary} className="page-backdrop__object page-backdrop__object--secondary" />
      <div className="page-backdrop__veil" />
    </div>
  );
});

function Sculpture({ motif, className }: { motif: Motif; className: string }) {
  const id = useId().replace(/:/g, "");
  const fill = (name: string) => `url(#${id}-${name})`;
  const face = fill("face");
  const edge = fill("edge");
  const paper = fill("paper");
  const gold = fill("gold");
  const ink = "var(--acc-800)";
  const line = "var(--acc-400)";

  const book = (
    <>
      <path d="M40 101Q93 69 157 96Q213 60 278 85L278 235Q213 216 157 248Q92 219 40 243Z" fill={edge} />
      <path d="M39 84Q94 61 157 88Q219 52 275 71L275 220Q209 203 157 236Q99 211 39 229Z" fill={face} stroke="white" strokeOpacity=".65" strokeWidth="2" />
      <path d="M50 79Q102 61 154 85L154 222Q101 199 50 216Z" fill={paper} />
      <path d="M162 85Q218 54 264 68L264 207Q210 194 162 222Z" fill={paper} />
      <path d="M157 89V229" stroke={ink} strokeOpacity=".3" strokeWidth="5" />
      {[0, 1, 2, 3, 4].map((n) => <path key={n} d={`M65 ${106 + n * 19}Q104 ${92 + n * 19} 137 ${108 + n * 19}M182 ${105 + n * 19}Q219 ${86 + n * 19} 248 ${91 + n * 19}`} fill="none" stroke={line} strokeWidth="4" strokeLinecap="round" opacity={1 - n * .12} />)}
      <path d="M209 66L230 63V150L219 141L209 155Z" fill={gold} />
    </>
  );

  const clipboard = (
    <>
      <rect x="74" y="55" width="182" height="225" rx="25" fill={edge} />
      <rect x="63" y="40" width="182" height="225" rx="25" fill={face} stroke="white" strokeOpacity=".6" strokeWidth="2" />
      <rect x="80" y="60" width="148" height="186" rx="13" fill={paper} />
      <rect x="118" y="34" width="82" height="40" rx="12" fill={edge} />
      <rect x="113" y="28" width="82" height="37" rx="12" fill={gold} stroke="#fff7ed" strokeWidth="2" />
      <path d="M142 40H169" stroke="#9a6e37" strokeWidth="6" strokeLinecap="round" />
      {[0, 1, 2].map((n) => (
        <g key={n} transform={`translate(0 ${n * 44})`}>
          <rect x="97" y="94" width="22" height="22" rx="6" fill={face} />
          <path d="M101 104L106 109L115 99" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M133 102H208M133 113H183" stroke={line} strokeWidth="5" strokeLinecap="round" opacity=".65" />
        </g>
      ))}
      <g transform="translate(182 99) rotate(20 52 86)">
        <rect x="44" y="10" width="20" height="143" rx="5" fill={edge} />
        <rect x="39" y="6" width="19" height="142" rx="5" fill={gold} />
        <path d="M39 142L48 171L58 142" fill="#ead4b0" />
        <path d="M44 158L48 171L53 157" fill={ink} />
        <path d="M45 18V134" stroke="white" strokeOpacity=".65" strokeWidth="3" />
      </g>
    </>
  );

  let shape;
  switch (motif) {
    case "book":
      shape = book;
      break;
    case "books":
      shape = <>
        {[0, 1, 2].map((n) => (
          <g key={n} transform={`translate(${n * 9} ${-n * 58})`}>
            <path d="M55 201L213 178L275 207L116 233Z" fill={n === 1 ? gold : face} stroke="white" strokeOpacity=".6" strokeWidth="2" />
            <path d="M116 233L275 207V242L116 269Z" fill={paper} />
            <path d="M55 201L116 233V269L55 236Z" fill={edge} />
            <path d="M116 263L275 236V249L116 276L55 243V233L116 263" fill={n === 1 ? gold : face} />
            <path d="M131 241L262 219M131 250L262 228" stroke="#94a3b8" strokeOpacity=".35" strokeWidth="2" />
          </g>
        ))}
      </>;
      break;
    case "clipboard":
      shape = clipboard;
      break;
    case "calendar":
      shape = <>
        <path d="M72 63L256 76L277 267L64 264Z" fill={edge} />
        <rect x="49" y="64" width="213" height="192" rx="24" fill={paper} stroke="white" strokeWidth="2" />
        <path d="M49 89Q49 64 74 64H237Q262 64 262 89V123H49Z" fill={face} />
        {[93, 211].map((x) => <g key={x}><rect x={x} y="43" width="16" height="46" rx="8" fill={edge} /><rect x={x - 4} y="39" width="14" height="43" rx="7" fill={gold} /></g>)}
        {Array.from({ length: 12 }, (_, n) => <rect key={n} x={75 + (n % 4) * 44} y={144 + Math.floor(n / 4) * 32} width="24" height="17" rx="5" fill={n === 6 ? gold : face} opacity={n === 6 ? 1 : .45} />)}
        <circle cx="258" cy="242" r="36" fill={edge} />
        <circle cx="251" cy="235" r="36" fill={face} stroke="white" strokeOpacity=".65" strokeWidth="2" />
        <path d="M234 235L247 248L271 222" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </>;
      break;
    case "timer":
      shape = <>
        <rect x="141" y="29" width="46" height="32" rx="10" fill={edge} />
        <rect x="132" y="23" width="46" height="26" rx="9" fill={gold} />
        <rect x="233" y="62" width="27" height="40" rx="8" fill={edge} transform="rotate(43 245 82)" />
        <circle cx="166" cy="177" r="112" fill={edge} />
        <circle cx="155" cy="163" r="112" fill={face} stroke="white" strokeOpacity=".7" strokeWidth="2" />
        <circle cx="155" cy="163" r="89" fill={paper} stroke={line} strokeWidth="5" />
        <path d="M155 85A78 78 0 0 1 229 188" fill="none" stroke={gold} strokeWidth="12" strokeLinecap="round" />
        {Array.from({ length: 12 }, (_, n) => <path key={n} d="M155 93V102" stroke={ink} opacity=".45" strokeWidth="4" strokeLinecap="round" transform={`rotate(${n * 30} 155 163)`} />)}
        <path d="M155 121V163L190 181" fill="none" stroke={ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="155" cy="163" r="9" fill={gold} />
      </>;
      break;
    case "cards":
      shape = <>
        <rect x="59" y="80" width="202" height="154" rx="23" fill={edge} transform="rotate(-19 160 157)" />
        <rect x="54" y="74" width="202" height="154" rx="23" fill={face} transform="rotate(-10 155 151)" />
        <rect x="45" y="73" width="212" height="153" rx="23" fill={paper} stroke="white" strokeWidth="2" />
        <path d="M70 102H174M70 121H144" stroke={line} strokeWidth="7" strokeLinecap="round" />
        <path d="M127 181A37 37 0 0 1 195 153M195 153V129M195 153H171M195 170A37 37 0 0 1 127 193M127 193V217M127 193H151" fill="none" stroke={face} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="243" cy="219" r="24" fill={gold} />
        <path d="M231 219L240 228L256 210" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" />
      </>;
      break;
    case "chart":
      shape = <>
        <path d="M33 245L211 276L295 222L117 194Z" fill={edge} />
        <path d="M33 236L211 267L295 213L117 185Z" fill={paper} />
        {[{ x: 67, y: 156, h: 67 }, { x: 133, y: 109, h: 125 }, { x: 199, y: 53, h: 191 }].map(({ x, y, h }, n) => <g key={x}>
          <path d={`M${x} ${y}l35 8v${h}l-35 -8Z`} fill={n === 2 ? gold : face} />
          <path d={`M${x + 35} ${y + 8}l24 -16v${h}l-24 16Z`} fill={edge} />
          <path d={`M${x} ${y}l24 -16l35 8l-24 16Z`} fill={n === 2 ? gold : paper} stroke="white" strokeOpacity=".5" />
          <path d={`M${x + 5} ${y + 5}v${h - 12}`} stroke="white" strokeWidth="3" strokeOpacity=".6" />
        </g>)}
        <path d="M56 117L109 85L153 93L236 31M212 31H236V55" fill="none" stroke={face} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </>;
      break;
    case "cap":
      shape = <>
        <path d="M80 138V204Q155 261 237 202V131" fill={edge} />
        <path d="M80 128V192Q155 247 237 190V122" fill={face} />
        <path d="M27 116L157 53L295 112L161 179Z" fill={edge} />
        <path d="M27 104L157 41L295 100L161 167Z" fill={face} stroke="white" strokeOpacity=".7" strokeWidth="2" />
        <path d="M159 102L265 141V224" fill="none" stroke={gold} strokeWidth="7" strokeLinecap="round" />
        <circle cx="159" cy="102" r="10" fill={gold} />
        <path d="M259 215L250 250Q266 259 279 249L271 215Z" fill={gold} />
        <path d="M63 102L155 56" stroke="white" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
      </>;
      break;
    case "gear":
      shape = <>
        <g transform="translate(9 13)">
          {Array.from({ length: 8 }, (_, n) => <rect key={n} x="131" y="33" width="48" height="85" rx="12" fill={edge} transform={`rotate(${n * 45} 155 157)`} />)}
          <circle cx="155" cy="157" r="91" fill={edge} />
        </g>
        {Array.from({ length: 8 }, (_, n) => <rect key={n} x="131" y="33" width="48" height="85" rx="12" fill={face} stroke="white" strokeOpacity=".4" transform={`rotate(${n * 45} 155 157)`} />)}
        <circle cx="155" cy="157" r="89" fill={face} />
        <circle cx="155" cy="157" r="52" fill={edge} stroke={gold} strokeWidth="9" />
        <circle cx="150" cy="150" r="38" fill={paper} />
        <path d="M87 113A76 76 0 0 1 175 85" fill="none" stroke="white" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" />
      </>;
      break;
    case "pencil":
      shape = <g transform="rotate(36 160 160)">
        <rect x="145" y="31" width="44" height="211" rx="10" fill={edge} />
        <rect x="134" y="25" width="43" height="211" rx="10" fill={gold} />
        <path d="M134 233L155 288L177 233Z" fill="#e9d1ac" />
        <path d="M145 267L155 288L166 266Z" fill={ink} />
        <path d="M143 65V224" stroke="white" strokeOpacity=".7" strokeWidth="5" />
        <path d="M169 65V224" stroke="#9a6e37" strokeOpacity=".5" strokeWidth="5" />
        <rect x="134" y="45" width="43" height="22" rx="3" fill={paper} />
      </g>;
      break;
    case "headphones":
      shape = <>
        <path d="M68 181V147A94 94 0 0 1 256 147V181" fill="none" stroke={edge} strokeWidth="33" strokeLinecap="round" />
        <path d="M59 169V135A94 94 0 0 1 247 135V169" fill="none" stroke={face} strokeWidth="31" strokeLinecap="round" />
        <path d="M59 126A94 94 0 0 1 236 91" fill="none" stroke="white" strokeOpacity=".65" strokeWidth="4" strokeLinecap="round" />
        {[44, 214].map((x) => <g key={x}>
          <rect x={x + 7} y="154" width="51" height="99" rx="21" fill={edge} />
          <rect x={x} y="144" width="48" height="98" rx="20" fill={face} />
          <rect x={x + 9} y="157" width="17" height="71" rx="8" fill={paper} />
        </g>)}
      </>;
      break;
    case "target":
      shape = <>
        <ellipse cx="168" cy="171" rx="107" ry="103" fill={edge} />
        <circle cx="155" cy="156" r="103" fill={face} stroke="white" strokeOpacity=".65" strokeWidth="2" />
        <circle cx="155" cy="156" r="76" fill={paper} />
        <circle cx="155" cy="156" r="51" fill={face} />
        <circle cx="155" cy="156" r="24" fill={gold} />
        <path d="M156 156L263 51" stroke={edge} strokeWidth="12" strokeLinecap="round" />
        <path d="M153 151L260 46" stroke={gold} strokeWidth="9" strokeLinecap="round" />
        <path d="M233 72L226 41L258 13L263 47L294 51L265 78Z" fill={gold} stroke="white" strokeOpacity=".6" strokeWidth="2" />
      </>;
      break;
  }

  return (
    <svg className={className} viewBox="0 0 340 340" fill="none" focusable="false" data-motif={motif}>
      <defs>
        <linearGradient id={`${id}-face`} x1="40" y1="40" x2="270" y2="290" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--acc-50)" /><stop offset=".28" stopColor="var(--acc-200)" /><stop offset=".65" stopColor="var(--acc-400)" /><stop offset="1" stopColor="var(--acc-700)" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="65" y1="60" x2="250" y2="290" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--acc-500)" /><stop offset="1" stopColor="var(--acc-950)" />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="75" y1="45" x2="215" y2="240" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" /><stop offset=".55" stopColor="#f1f5f9" /><stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="100" y1="40" x2="230" y2="240" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff3d6" /><stop offset=".4" stopColor="#ebc98a" /><stop offset="1" stopColor="#b88445" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="170%" height="180%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="8" dy="19" stdDeviation="10" floodColor="var(--acc-950)" floodOpacity=".38" />
        </filter>
      </defs>
      <g filter={fill("shadow")} transform="translate(9 4)">{shape}</g>
      <circle cx="295" cy="54" r="7" fill={gold} opacity=".65" />
      <path d="M35 275V294M25.5 284.5H44.5" stroke={line} strokeWidth="3" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}
