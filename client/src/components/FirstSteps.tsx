import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Library,
  Send,
} from "lucide-react";
import "./FirstSteps.css";

/**
 * Shown on a brand-new hiring workspace (no assessments yet). Walks a first-time
 * admin through the four things that make the product click, in order.
 */
export default function FirstSteps({ questions }: { questions: number }) {
  const steps = [
    {
      icon: Library,
      title: "Add a few questions",
      body: "Coding, SQL or discussion — or let AI draft them.",
      to: "/admin/questions/new",
      cta: "Add question",
      done: questions > 0,
    },
    {
      icon: ClipboardList,
      title: "Create an assessment",
      body: "Pick questions, set a time limit and a pass mark.",
      to: "/admin/assessments/new",
      cta: "New assessment",
      done: false,
    },
    {
      icon: Send,
      title: "Invite candidates",
      body: "Share a link or email invites — reminders go out on their own.",
      to: "/admin/assessments",
      cta: "Open assessments",
      done: false,
    },
    {
      icon: CalendarDays,
      title: "Schedule an interview",
      body: "Pick a time; the candidate gets the invite and a 30-min reminder.",
      to: "/admin/interviews",
      cta: "Schedule",
      done: false,
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="first-steps card" aria-labelledby="first-steps-title">
      <div className="first-steps-head">
        <p className="eyebrow">Getting started</p>
        <h2 id="first-steps-title">Let’s get you hiring</h2>
        <p>Four quick steps. Most teams finish in under 10 minutes.</p>
      </div>
      <ol className="first-steps-list">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const state = step.done ? "done" : i === next ? "next" : "later";
          return (
            <li key={step.title} className={`first-step is-${state}`}>
              <span className="first-step-num" aria-hidden="true">
                {step.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className="first-step-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div className="first-step-copy">
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
              <Link
                to={step.to}
                className={i === next ? "btn-primary" : "btn-outline"}
              >
                {step.cta} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
