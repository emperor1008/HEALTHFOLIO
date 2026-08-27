import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-[760px] text-center">
          <h1 className="text-3xl font-semibold leading-tight text-text-primary md:text-[48px] text-balance">
            Turn scattered medical records into one clear health story.
          </h1>
          <p className="mt-4 text-lg text-text-secondary md:text-xl text-balance">
            Healthfolio securely organizes your reports, prescriptions and
            consultation records into a verified timeline, then helps you prepare
            for your next appointment.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-input bg-primary px-6 text-base font-semibold text-white hover:bg-primary-hover transition-colors duration-150"
            >
              Create my Healthfolio
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center rounded-input border border-border bg-surface px-6 text-base font-semibold text-text-primary hover:bg-canvas transition-colors duration-150"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-surface px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-2xl font-semibold text-text-primary md:text-3xl">
            Three steps to prepared
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <StepCard
              number={1}
              title="Upload your records"
              description="Upload PDFs, prescriptions, lab reports, discharge summaries and scan images. Healthfolio validates and securely stores each document."
            />
            <StepCard
              number={2}
              title="Review what Healthfolio found"
              description="AI extracts dates, tests, consultations and instructions. You confirm or correct every fact before it enters your verified timeline."
            />
            <StepCard
              number={3}
              title="Prepare for your consultation"
              description="Get a consultation brief, preparation checklist, calendar reminder and exportable PDF — all organized from your verified records."
            />
          </div>
        </div>
      </section>

      {/* Safety boundary */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-[680px] text-center">
          <h2 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Clear boundaries, clear purpose
          </h2>
          <p className="mt-4 text-text-secondary text-balance">
            Healthfolio organizes medical information and helps you prepare for
            consultations. It does not diagnose conditions, recommend treatment,
            or replace a healthcare professional.
          </p>
          <div className="mt-8 rounded-card border border-border bg-surface p-6 text-left">
            <ul className="space-y-3 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-success" aria-hidden="true">✓</span>
                <span>Every fact links to its source document and page</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-success" aria-hidden="true">✓</span>
                <span>Uncertain information requires your review before use</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-success" aria-hidden="true">✓</span>
                <span>Your documents stay private in your account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-success" aria-hidden="true">✓</span>
                <span>Questions are framed for discussion with your clinician</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-success" aria-hidden="true">✓</span>
                <span>No clinical advice is ever generated or implied</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary px-4 py-16 text-center md:px-8 md:py-24">
        <div className="mx-auto max-w-[600px]">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">
            Ready to organize your health records?
          </h2>
          <p className="mt-4 text-white/80">
            Create your free Healthfolio and prepare for your next appointment with clarity.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex h-12 items-center rounded-input bg-white px-6 text-base font-semibold text-primary hover:bg-white/90 transition-colors duration-150"
          >
            Create my Healthfolio
          </Link>
        </div>
      </section>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary font-semibold text-sm">
        {number}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-text-secondary">{description}</p>
    </div>
  );
}
