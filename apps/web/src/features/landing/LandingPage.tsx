import './landing.css';
import frontpageImage from './assets/frontpageimg.png';

const features = [
  {
    id: 'profile',
    number: '01',
    title: 'Your academic profile',
    description: 'Keep your programme details and study information together in one place.',
    mark: 'A',
  },
  {
    id: 'records',
    number: '02',
    title: 'Subject records',
    description: 'Review the subjects and credits you have recorded as you move through your programme.',
    mark: 'R',
  },
  {
    id: 'offerings',
    number: '03',
    title: 'Semester offerings',
    description: 'Keep a personal list of subjects you have reported as available this semester.',
    mark: 'S',
  },
];

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
          <a href="#workspace">Your workspace</a>
          <a href="#about">About</a>
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
        <a className="landing-scroll" href="#workspace"><span className="landing-scroll-line" /> Explore the workspace</a>
      </section>

      <section className="landing-workspace" id="workspace" aria-labelledby="workspace-title">
        <div className="landing-section-heading">
          <div><p className="landing-eyebrow"><span /> A LITTLE MORE CLARITY</p><h2 id="workspace-title">Your studies,<br /><em>in perspective.</em></h2></div>
          <p>Find the tools to keep your academic information close and make it easier to think about what comes next.</p>
        </div>
        <div className="landing-feature-grid">
          {features.map(feature => <article className="landing-feature" id={feature.id} key={feature.id}>
            <div className="landing-feature-top"><span className="landing-feature-mark">{feature.mark}</span><span className="landing-feature-number">{feature.number}</span></div>
            <h3>{feature.title}</h3><p>{feature.description}</p>
          </article>)}
        </div>
      </section>

      <section className="landing-about" id="about" aria-labelledby="about-title">
        <div className="landing-about-mark"><BrandMark /></div>
        <div><p className="landing-eyebrow"><span /> A STEADIER WAY TO STAY ORGANIZED</p><h2 id="about-title">Built around your<br /><em>academic journey.</em></h2></div>
        <p>Subject Advisors is a student workspace for keeping track of your programme, recorded subjects and semester offerings. Sign in to pick up where you left off.</p>
        <a className="landing-about-link" href="/sign-up">Get started <span aria-hidden="true">→</span></a>
      </section>

      <footer className="landing-footer"><a className="landing-brand" href="/" aria-label="Subject Advisors home"><BrandMark /><span>Subject<span className="landing-brand-light"> Advisors</span></span></a><span>Keep your academic journey in view.</span><a href="/sign-in">Sign in <span aria-hidden="true">↗</span></a></footer>
    </main>
  );
}
