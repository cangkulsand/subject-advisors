import './landing.css';
import frontpageImage from './assets/frontpageimg.png';

function BrandMark() {
  return <span className="landing-brand-mark" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M18 3.5 32.5 12v12L18 32.5 3.5 24V12L18 3.5Z" fill="currentColor"/><path d="M12 19.1 16.1 23l8.5-10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}

export function LandingPage() {
  return (
    <main className="landing-page" id="overview">
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="Subject Advisors home"><BrandMark /><span>Subject<span className="landing-brand-light"> Advisors</span></span></a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#overview" aria-current="page">Home</a>
        </nav>
        <a className="landing-sign-in" href="/sign-in">Sign in <span aria-hidden="true">↗</span></a>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><span /> YOUR ACADEMIC JOURNEY, IN ONE PLACE</p>
          <h1 id="landing-title">Make your next<br className="landing-desktop-break" /> step <span>clear.</span></h1>
          <p className="landing-intro">Subject Advisors brings your academic profile, subject records and semester offerings together in one calm, easy-to-use space.</p>
          <div className="landing-actions">
            <a className="landing-button landing-button-primary" href="/sign-up">Create your account <span aria-hidden="true">→</span></a>
            <a className="landing-button landing-button-secondary" href="/sign-in">Sign in to continue</a>
          </div>
          <a className="landing-continue" href="/auth/complete">Already signed in? Continue to your account <span aria-hidden="true">↗</span></a>
        </div>
        <div className="landing-visual"><span className="landing-visual-halo" aria-hidden="true" /><span className="landing-visual-spark landing-visual-spark-one" aria-hidden="true">✳</span><span className="landing-visual-spark landing-visual-spark-two" aria-hidden="true">✳</span><img src={frontpageImage} width="1452" height="1083" alt="Two friendly student characters holding books and study materials" /></div>
      </section>

      <footer className="landing-footer"><a className="landing-brand" href="/" aria-label="Subject Advisors home"><BrandMark /><span>Subject<span className="landing-brand-light"> Advisors</span></span></a><span>Keep your academic journey in view.</span><a href="/sign-in">Sign in <span aria-hidden="true">↗</span></a></footer>
    </main>
  );
}
