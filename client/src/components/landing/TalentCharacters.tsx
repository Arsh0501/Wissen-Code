import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Code2,
  Sparkles,
  Video,
} from "lucide-react";

export default function TalentCharacters() {
  const scene = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [greeting, setGreeting] = useState(false);
  const [wave, setWave] = useState(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (
      !scene.current ||
      event.pointerType !== "mouse" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const bounds = scene.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    scene.current.style.setProperty("--character-x", `${x * 13}px`);
    scene.current.style.setProperty("--character-y", `${y * 9}px`);
    scene.current.style.setProperty("--eye-x", `${x * 6}px`);
    scene.current.style.setProperty("--eye-y", `${y * 5}px`);
  }
  function reset() {
    ["--character-x", "--character-y", "--eye-x", "--eye-y"].forEach((key) =>
      scene.current?.style.setProperty(key, "0px"),
    );
  }
  function greet() {
    setGreeting(true);
    setWave((value) => value + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setGreeting(false), 3000);
  }
  return (
    <div
      className="talent-characters"
      ref={scene}
      onPointerMove={move}
      onPointerLeave={reset}
    >
      <div className="tc-backdrop" aria-hidden="true" />
      <svg className="tc-orbit" viewBox="0 0 560 580" aria-hidden="true">
        <ellipse
          cx="280"
          cy="285"
          rx="252"
          ry="196"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 7"
          transform="rotate(-27 280 285)"
        />
      </svg>
      <div className="tc-orbit-tag tc-tag-schedule">
        <CalendarDays size={15} /> Schedule
      </div>
      <div className="tc-orbit-tag tc-tag-interview">
        <Video size={15} /> Interview <span />
      </div>
      <div className="tc-orbit-tag tc-tag-hire">
        <Check size={15} /> Make the call.
      </div>
      <span className="tc-star tc-star-one" aria-hidden="true">
        ✳
      </span>
      <span className="tc-star tc-star-two" aria-hidden="true">
        ✦
      </span>
      <div className="tc-green-character" aria-hidden="true">
        <span className="tc-green-eyes">
          <i />
          <i />
        </span>
        <span className="tc-green-smile" />
        <span className="tc-green-hand" />
      </div>
      <div className="tc-sticker">
        <span>PEOPLE &gt; PAPERWORK</span>
        <strong>
          A little less admin.
          <br />A lot more human.
        </strong>
        <ArrowUpRight size={23} />
      </div>
      <div className="tc-mascot-position">
        <button
          type="button"
          className="tc-mascot-button"
          onClick={greet}
          aria-label="Say hello to the Wissen mascot"
        >
          <img
            key={wave}
            className={wave ? "tc-wave" : ""}
            src="/images/wissen-mascot.png"
            width="1153"
            height="1364"
            alt="Playful purple Wissen mascot with a laptop and orange sneakers"
            fetchPriority="high"
          />
          <span className="tc-tap-hint">
            <Sparkles size={12} /> Psst. Tap me.
          </span>
        </button>
      </div>
      <div
        className={`tc-speech${greeting ? " is-visible" : ""}`}
        role="status"
      >
        Hey, future teammate. <span>Let’s make a great introduction.</span>
      </div>
      <div className="tc-code-character" aria-hidden="true">
        <div>
          <i />
          <i />
          <i />
          <Code2 size={15} />
        </div>
        <span className="tc-code-eyes">
          <i />
          <i />
        </span>
        <span className="tc-code-smile" />
        <span className="tc-code-hand" />
      </div>
      <span className="tc-bottom-label">
        <span /> YOUR HIRING SIDEKICK. BIG ON POTENTIAL.
      </span>
    </div>
  );
}
