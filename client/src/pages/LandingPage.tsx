import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Code2, ClipboardCheck, Users, ShieldCheck, Menu, X, Play, ChevronRight } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import './LandingPage.css';

const products = [
  { id: 'assessments', icon: ClipboardCheck, label: 'Assessments', title: 'A better signal. From the first question.', description: 'Build role-specific assessments with coding, SQL, multiple-choice and written questions. Choose your questions, set the rules and invite candidates.' },
  { id: 'interviews', icon: Users, label: 'Live interviews', title: 'Great conversations. Real code.', description: 'Work together in a shared coding environment. Keep questions, execution results, notes and follow-ups in one interview workspace.' },
  { id: 'insights', icon: ShieldCheck, label: 'Evaluation', title: 'Make every decision traceable.', description: 'Review submissions, compare skills and connect observations to evidence. Keep your interviewers in control of the final evaluation.' },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const product = products[active];
  return (
    <div className="landing">
      <div className="landing-announcement">From the first question to the final decision. <a href="#platform">Explore Wissen Code <ArrowRight size={13} /></a></div>
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="Wissen Code home"><span><Code2 size={23} /></span>Wissen Code</Link>
        <button className="landing-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav className={menuOpen ? 'landing-nav is-open' : 'landing-nav'} aria-label="Main navigation">
          <a href="#platform" onClick={() => setMenuOpen(false)}>Products</a><a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a><a href="#candidates" onClick={() => setMenuOpen(false)}>For candidates</a>
          <div className="landing-nav-actions"><ThemeToggle /><Link to="/login" className="landing-signin landing-button small">Sign in <ArrowRight size={15} /></Link></div>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <p className="landing-kicker"><span /> BUILT FOR BETTER TECH HIRING</p>
          <h1>Great talent.<br />Real skills.<br /><span>Clear decisions.</span></h1>
          <p className="landing-hero-copy">Bring assessments, live coding interviews and evidence-based evaluations into one connected workspace.</p>
          <div className="landing-hero-actions"><Link to="/login" className="landing-button">For hiring teams <ArrowRight size={18} /></Link><a href="#candidates" className="landing-button secondary">For candidates <ArrowRight size={18} /></a></div>
          <p className="landing-hero-note">Your questions. Your process. A clearer view of every candidate.</p>
          <div className="landing-preview" aria-label="Illustration of the interview workspace">
            <div className="preview-bar"><span className="preview-dots"><i /><i /><i /></span><span><Code2 size={14} /> Wissen Code / Interview workspace</span><span className="preview-live"><i /> Live interview</span></div>
            <div className="preview-body">
              <aside className="preview-question"><span className="preview-label">QUESTION 01 / 03</span><h3>Build a better search</h3><p>Implement a debounced search that stays responsive as the user types.</p><div className="preview-tags"><span>JavaScript</span><span>Problem solving</span></div><hr /><span className="preview-label">INTERVIEW PLAN</span><p className="preview-plan"><Check size={14} /> Introductions <span>5 min</span></p><p className="preview-plan selected"><Code2 size={14} /> Coding exercise <span>20 min</span></p><p className="preview-plan">Discussion <span>10 min</span></p></aside>
              <div className="preview-code"><div className="preview-file">search.js <span>JavaScript</span></div><pre><code><span className="code-muted">// Give every keystroke a little space.</span>{'\n'}<span className="code-purple">function</span> <span className="code-blue">debounce</span>(fn, delay) {'{'}{'\n'}  <span className="code-purple">let</span> timeout;{'\n\n'}  <span className="code-purple">return</span> (...args) =&gt; {'{'}{'\n'}    clearTimeout(timeout);{'\n'}    timeout = setTimeout(() =&gt; {'{'}{'\n'}      fn(...args);{'\n'}    {'}'}, delay);{'\n'}  {'}'};{'\n'}{'}'}</code></pre><div className="preview-results"><span><Check size={14} /> Example execution result</span><span><Play size={12} /> Run code</span></div></div>
              <aside className="preview-notes"><span className="preview-label">INTERVIEWER NOTES</span><h4>Keep the evidence close.</h4><p>Explained how the closure preserves the timer between calls.</p><div className="preview-observation"><span>FOLLOW-UP SUGGESTION</span><p>How would you cancel a pending search when the component unmounts?</p></div><span className="preview-example">Illustrative workspace preview</span></aside>
            </div>
          </div>
        </section>
        <div className="landing-capabilities"><span>One connected hiring workflow</span><div><span><ClipboardCheck size={18} /> Assess</span><span><Code2 size={18} /> Interview</span><span><ShieldCheck size={18} /> Evaluate</span></div></div>
        <section className="landing-section" id="platform"><p className="landing-kicker">THE PLATFORM</p><h2>Everything you need.<br />Every step connected.</h2><div className="landing-tabs" role="tablist" aria-label="Platform products">{products.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={index === active} aria-controls="product-panel" onClick={() => setActive(index)}><item.icon size={18} />{item.label}</button>)}</div><div className="landing-product" id="product-panel" role="tabpanel" aria-labelledby={`tab-${product.id}`}><div><product.icon size={32} /><h3>{product.title}</h3><p>{product.description}</p><Link to="/login">Explore your workspace <ArrowRight size={17} /></Link></div><div className="landing-product-visual"><span className="preview-label">YOUR HIRING WORKSPACE</span>{['Choose the skills that matter', 'Bring candidates into the process', 'Review the work behind the score'].map((text, i) => <div key={text}><span>0{i + 1}</span><p>{text}</p><Check size={18} /></div>)}</div></div></section>
        <section className="landing-workflow landing-section" id="workflow"><p className="landing-kicker">FROM SETUP TO DECISION</p><h2>Less switching tools.<br />More understanding people.</h2><div className="landing-steps">{[{ title: 'Set the standard', text: 'Select questions, define skills and configure your assessment.' }, { title: 'See skills in action', text: 'Invite candidates to an assessment or collaborate in a live interview.' }, { title: 'Decide with evidence', text: 'Review code, results and interviewer observations together.' }].map((step, i) => <article key={step.title}><span>0{i + 1}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
        <section className="landing-candidate" id="candidates"><div><p className="landing-kicker">FOR CANDIDATES</p><h2>Your next opportunity.<br />Your skills, front and center.</h2><p>Already invited? Open the assessment or interview link shared by your hiring team. Have an account? Sign in to view your assessments.</p><Link to="/login" className="landing-button">Candidate sign in <ChevronRight size={18} /></Link></div><Code2 className="landing-candidate-icon" aria-hidden="true" /></section>
      </main>
      <footer className="landing-footer"><Link to="/" className="landing-brand"><Code2 size={22} /> Wissen Code</Link><p>Assess skills. Build stronger teams.</p><a href="#platform">Explore the platform <ArrowRight size={15} /></a></footer>
    </div>
  );
}
