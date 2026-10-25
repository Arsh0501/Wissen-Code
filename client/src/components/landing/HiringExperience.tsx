import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Code2,
  FileCheck2,
  Maximize2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Sparkles,
  Video,
} from "lucide-react";
import BrandLogo from "./BrandLogo";

const stages = [
  {
    label: "Schedule",
    icon: CalendarDays,
    title: "Make the first connection.",
    caption: "The right people. The right time.",
  },
  {
    label: "Assess",
    icon: ClipboardCheck,
    title: "Let their skills do the talking.",
    caption: "A challenge built for the role.",
  },
  {
    label: "Interview",
    icon: Video,
    title: "Meet your next teammate.",
    caption: "One room for people, code and ideas.",
  },
  {
    label: "Evaluate",
    icon: FileCheck2,
    title: "See the whole picture.",
    caption: "Every observation, in one place.",
  },
];
const STAGE_DURATION = 6500;

function ScheduleScene() {
  const [day, setDay] = useState(2);
  return (
    <div className="hx-schedule hx-view">
      <div className="hx-panel-heading">
        <div>
          <span className="hx-overline">INTERVIEW CALENDAR</span>
          <h3>A good day to meet.</h3>
        </div>
        <span className="hx-icon-tile">
          <CalendarDays size={20} />
        </span>
      </div>
      <div className="hx-month">
        <strong>October 2026</strong>
        <span>
          <ChevronLeft size={13} /> This week <ChevronRight size={13} />
        </span>
      </div>
      <div
        className="hx-week"
        role="group"
        aria-label="Example interview dates"
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setDay(index)}
            aria-pressed={day === index}
            aria-label={`${label} ${19 + index}`}
          >
            <span>{label}</span>
            <strong>{19 + index}</strong>
            <i />
          </button>
        ))}
      </div>
      <div className="hx-booking" key={day}>
        <span className="hx-booking-time">
          10:30<small>11:15</small>
        </span>
        <div>
          <div>
            <span className="hx-avatar hx-purple">RS</span>
            <strong>
              Riya Sharma<small>Frontend engineer</small>
            </strong>
            <Video size={16} />
          </div>
          <p>
            <span /> Technical interview <span>45 min</span>
          </p>
        </div>
      </div>
      <div className="hx-meeting-footer">
        <span className="hx-avatar-stack">
          <i>AK</i>
          <i>JT</i>
        </span>
        <span>Interview panel ready</span>
        <CheckCheck size={15} />
      </div>
    </div>
  );
}
function AssessmentScene() {
  return (
    <div className="hx-assess hx-view">
      <div className="hx-panel-heading">
        <div>
          <span className="hx-overline">SKILL ASSESSMENT</span>
          <h3>
            A little challenge.
            <br />A lot of potential.
          </h3>
        </div>
        <span className="hx-icon-tile">
          <Code2 size={20} />
        </span>
      </div>
      <div className="hx-assessment-meta">
        <span>Frontend engineering</span>
        <span>45 minutes</span>
      </div>
      <div className="hx-question-list">
        {[
          {
            title: "Build a search experience",
            kind: "JavaScript",
            icon: Code2,
          },
          { title: "Find the right data", kind: "SQL", icon: ClipboardCheck },
          {
            title: "Walk us through your thinking",
            kind: "Written",
            icon: MessageSquare,
          },
        ].map((question, index) => (
          <div
            className="hx-question"
            style={{ "--item": index } as CSSProperties}
            key={question.title}
          >
            <span>
              <question.icon size={16} />
            </span>
            <div>
              <strong>{question.title}</strong>
              <small>{question.kind}</small>
            </div>
            <span className="hx-question-check">
              <Check size={13} />
            </span>
          </div>
        ))}
      </div>
      <div className="hx-assess-progress">
        <span>Skills coming into focus</span>
        <div>
          <i />
        </div>
        <Sparkles size={15} />
      </div>
    </div>
  );
}
function InterviewScene() {
  return (
    <div className="hx-interview hx-view">
      <div className="hx-room-title">
        <span>
          <span className="hx-live-dot" /> Live interview
        </span>
        <span>
          14:32 <Maximize2 size={12} />
        </span>
      </div>
      <div className="hx-room-content">
        <div className="hx-video">
          <img
            src="/images/interview-editorial.jpg"
            width="1122"
            height="1402"
            alt="Illustrative candidate in a technical interview"
          />
          <span className="hx-video-name">
            Riya S.<small>Candidate</small>
          </span>
          <div className="hx-video-controls" aria-hidden="true">
            <Mic size={13} />
            <Video size={13} />
            <AudioLines size={13} />
          </div>
        </div>
        <div className="hx-code">
          <div>
            <Code2 size={12} /> solution.js <span>JS</span>
          </div>
          <pre>
            <code>
              <span className="hx-line-number">1</span>
              <em>function</em> search(items) {"{"}
              {"\n"}
              <span className="hx-line-number">2</span> <em>return</em> items
              {"\n"}
              <span className="hx-line-number">3</span> .<b>filter</b>(isMatch)
              {"\n"}
              <span className="hx-line-number">4</span> .<b>sort</b>
              (byRelevance);{"\n"}
              <span className="hx-line-number">5</span>
              {"}"}
            </code>
          </pre>
          <div className="hx-collaborator">
            <span /> Riya is coding
            <span className="hx-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="hx-tests">
            <Check size={12} /> 4 / 4 test cases passed
          </div>
        </div>
      </div>
      <div className="hx-room-bottom">
        <span>
          <MessageSquare size={13} /> “Let me walk you through my approach.”
        </span>
        <span className="hx-avatar hx-mint">AK</span>
      </div>
    </div>
  );
}
function EvaluateScene() {
  return (
    <div className="hx-evaluate hx-view">
      <div className="hx-panel-heading">
        <div>
          <span className="hx-overline">CANDIDATE REVIEW</span>
          <h3>Good work. Clear signals.</h3>
        </div>
        <span className="hx-icon-tile">
          <FileCheck2 size={20} />
        </span>
      </div>
      <div className="hx-review-person">
        <span className="hx-avatar hx-purple">RS</span>
        <div>
          <strong>Riya Sharma</strong>
          <span>Frontend engineer</span>
        </div>
        <span className="hx-review-status">
          <CheckCheck size={12} /> Reviewed
        </span>
      </div>
      {[
        { title: "Problem solving", score: 86 },
        { title: "Code quality", score: 76 },
        { title: "Communication", score: 92 },
      ].map((skill, index) => (
        <div
          key={skill.title}
          className="hx-score"
          style={
            { "--score": `${skill.score}%`, "--item": index } as CSSProperties
          }
        >
          <span>
            {skill.title}
            <strong>{skill.score >= 80 ? "Strong" : "Good"}</strong>
          </span>
          <div>
            <i />
          </div>
        </div>
      ))}
      <div className="hx-review-note">
        <MessageSquare size={14} />
        <span>
          “Clear thinking. Thoughtful trade-offs.”
          <small>Interviewer feedback</small>
        </span>
      </div>
      <div className="hx-review-footer">
        <span>Your team makes the decision.</span>
        <ArrowRight size={14} />
      </div>
    </div>
  );
}

export interface HiringExperienceHandle {
  selectStage: (index: number) => void;
}

const HiringExperience = forwardRef<
  HiringExperienceHandle,
  { motionPaused?: boolean }
>(function HiringExperience({ motionPaused = false }, apiRef) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query?.matches ?? false);
    change();
    query?.addEventListener("change", change);
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => setInView(entry.isIntersecting),
            { threshold: 0.2 },
          );
    if (root.current) observer?.observe(root.current);
    if (!observer) setInView(true);
    return () => {
      query?.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
    };
  }, []);
  const running =
    !paused && !hovered && !reducedMotion && !motionPaused && visible && inView;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setActive((value) => (value + 1) % stages.length),
      STAGE_DURATION,
    );
    return () => clearTimeout(timer);
  }, [active, running]);
  function select(index: number) {
    if (index < 0 || index >= stages.length) return;
    setActive(index);
    setPaused(true);
  }
  useImperativeHandle(apiRef, () => ({ selectStage: select }));
  function pointer(event: PointerEvent<HTMLDivElement>) {
    if (reducedMotion || event.pointerType !== "mouse" || !root.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    root.current.style.setProperty(
      "--pointer-x",
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 8}px`,
    );
    root.current.style.setProperty(
      "--pointer-y",
      `${((event.clientY - bounds.top) / bounds.height - 0.5) * 6}px`,
    );
  }
  const stage = stages[active];
  return (
    <div
      ref={root}
      className={`hiring-experience${running ? " hx-running" : ""}`}
      data-stage={active}
      style={{ "--stage-duration": `${STAGE_DURATION}ms` } as CSSProperties}
      onPointerMove={pointer}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        root.current?.style.setProperty("--pointer-x", "0px");
        root.current?.style.setProperty("--pointer-y", "0px");
      }}
    >
      <div className="hx-workflow-bar">
        <div>
          <span className="hx-live-dot" />
          <span>A LITTLE PREVIEW OF YOUR NEXT GREAT HIRE</span>
        </div>
        <button
          type="button"
          aria-label={
            paused || reducedMotion || motionPaused
              ? "Play hiring preview"
              : "Pause hiring preview"
          }
          onClick={() => setPaused((value) => !value)}
          disabled={reducedMotion || motionPaused}
          title={
            reducedMotion
              ? "Automatic animation is off for your reduced motion preference"
              : undefined
          }
        >
          {paused || reducedMotion || motionPaused ? (
            <Play size={12} />
          ) : (
            <Pause size={12} />
          )}
          <span>
            {paused || reducedMotion || motionPaused ? "Play" : "Pause"}
          </span>
        </button>
      </div>
      <div className="hx-stage-canvas">
        <svg
          className="hx-connection-paths"
          viewBox="0 0 1120 430"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M170 148H235Q255 148 255 170V205H370M170 315H240Q260 315 260 293V250H370M750 215H830Q850 215 850 193V132H955M750 250H820Q840 250 840 275V330H955" />
          <path
            className="hx-flow-dash"
            d="M170 148H235Q255 148 255 170V205H370M170 315H240Q260 315 260 293V250H370M750 215H830Q850 215 850 193V132H955M750 250H820Q840 250 840 275V330H955"
          />
        </svg>
        <div className="hx-side hx-left">
          <div className="hx-talent-card">
            <span className="hx-card-eyebrow">MEET YOUR NEXT</span>
            <strong>Great teammate.</strong>
            <div className="hx-talent-person">
              <img
                src="/images/interview-editorial.jpg"
                width="1122"
                height="1402"
                alt=""
              />
              <span>
                Riya Sharma<small>Frontend engineer</small>
              </span>
              <span className="hx-person-dot" />
            </div>
            <div className="hx-skill-tags">
              <span>React</span>
              <span>TypeScript</span>
              <span>+2</span>
            </div>
          </div>
          <div className="hx-small-card">
            <span className="hx-small-icon">
              <CalendarDays size={16} />
            </span>
            <div>
              <strong>One invite.</strong>
              <span>Everyone connected.</span>
            </div>
            <Check size={14} />
          </div>
          <span className="hx-handnote">
            Good people. Great possibilities.
            <svg viewBox="0 0 80 35" aria-hidden="true">
              <path
                d="M3 4c27 26 43 23 65 8m-9-4 12 2-3 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </span>
        </div>
        <div className="hx-main-window">
          <div className="hx-window-chrome">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>
              <BrandLogo /> / {stage.label.toLowerCase()}
            </span>
            <MoreHorizontal size={15} />
          </div>
          <div
            className="hx-scene"
            key={active}
            onFocusCapture={() => setPaused(true)}
          >
            {active === 0 ? (
              <ScheduleScene />
            ) : active === 1 ? (
              <AssessmentScene />
            ) : active === 2 ? (
              <InterviewScene />
            ) : (
              <EvaluateScene />
            )}
          </div>
        </div>
        <div className="hx-side hx-right">
          <div className="hx-signal-card">
            <div>
              <span className="hx-signal-icon">
                <Sparkles size={16} />
              </span>
              <span>Beyond the résumé.</span>
            </div>
            <strong>See the potential.</strong>
            <div className="hx-signal-bars" aria-hidden="true">
              {[35, 58, 43, 72, 61, 85, 74, 98].map((height, index) => (
                <i
                  key={index}
                  style={
                    {
                      "--bar-height": `${height}%`,
                      "--item": index,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <p>
              <CheckCheck size={12} /> Skills. Context. Confidence.
            </p>
          </div>
          <div className="hx-team-card">
            <span className="hx-avatar-stack">
              <i>AK</i>
              <i>JT</i>
              <i>
                <Plus size={10} />
              </i>
            </span>
            <div>
              <strong>Better, together.</strong>
              <span>Your hiring team, in sync.</span>
            </div>
          </div>
        </div>
      </div>
      <div
        className="hx-stage-controls"
        role="group"
        aria-label="Explore the hiring process"
      >
        {stages.map((item, index) => (
          <button
            type="button"
            key={item.label}
            aria-pressed={active === index}
            onClick={() => select(index)}
          >
            <span className="hx-control-number">0{index + 1}</span>
            <item.icon size={16} />
            <span>{item.label}</span>
            <i
              className="hx-stage-progress"
              key={`${active}-${index}-${running}`}
            />
          </button>
        ))}
      </div>
      <div className="hx-experience-caption">
        <span>{stage.caption}</span>
        <span>Interactive preview · Illustrative data</span>
      </div>
    </div>
  );
});

export default HiringExperience;
