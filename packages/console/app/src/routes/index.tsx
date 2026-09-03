import "./index.css"
import { Title, Meta } from "@solidjs/meta"
import video from "../asset/lander/opencode-min.mp4"
import videoPoster from "../asset/lander/opencode-poster.png"
import { IconCopy, IconCheck } from "../component/icon"
import { A, createAsync } from "@solidjs/router"
import { EmailSignup } from "~/component/email-signup"
import { Tabs } from "@kobalte/core/tabs"
import { Faq } from "~/component/faq"
import { Header } from "~/component/header"
import { Footer } from "~/component/footer"
import { Legal } from "~/component/legal"
import { github } from "~/lib/github"
import { config } from "~/config"
import { useI18n } from "~/context/i18n"
import { useLanguage } from "~/context/language"
import { LocaleLinks } from "~/component/locale-links"

function CopyStatus() {
  return (
    <div data-component="copy-status">
      <IconCopy data-slot="copy" />
      <IconCheck data-slot="check" />
    </div>
  )
}

export default function Home() {
  const i18n = useI18n()
  const language = useLanguage()
  const _githubData = createAsync(() => github())
  const handleCopyClick = (event: Event) => {
    const button = event.currentTarget as HTMLButtonElement
    const text = button.textContent
    if (text) {
      void navigator.clipboard.writeText(text)
      button.setAttribute("data-copied", "")
      setTimeout(() => {
        button.removeAttribute("data-copied")
      }, 1500)
    }
  }

  return (
    <main data-page="opencode">
      <Title>{i18n.t("home.title")}</Title>
      <LocaleLinks path="/" />
      <Meta property="og:image" content="/social-share.png" />
      <Meta name="twitter:image" content="/social-share.png" />
      <div data-component="container">
        <Header />

        <div data-component="content">
          {/* ── Hero ──────────────────────────────────────── */}
          <section data-component="hero">
            <div data-slot="hero-copy">
              <h1>{i18n.t("home.hero.title")}</h1>
              <p>
                {i18n.t("home.hero.subtitle.a")} <span data-slot="br"></span>
                {i18n.t("home.hero.subtitle.b")}
              </p>
              <div data-slot="hero-ctas">
                <A href={language.route("/download")} data-slot="cta-primary">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12.1875 9.75L9.00001 12.9375L5.8125 9.75M9.00001 2.0625L9 12.375M14.4375 15.9375H3.5625"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="square"
                    />
                  </svg>
                  {i18n.t("nav.free")}
                </A>
                <a
                  href={config.github.repoUrl}
                  target="_blank"
                  data-slot="cta-secondary"
                >
                  {i18n.t("nav.github")}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 17L17 7M17 7H7M17 7V17"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="square"
                    />
                  </svg>
                </a>
              </div>
            </div>

            {/* Config showcase — like warp.dev's factory.yaml */}
            <div data-slot="config-showcase">
              <div data-slot="config-header">
                <span data-slot="config-dot" />
                <span data-slot="config-dot" />
                <span data-slot="config-dot" />
                <span data-slot="config-filename">{i18n.t("home.config.filename")}</span>
              </div>
              <pre data-slot="config-code">
                <code>{`{
  "provider": {
    "default": "opencode",
    "models": {
      "big":   "anthropic/claude-sonnet-4-20250514",
      "small": "anthropic/claude-haiku-4-20250414"
    }
  },
  "mcpServers": {
    "github": { "type": "remote", "url": "..." },
    "postgres": { "type": "local", "command": "mcp-postgres" }
  },
  "permission": {
    "edit": true,
    "bash": "ask"
  }
}`}</code>
              </pre>
            </div>
          </section>

          {/* ── Trusted by ──────────────────────────────── */}
          <section data-component="trusted-by">
            <span data-slot="trusted-label">
              {i18n.t("home.trusted.label", { count: config.stats.monthlyUsers })}
            </span>
            <div data-slot="trusted-logos">
              <span data-slot="logo-text">GitHub</span>
              <span data-slot="logo-text">Vercel</span>
              <span data-slot="logo-text">Stripe</span>
              <span data-slot="logo-text">Supabase</span>
              <span data-slot="logo-text">Cloudflare</span>
              <span data-slot="logo-text">Railway</span>
            </div>
          </section>

          {/* ── Installation (below fold) ────────────────── */}
          <section data-component="installation">
            <Tabs
              as="section"
              aria-label={i18n.t("home.install.ariaLabel")}
              class="tabs"
              data-component="tabs"
              data-active="curl"
              defaultValue="curl"
            >
              <Tabs.List data-slot="tablist">
                <Tabs.Trigger value="curl" data-slot="tab">
                  curl
                </Tabs.Trigger>
                <Tabs.Trigger value="npm" data-slot="tab">
                  npm
                </Tabs.Trigger>
                <Tabs.Trigger value="bun" data-slot="tab">
                  bun
                </Tabs.Trigger>
                <Tabs.Trigger value="brew" data-slot="tab">
                  brew
                </Tabs.Trigger>
                <Tabs.Trigger value="paru" data-slot="tab">
                  paru
                </Tabs.Trigger>
                <Tabs.Indicator />
              </Tabs.List>
              <div data-slot="panels">
                <Tabs.Content as="pre" data-slot="panel" value="curl">
                  <button data-copy data-slot="command" onClick={handleCopyClick}>
                    <span data-slot="command-script">
                      <span>curl -fsSL </span>
                      <span data-slot="protocol">https://</span>
                      <span data-slot="highlight">opencode.ai/install</span>
                      <span> | bash</span>
                    </span>
                    <CopyStatus />
                  </button>
                </Tabs.Content>
                <Tabs.Content as="pre" data-slot="panel" value="npm">
                  <button data-copy data-slot="command" onClick={handleCopyClick}>
                    <span>
                      <span data-slot="protocol">npm i -g </span>
                      <span data-slot="highlight">opencode-ai</span>
                    </span>
                    <CopyStatus />
                  </button>
                </Tabs.Content>
                <Tabs.Content as="pre" data-slot="panel" value="bun">
                  <button data-copy data-slot="command" onClick={handleCopyClick}>
                    <span>
                      <span data-slot="protocol">bun add -g </span>
                      <span data-slot="highlight">opencode-ai</span>
                    </span>
                    <CopyStatus />
                  </button>
                </Tabs.Content>
                <Tabs.Content as="pre" data-slot="panel" value="brew">
                  <button data-copy data-slot="command" onClick={handleCopyClick}>
                    <span>
                      <span data-slot="protocol">brew install </span>
                      <span data-slot="highlight">anomalyco/tap/opencode</span>
                    </span>
                    <CopyStatus />
                  </button>
                </Tabs.Content>
                <Tabs.Content as="pre" data-slot="panel" value="paru">
                  <button data-copy data-slot="command" onClick={handleCopyClick}>
                    <span>
                      <span data-slot="protocol">paru -S </span>
                      <span data-slot="highlight">opencode</span>
                    </span>
                    <CopyStatus />
                  </button>
                </Tabs.Content>
              </div>
            </Tabs>
          </section>

          {/* ── Video ────────────────────────────────────── */}
          <section data-component="video">
            <video src={video} autoplay playsinline loop muted preload="auto" poster={videoPoster}>
              {i18n.t("common.videoUnsupported")}
            </video>
          </section>

          {/* ── Features (numbered, warp.dev style) ──────── */}
          <section data-component="what">
            <div data-slot="section-title">
              <h3>{i18n.t("home.what.title")}</h3>
              <p>{i18n.t("home.what.body")}</p>
            </div>
            <div data-slot="feature-grid">
              <div data-slot="feature-item">
                <span data-slot="feature-number">01</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.lsp.title")}</strong>
                  <p>{i18n.t("home.what.lsp.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">02</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.multiSession.title")}</strong>
                  <p>{i18n.t("home.what.multiSession.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">03</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.shareLinks.title")}</strong>
                  <p>{i18n.t("home.what.shareLinks.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">04</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.copilot.title")}</strong>
                  <p>{i18n.t("home.what.copilot.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">05</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.chatgptPlus.title")}</strong>
                  <p>{i18n.t("home.what.chatgptPlus.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">06</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.anyModel.title")}</strong>
                  <p>{i18n.t("home.what.anyModel.body")}</p>
                </div>
              </div>
              <div data-slot="feature-item">
                <span data-slot="feature-number">07</span>
                <div data-slot="feature-content">
                  <strong>{i18n.t("home.what.anyEditor.title")}</strong>
                  <p>{i18n.t("home.what.anyEditor.body")}</p>
                </div>
              </div>
            </div>
            <a href={language.route("/docs")} data-slot="docs-link">
              <span>{i18n.t("home.what.readDocs")} </span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="square"
                />
              </svg>
            </a>
          </section>

          {/* ── Growth stats (clean numbers, no SVG art) ── */}
          <section data-component="growth">
            <div data-slot="section-title">
              <h3>{i18n.t("home.growth.title")}</h3>
            </div>
            <div data-slot="stat-grid">
              <div data-slot="stat-card">
                <span data-slot="stat-number">{config.github.starsFormatted.compact}</span>
                <span data-slot="stat-label">{i18n.t("home.growth.githubStars")}</span>
              </div>
              <div data-slot="stat-card">
                <span data-slot="stat-number">{config.stats.contributors}</span>
                <span data-slot="stat-label">{i18n.t("home.growth.contributors")}</span>
              </div>
              <div data-slot="stat-card">
                <span data-slot="stat-number">{config.stats.monthlyUsers}</span>
                <span data-slot="stat-label">{i18n.t("home.growth.monthlyDevs")}</span>
              </div>
            </div>
          </section>

          {/* ── Privacy ──────────────────────────────────── */}
          <section data-component="privacy">
            <div data-slot="privacy-title">
              <h3>{i18n.t("home.privacy.title")}</h3>
              <p>
                {i18n.t("home.privacy.body")} {i18n.t("home.privacy.learnMore")}{" "}
                <a href={language.route("/docs/enterprise/")}>{i18n.t("home.privacy.link")}</a>.
              </p>
            </div>
          </section>

          {/* ── Products (warp.dev style cards) ──────────── */}
          <section data-component="products">
            <div data-slot="section-title">
              <h3>{i18n.t("home.products.title")}</h3>
              <p>
                {i18n.t("home.products.body")}
              </p>
            </div>
            <div data-slot="product-grid">
              <div data-slot="product-card">
                <div data-slot="product-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
                    <path d="M8 21H16M12 17V21" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
                  </svg>
                </div>
                <h4>{i18n.t("home.products.terminal.title")}</h4>
                <p>{i18n.t("home.products.terminal.body")}</p>
                <A href={language.route("/download")} data-slot="product-link">
                  {i18n.t("home.products.terminal.link")} <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>
                </A>
              </div>
              <div data-slot="product-card">
                <div data-slot="product-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5" />
                    <path d="M3 9H21" stroke="currentColor" stroke-width="1.5" />
                    <circle cx="6.5" cy="6" r="1" fill="currentColor" />
                    <circle cx="9.5" cy="6" r="1" fill="currentColor" />
                    <circle cx="12.5" cy="6" r="1" fill="currentColor" />
                  </svg>
                </div>
                <h4>{i18n.t("home.products.desktop.title")}</h4>
                <p>{i18n.t("home.products.desktop.body")}</p>
                <A href={language.route("/download")} data-slot="product-link">
                  {i18n.t("home.products.desktop.link")} <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>
                </A>
              </div>
              <div data-slot="product-card">
                <div data-slot="product-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4H20V16H13L8 20V16H4V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="round" />
                  </svg>
                </div>
                <h4>{i18n.t("home.products.ide.title")}</h4>
                <p>{i18n.t("home.products.ide.body")}</p>
                <a href={language.route("/docs")} data-slot="product-link">
                  {i18n.t("home.products.ide.link")} <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" /></svg>
                </a>
              </div>
            </div>
          </section>

          {/* ── FAQ ──────────────────────────────────────── */}
          <section data-component="faq">
            <div data-slot="section-title">
              <h3>{i18n.t("common.faq")}</h3>
            </div>
            <ul>
              <li>
                <Faq question={i18n.t("home.faq.q1")}>{i18n.t("home.faq.a1")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q2")}>
                  {i18n.t("home.faq.a2.before")} <a href={language.route("/docs")}>{i18n.t("home.faq.a2.link")}</a>.
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q3")}>
                  {i18n.t("home.faq.a3.p1")} {i18n.t("home.faq.a3.p2.beforeZen")}{" "}
                  <A href={language.route("/zen")}>{i18n.t("nav.zen")}</A>
                  {i18n.t("home.faq.a3.p2.afterZen")} {i18n.t("home.faq.a3.p3")} {i18n.t("home.faq.a3.p4.beforeLocal")}{" "}
                  <a href={language.route("/docs/providers/#lm-studio")} target="_blank">
                    {i18n.t("home.faq.a3.p4.localLink")}
                  </a>
                  .
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q4")}>
                  {i18n.t("home.faq.a4.p1")}{" "}
                  <a href={language.route("/docs/providers/#directory")}>{i18n.t("common.learnMore")}</a>.
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q5")}>
                  {i18n.t("home.faq.a5.beforeDesktop")}{" "}
                  <a href={language.route("/download")}>{i18n.t("home.faq.a5.desktop")}</a> {i18n.t("home.faq.a5.and")}{" "}
                  <a href={language.route("/docs/web")}>{i18n.t("home.faq.a5.web")}</a>!
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q6")}>{i18n.t("home.faq.a6")}</Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q7")}>
                  {i18n.t("home.faq.a7.p1")} {i18n.t("home.faq.a7.p2.beforeModels")}{" "}
                  <a href={language.route("/docs/zen/#privacy")}>{i18n.t("home.faq.a7.p2.modelsLink")}</a>{" "}
                  {i18n.t("home.faq.a7.p2.and")}{" "}
                  <a href={language.route("/docs/share/#privacy")}>{i18n.t("home.faq.a7.p2.shareLink")}</a>.
                </Faq>
              </li>
              <li>
                <Faq question={i18n.t("home.faq.q8")}>
                  {i18n.t("home.faq.a8.p1")}{" "}
                  <a href={config.github.repoUrl} target="_blank">
                    {i18n.t("nav.github")}
                  </a>{" "}
                  {i18n.t("home.faq.a8.p2")}{" "}
                  <a href={`${config.github.repoUrl}?tab=MIT-1-ov-file#readme`} target="_blank">
                    {i18n.t("home.faq.a8.mitLicense")}
                  </a>
                  {i18n.t("home.faq.a8.p3")}
                </Faq>
              </li>
            </ul>
          </section>

          {/* ── Zen CTA ──────────────────────────────────── */}
          <section data-component="zen-cta">
            <div data-slot="zen-cta-copy">
              <strong>{i18n.t("home.zenCta.title")}</strong>
              <p>{i18n.t("home.zenCta.body")}</p>
              <div data-slot="model-logos">
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <mask
                      id="mask0_79_128586"
                      style="mask-type:luminance"
                      maskUnits="userSpaceOnUse"
                      x="1"
                      y="1"
                      width="22"
                      height="22"
                    >
                      <path d="M23 1.5H1V22.2952H23V1.5Z" fill="white" />
                    </mask>
                    <g mask="url(#mask0_79_128586)">
                      <path
                        d="M9.43799 9.06943V7.09387C9.43799 6.92749 9.50347 6.80267 9.65601 6.71959L13.8206 4.43211C14.3875 4.1202 15.0635 3.9747 15.7611 3.9747C18.3775 3.9747 20.0347 5.9087 20.0347 7.96734C20.0347 8.11288 20.0347 8.27926 20.0128 8.44564L15.6956 6.03335C15.434 5.88785 15.1723 5.88785 14.9107 6.03335L9.43799 9.06943ZM19.1624 16.7637V12.0431C19.1624 11.7519 19.0315 11.544 18.7699 11.3984L13.2972 8.36234L15.0851 7.3849C15.2377 7.30182 15.3686 7.30182 15.5212 7.3849L19.6858 9.67238C20.8851 10.3379 21.6917 11.7519 21.6917 13.1243C21.6917 14.7047 20.7106 16.1604 19.1624 16.7636V16.7637ZM8.15158 12.6047L6.36369 11.6066C6.21114 11.5235 6.14566 11.3986 6.14566 11.2323V6.65735C6.14566 4.43233 7.93355 2.7478 10.3538 2.7478C11.2697 2.7478 12.1199 3.039 12.8396 3.55886L8.54424 5.92959C8.28268 6.07508 8.15181 6.28303 8.15181 6.57427V12.6049L8.15158 12.6047ZM12 14.7258L9.43799 13.3533V10.4421L12 9.06965L14.5618 10.4421V13.3533L12 14.7258ZM13.6461 21.0476C12.7303 21.0476 11.8801 20.7564 11.1604 20.2366L15.4557 17.8658C15.7173 17.7203 15.8482 17.5124 15.8482 17.2211V11.1905L17.658 12.1886C17.8105 12.2717 17.876 12.3965 17.876 12.563V17.1379C17.876 19.3629 16.0662 21.0474 13.6461 21.0474V21.0476ZM8.47863 16.4103L4.314 14.1229C3.11471 13.4573 2.30808 12.0433 2.30808 10.6709C2.30808 9.06965 3.31106 7.6348 4.85903 7.03168V11.773C4.85903 12.0642 4.98995 12.2721 5.25151 12.4177L10.7025 15.4328L8.91464 16.4103C8.76209 16.4934 8.63117 16.4934 8.47863 16.4103ZM8.23892 19.8207C5.77508 19.8207 3.96533 18.0531 3.96533 15.8696C3.96533 15.7032 3.98719 15.5368 4.00886 15.3704L8.30418 17.7412C8.56574 17.8867 8.82752 17.8867 9.08909 17.7412L14.5618 14.726V16.7015C14.5618 16.8679 14.4964 16.9927 14.3438 17.0758L10.1792 19.3633C9.61225 19.6752 8.93631 19.8207 8.23869 19.8207H8.23892ZM13.6461 22.2952C16.2844 22.2952 18.4865 20.5069 18.9882 18.1362C21.4301 17.5331 23 15.3495 23 13.1245C23 11.6688 22.346 10.2548 21.1685 9.23581C21.2775 8.79908 21.343 8.36234 21.343 7.92582C21.343 4.95215 19.0437 2.7478 15.7611 2.7478C14.0154 2.7478 12.3935 3.38513 11.1604 4.42878L7.15366 2.21974C6.12949 1.64935 4.91847 1.46783 3.75248 1.70549L1.05214 2.24939C0.411573 2.37816 0 2.95742 0 3.62168V17.0612C0 18.1619 0.479314 19.2162 1.30752 19.9762L1.32411 19.9913C2.42194 20.9547 3.76927 21.515 5.15691 21.5664C5.63223 21.584 6.11377 21.573 6.58909 21.5338C7.05912 21.936 7.62741 22.2385 8.23892 22.4196V22.2952H13.6461Z"
                        fill="currentColor"
                      />
                    </g>
                  </svg>
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13.7891 3.93164L20.2223 20.0677H23.7502L17.317 3.93164H13.7891Z" fill="currentColor" />
                    <path
                      d="M6.32538 13.6824L8.52662 8.01177L10.7279 13.6824H6.32538ZM6.68225 3.93164L0.25 20.0677H3.84652L5.16202 16.6791H11.8914L13.2067 20.0677H16.8033L10.371 3.93164H6.68225Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 50 50"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M49.04,24.001l-1.082-0.043h-0.001C36.134,23.492,26.508,13.866,26.042,2.043L25.999,0.96C25.978,0.424,25.537,0,25,0	s-0.978,0.424-0.999,0.96l-0.043,1.083C23.492,13.866,13.866,23.492,2.042,23.958L0.96,24.001C0.424,24.022,0,24.463,0,25	c0,0.537,0.424,0.978,0.961,0.999l1.082,0.042c11.823,0.467,21.449,10.093,21.915,21.916l0.043,1.083C24.022,49.576,24.463,50,25,50	s0.978-0.424,0.999-0.96l0.043-1.083c0.466-11.823,10.092-21.449,21.915-21.916l1.082-0.042C49.576,25.978,50,25.537,50,25	C50,24.463,49.576,24.022,49.04,24.001z"></path>
                  </svg>
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M9.16861 16.0529L17.2018 9.85156C17.5957 9.54755 18.1586 9.66612 18.3463 10.1384C19.3339 12.6288 18.8926 15.6217 16.9276 17.6766C14.9626 19.7314 12.2285 20.1821 9.72948 19.1557L6.9995 20.4775C10.9151 23.2763 15.6699 22.5841 18.6411 19.4749C20.9979 17.0103 21.7278 13.6508 21.0453 10.6214L21.0515 10.6278C20.0617 6.17736 21.2948 4.39847 23.8207 0.760904C23.8804 0.674655 23.9402 0.588405 24 0.5L20.6762 3.97585V3.96506L9.16658 16.0551"
                      fill="currentColor"
                    />
                    <path
                      d="M7.37742 16.7017C4.67579 14.0395 5.14158 9.91963 7.44676 7.54383C9.15135 5.78544 11.9442 5.06779 14.3821 6.12281L17.0005 4.87559C16.5288 4.52392 15.9242 4.14566 15.2305 3.87986C12.0948 2.54882 8.34069 3.21127 5.79171 5.8386C3.33985 8.36779 2.56881 12.2567 3.89286 15.5751C4.88192 18.0552 3.26056 19.8094 1.62731 21.5801C1.04853 22.2078 0.467774 22.8355 0 23.5L7.3754 16.7037"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M12.6043 1.34016C12.9973 2.03016 13.3883 2.72215 13.7783 3.41514C13.7941 3.44286 13.8169 3.46589 13.8445 3.48187C13.8721 3.49786 13.9034 3.50624 13.9353 3.50614H19.4873C19.6612 3.50614 19.8092 3.61614 19.9332 3.83314L21.3872 6.40311C21.5772 6.74011 21.6272 6.88111 21.4112 7.24011C21.1512 7.6701 20.8982 8.1041 20.6512 8.54009L20.2842 9.19809C20.1782 9.39409 20.0612 9.47809 20.2442 9.71008L22.8962 14.347C23.0682 14.648 23.0072 14.841 22.8532 15.117C22.4162 15.902 21.9712 16.681 21.5182 17.457C21.3592 17.729 21.1662 17.832 20.8382 17.827C20.0612 17.811 19.2863 17.817 18.5113 17.843C18.4946 17.8439 18.4785 17.8489 18.4644 17.8576C18.4502 17.8664 18.4385 17.8785 18.4303 17.893C17.5361 19.4773 16.6344 21.0573 15.7253 22.633C15.5563 22.926 15.3453 22.996 15.0003 22.997C14.0033 23 12.9983 23.001 11.9833 22.999C11.8889 22.9987 11.7961 22.9735 11.7145 22.9259C11.6328 22.8783 11.5652 22.8101 11.5184 22.728L10.1834 20.405C10.1756 20.3898 10.1637 20.3771 10.149 20.3684C10.1343 20.3598 10.1174 20.3554 10.1004 20.356H4.98244C4.69744 20.386 4.42944 20.355 4.17745 20.264L2.57447 17.494C2.52706 17.412 2.50193 17.319 2.50158 17.2243C2.50123 17.1296 2.52567 17.0364 2.57247 16.954L3.77945 14.834C3.79665 14.8041 3.80569 14.7701 3.80569 14.7355C3.80569 14.701 3.79665 14.667 3.77945 14.637C3.15073 13.5485 2.52573 12.4579 1.90448 11.3651L1.11449 9.97008C0.954488 9.66008 0.941489 9.47409 1.20949 9.00509C1.67448 8.1921 2.13647 7.38011 2.59647 6.56911C2.72847 6.33512 2.90046 6.23512 3.18046 6.23412C4.04344 6.23048 4.90644 6.23015 5.76943 6.23312C5.79123 6.23295 5.81259 6.22704 5.83138 6.21597C5.85016 6.20491 5.8657 6.1891 5.87643 6.17012L8.68239 1.27516C8.72491 1.2007 8.78631 1.13875 8.86039 1.09556C8.93448 1.05238 9.01863 1.02948 9.10439 1.02917C9.62838 1.02817 10.1574 1.02917 10.6874 1.02317L11.7044 1.00017C12.0453 0.997165 12.4283 1.03217 12.6043 1.34016Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12.6241 11.346L20.3848 3.44816C20.5309 3.29931 20.4487 3 20.2601 3H16.0842C16.0388 3 15.9949 3.01897 15.9594 3.05541L7.59764 11.5629C7.46721 11.6944 7.27446 11.5771 7.27446 11.3666V3.25183C7.27446 3.11242 7.18515 3 7.07594 3H4.19843C4.08932 3 4 3.11242 4 3.25183V20.7482C4 20.8876 4.08932 21 4.19843 21H7.07594C7.18515 21 7.27446 20.8876 7.27446 20.7482V17.1834C7.27446 17.1073 7.30136 17.0344 7.34815 16.987L9.94075 14.3486C10.0031 14.2853 10.0895 14.2757 10.159 14.3232L17.0934 19.5573C18.2289 20.3412 19.4975 20.8226 20.786 20.9652C20.9008 20.9778 21 20.8606 21 20.7133V17.3559C21 17.2276 20.9249 17.1232 20.8243 17.1073C20.0659 16.9853 19.326 16.6845 18.6569 16.222L12.6538 11.764C12.5291 11.6785 12.5135 11.4584 12.6241 11.346Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12.0962 3L10.0998 5.6577H1.59858L3.59417 3H12.0972H12.0962ZM22.3162 18.3432L20.3215 21H11.8497L13.8425 18.3432H22.3162ZM23 3L9.492 21H1L14.508 3H23Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              </div>
              <A href={language.route("/zen")}>
                <span>{i18n.t("home.zenCta.link")} </span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6.5 12L17 12M13 16.5L17.5 12L13 7.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="square"
                  />
                </svg>
              </A>
            </div>
          </section>

          <EmailSignup />

          <Footer />
        </div>
      </div>
      <Legal />
    </main>
  )
}
