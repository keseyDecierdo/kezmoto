import React, { useMemo, useRef, useState } from 'react';
import { IonButton, IonContent, IonIcon, IonPage, useIonRouter } from '@ionic/react';
import {
  addOutline,
  callOutline,
  chatbubblesOutline,
  chevronForwardOutline,
  closeOutline,
  documentLockOutline,
  locationOutline,
  megaphoneOutline,
  personCircleOutline,
  personOutline,
  searchOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import BrandMark from '../components/BrandMark';
import MarketCard from '../components/MarketCard';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { listingsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import type { Listing } from '../types';
import { searchListings } from '../utils/budgetSearch';
import { formatPrice } from '../utils/format';
import './Landing.css';

type Sort = 'recent' | 'price-asc' | 'price-desc';
type PriceBand = 'any' | 'under-50' | '50-100' | 'over-100';

const PRICE_BANDS: { id: PriceBand; label: string; test: (price: number) => boolean }[] = [
  { id: 'any', label: 'Any price', test: () => true },
  { id: 'under-50', label: 'Under ₱50k', test: (p) => p < 50_000 },
  { id: '50-100', label: '₱50k – ₱100k', test: (p) => p >= 50_000 && p <= 100_000 },
  { id: 'over-100', label: 'Over ₱100k', test: (p) => p > 100_000 },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

const TRUST_SIGNALS = [
  {
    icon: shieldCheckmarkOutline,
    title: 'Admin-assisted deals',
    body: 'Ask a KEZMOTO admin to sit in as middleman for the hand-off, payment and paperwork.',
  },
  {
    icon: documentLockOutline,
    title: 'Redact before you post',
    body: 'Black out plate numbers, names and addresses on OR/CR scans before anyone sees them.',
  },
  {
    icon: chatbubblesOutline,
    title: 'Talk to the actual owner',
    body: 'Every unit links to a direct thread with its seller. No agents, no relisted stock.',
  },
  {
    icon: megaphoneOutline,
    title: 'Post what you want',
    body: 'Cannot find the unit? Publish a Wanted post with your budget and let sellers come to you.',
  },
];

/** Footer contact block. */
const CONTACT = {
  name: 'Kesey G. Decierdo',
  phoneDisplay: '0955 807 1389',
  phoneHref: 'tel:+639558071389',
  address: 'Tablon Zone 4, Cagayan de Oro City',
};

/** The landing page's own "How it works" section (same story as the Onboarding slides). */
const HOW_IT_WORKS = [
  {
    title: 'Browse real units',
    body: 'Every listing is posted by the person who owns the motorcycle, with photos, mileage, condition notes and the reason it is being sold.',
  },
  {
    title: 'List yours in minutes',
    body: 'Five photos, two documents, condition notes and your price. Black out anything private on the OR/CR before it goes live.',
  },
  {
    title: 'Chat with the owner',
    body: 'Message the seller directly from the listing to ask questions, haggle and set a meet-up — no agents in between.',
  },
  {
    title: 'Bring in a middleman',
    body: 'Not comfortable meeting a stranger with cash? Request a KEZMOTO admin to handle the hand-off for either side of the deal.',
  },
];

const PAGE_SIZE = 20;

/**
 * Public landing page, laid out like a marketplace category page: search
 * header, category strip, brand tiles, filter bar and a dense listing grid.
 */
const Landing: React.FC = () => {
  const router = useIonRouter();
  const { isAuthenticated } = useAuth();
  const { isFavorite, toggleFavorite } = useMarketplace();
  const { data, loading, error, reload } = useAsync<Listing[]>(() => listingsApi.list(), []);
  const contentRef = useRef<HTMLIonContentElement>(null);

  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [priceBand, setPriceBand] = useState<PriceBand>('any');
  const [assistedOnly, setAssistedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('recent');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const active = useMemo(() => (data ?? []).filter((l) => l.status === 'active'), [data]);

  /** One tile per brand: display name, count and a cover photo. */
  const brands = useMemo(() => {
    const map = new Map<string, { name: string; count: number; photo?: string }>();
    for (const listing of active) {
      const key = listing.brand.trim().toLowerCase();
      const entry = map.get(key) ?? { name: listing.brand.trim(), count: 0, photo: listing.photos[0] };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [active]);

  const { results, budget } = useMemo(() => {
    const band = PRICE_BANDS.find((b) => b.id === priceBand) ?? PRICE_BANDS[0];
    const filtered = active.filter(
      (l) =>
        (brand === 'all' || l.brand.trim().toLowerCase() === brand) &&
        band.test(l.price) &&
        (!assistedOnly || l.adminAssisted)
    );
    const searched = searchListings(filtered, query);
    const list = [...searched.listings];
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    return { results: list, budget: searched.budget };
  }, [active, brand, priceBand, assistedOnly, query, sort]);

  const filtersActive = query !== '' || brand !== 'all' || priceBand !== 'any' || assistedOnly;

  const resetFilters = () => {
    setDraft('');
    setQuery('');
    setBrand('all');
    setPriceBand('any');
    setAssistedOnly(false);
    setSort('recent');
    setLimit(PAGE_SIZE);
  };

  /** Smooth-scrolls IonContent to a section, clearing the sticky header. */
  const scrollToSection = async (id: string) => {
    const content = contentRef.current;
    const target = document.getElementById(id);
    if (!content || !target) return;
    const scroller = await content.getScrollElement();
    const y =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 140;
    await content.scrollToPoint(0, Math.max(0, y), 450);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
    setLimit(PAGE_SIZE);
    void scrollToSection('listings');
  };

  const pickBrand = (key: string) => {
    setBrand(key);
    setLimit(PAGE_SIZE);
    void scrollToSection('listings');
  };

  const openUnit = (listing: Listing) => router.push(`/listing/${listing.id}`, 'forward');
  const like = (listing: Listing) =>
    isAuthenticated ? void toggleFavorite(listing.id) : router.push('/login', 'forward');
  /** Every sell action asks a signed-out visitor to log in first. */
  const sell = () => router.push(isAuthenticated ? '/units/new' : '/login', 'forward');
  const join = () => router.push(isAuthenticated ? '/units/new' : '/register', 'forward');

  return (
    <IonPage className="landing">
      <IonContent fullscreen ref={contentRef}>
        {/* ---------------- Header: logo · search · account · Sell ---------------- */}
        <header className="landing__header">
          <div className="kez-container landing__header-row">
            <button
              type="button"
              className="landing__logo"
              onClick={() => void contentRef.current?.scrollToTop(400)}
              aria-label="KEZMOTO — back to top"
            >
              <BrandMark size="sm" />
              <span>KEZMOTO</span>
            </button>

            <form className="landing__search" role="search" onSubmit={submitSearch}>
              <IonIcon icon={searchOutline} aria-hidden="true" />
              <input
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search motorcycles, brands, cities…"
                aria-label="Search motorcycles"
              />
              {draft && (
                <button
                  type="button"
                  className="landing__search-clear"
                  onClick={() => {
                    setDraft('');
                    setQuery('');
                  }}
                  aria-label="Clear search"
                >
                  <IonIcon icon={closeOutline} />
                </button>
              )}
              <button type="submit" className="landing__search-go">Search</button>
            </form>

            <div className="landing__account">
              {isAuthenticated ? (
                <button type="button" className="landing__link" onClick={() => router.push('/home', 'root')}>
                  <IonIcon icon={personCircleOutline} aria-hidden="true" />
                  <span>Open app</span>
                </button>
              ) : (
                <>
                  <button type="button" className="landing__link" onClick={() => router.push('/login', 'forward')}>
                    Log in
                  </button>
                  <button
                    type="button"
                    className="landing__link landing__signup"
                    onClick={() => router.push('/register', 'forward')}
                  >
                    Sign up
                  </button>
                </>
              )}
              <IonButton
                className={`kez-cta landing__sell${isAuthenticated ? '' : ' landing__sell--guest'}`}
                onClick={sell}
              >
                <IonIcon slot="start" icon={addOutline} />
                Sell
              </IonButton>
            </div>
          </div>

          {/* Category strip */}
          <nav className="landing__cats" aria-label="Categories">
            <div className="kez-container landing__cats-row">
              <button type="button" className={!filtersActive ? 'is-active' : ''} onClick={resetFilters}>
                All motorcycles
              </button>
              <button
                type="button"
                className={assistedOnly ? 'is-active' : ''}
                onClick={() => {
                  setAssistedOnly((v) => !v);
                  void scrollToSection('listings');
                }}
              >
                Admin-assisted deals
              </button>
              <button
                type="button"
                className={priceBand === 'under-50' ? 'is-active' : ''}
                onClick={() => {
                  setPriceBand(priceBand === 'under-50' ? 'any' : 'under-50');
                  void scrollToSection('listings');
                }}
              >
                Under ₱50k
              </button>
              <button type="button" onClick={() => router.push('/wanted', 'forward')}>Wanted posts</button>
              <button type="button" onClick={sell}>Sell a motorcycle</button>
              <button type="button" onClick={() => void scrollToSection('how-it-works')}>How it works</button>
            </div>
          </nav>
        </header>

        <main className="kez-container landing__main">
          {/* ---------------- Breadcrumb + title ---------------- */}
          <nav className="landing__crumbs" aria-label="Breadcrumb">
            <span>KEZMOTO</span>
            <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
            <span>Motorcycles</span>
            <IonIcon icon={chevronForwardOutline} aria-hidden="true" />
            <strong>Motorcycles for sale</strong>
          </nav>
          <header className="landing__title">
            <h1 className="kez-display">Motorcycles for sale</h1>
            <p className="kez-muted">
              {loading ? 'Loading listings…' : `${active.length} second-hand motorcycles, sold directly by their owners`}
            </p>
          </header>

          {/* ---------------- Promo banner ---------------- */}
          <section className="landing__banner" aria-label="Sell on KEZMOTO">
            <div className="landing__banner-copy">
              <p className="kez-eyebrow">Buy. Sell. Ride.</p>
              <h2 className="kez-display">Got a motorcycle to let go?</h2>
              <p>
                Post it in minutes, chat with buyers directly — and bring in a KEZMOTO admin as
                middleman whenever the deal needs one.
              </p>
              <div className="landing__banner-actions">
                <IonButton className="kez-cta landing__btn" onClick={sell}>
                  Start selling
                </IonButton>
                <IonButton
                  fill="outline"
                  className="landing__btn landing__btn--ghost"
                  onClick={() => void scrollToSection('how-it-works')}
                >
                  How it works
                </IonButton>
              </div>
            </div>
            <div className="landing__banner-media" aria-hidden="true">
              <img src="/landing/banner-moto.jpg" alt="" />
            </div>
          </section>

          {/* ---------------- Browse by brand ---------------- */}
          {brands.length > 0 && (
            <section className="landing__section" aria-labelledby="brands-head">
              <h2 id="brands-head" className="landing__section-title">Browse by brand</h2>
              <div className="landing__brands">
                {brands.map(([key, entry]) => (
                  <button
                    key={key}
                    type="button"
                    className={`landing__brand${brand === key ? ' is-active' : ''}`}
                    onClick={() => pickBrand(brand === key ? 'all' : key)}
                  >
                    <span className="landing__brand-img">
                      {entry.photo ? <img src={entry.photo} alt="" loading="lazy" /> : entry.name.charAt(0)}
                    </span>
                    <span className="landing__brand-name">{entry.name}</span>
                    <span className="landing__brand-count">{entry.count}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ---------------- Filter bar + listings ---------------- */}
          <section id="listings" className="landing__section" aria-labelledby="listings-head">
            <div className="landing__filters">
              <label className="landing__select">
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="landing__select">
                <span>Price</span>
                <select value={priceBand} onChange={(e) => setPriceBand(e.target.value as PriceBand)}>
                  {PRICE_BANDS.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </label>
              <label className="landing__select">
                <span>Brand</span>
                <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="all">All brands</option>
                  {brands.map(([key, entry]) => (
                    <option key={key} value={key}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`landing__toggle${assistedOnly ? ' is-active' : ''}`}
                onClick={() => setAssistedOnly((v) => !v)}
                aria-pressed={assistedOnly}
              >
                <IonIcon icon={shieldCheckmarkOutline} aria-hidden="true" />
                Assisted only
              </button>
              {filtersActive && (
                <button type="button" className="landing__reset" onClick={resetFilters}>
                  Clear all
                </button>
              )}
            </div>

            <div className="landing__results-head">
              <h2 id="listings-head" className="landing__section-title">
                {query ? `Results for “${query}”` : 'Recently listed'}
              </h2>
              {!loading && (
                <span className="kez-muted">
                  {results.length} listing{results.length === 1 ? '' : 's'}
                  {budget !== null && ` · closest to ${formatPrice(budget)}`}
                </span>
              )}
            </div>

            {loading && <LoadingState cards={5} label="Loading listings" />}
            {!loading && error && <ErrorState message={error} onRetry={reload} />}
            {!loading && !error && results.length === 0 && (
              <div className="landing__empty">
                <p className="kez-body">
                  {filtersActive ? 'No motorcycles match those filters.' : 'No motorcycles are listed yet.'}
                </p>
                <IonButton className="kez-cta landing__btn" onClick={filtersActive ? resetFilters : sell}>
                  {filtersActive ? 'Clear filters' : 'Be the first to sell'}
                </IonButton>
              </div>
            )}
            {!loading && !error && results.length > 0 && (
              <>
                <div className="landing__grid-wrap">
                  <div className="landing__grid">
                    {results.slice(0, limit).map((listing) => (
                      <MarketCard
                        key={listing.id}
                        listing={listing}
                        onView={openUnit}
                        onToggleFavorite={like}
                        isFavorite={isAuthenticated && isFavorite(listing.id)}
                      />
                    ))}
                  </div>
                </div>
                {results.length > limit && (
                  <div className="landing__more">
                    <IonButton
                      fill="outline"
                      className="landing__btn landing__btn--ghost"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    >
                      View more
                    </IonButton>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ---------------- How it works ---------------- */}
          <section id="how-it-works" className="landing__section" aria-labelledby="how-head">
            <h2 id="how-head" className="landing__section-title">How it works</h2>
            <ol className="landing__steps">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step.title} className="landing__step">
                  <span className="landing__step-num">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p className="kez-muted">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="landing__steps-cta">
              <IonButton className="kez-cta landing__btn" onClick={join}>
                {isAuthenticated ? 'Start selling' : 'Create a free account'}
              </IonButton>
            </div>
          </section>

          {/* ---------------- Why KEZMOTO ---------------- */}
          <section className="landing__section landing__why" aria-labelledby="why-head">
            <h2 id="why-head" className="landing__section-title">Why buy and sell on KEZMOTO</h2>
            <div className="landing__why-grid">
              {TRUST_SIGNALS.map((signal) => (
                <article key={signal.title} className="landing__why-item">
                  <span className="landing__why-icon">
                    <IonIcon icon={signal.icon} aria-hidden="true" />
                  </span>
                  <h3>{signal.title}</h3>
                  <p className="kez-muted">{signal.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ---------------- About text block ---------------- */}
          <section className="landing__section landing__about" aria-labelledby="about-head">
            <h2 id="about-head" className="landing__section-title">Buying a second-hand motorcycle on KEZMOTO</h2>
            <div className="landing__about-cols">
              <p className="kez-muted">
                KEZMOTO lets people buy and sell second-hand motorcycles directly, with optional
                admin-assisted transactions for safer buying and selling. Every account can do both —
                list the unit you are letting go of and message a seller about your next one.
              </p>
              <p className="kez-muted">
                Before you pay, check the OR/CR against the seller&apos;s ID, test the engine, brakes,
                tires and lights, and meet somewhere public. If anything feels off, ask a KEZMOTO admin
                to join the conversation as middleman.
              </p>
            </div>
          </section>
        </main>

        {/* ---------------- Footer ---------------- */}
        <footer className="landing__footer">
          <div className="kez-container landing__footer-grid">
            <div className="landing__footer-brand">
              <BrandMark size="md" />
              <p className="kez-muted">
                Second-hand motorcycles, sold directly by their owners — with an admin middleman
                whenever a deal needs one.
              </p>
            </div>

            <nav className="landing__footer-col" aria-label="Marketplace">
              <h4>Marketplace</h4>
              <button type="button" onClick={() => void scrollToSection('listings')}>Motorcycles for sale</button>
              <button type="button" onClick={() => router.push('/wanted', 'forward')}>Wanted posts</button>
              <button type="button" onClick={sell}>Sell a motorcycle</button>
              <button type="button" onClick={() => router.push('/home', 'forward')}>Browse all units</button>
            </nav>

            <nav className="landing__footer-col" aria-label="Account">
              <h4>Account</h4>
              <button type="button" onClick={() => router.push('/login', 'forward')}>Log in</button>
              <button type="button" onClick={() => router.push('/register', 'forward')}>Create account</button>
              <button type="button" onClick={() => void scrollToSection('how-it-works')}>How it works</button>
            </nav>

            <div className="landing__footer-col">
              <h4>Contact</h4>
              <span>
                <IonIcon icon={personOutline} aria-hidden="true" />
                {CONTACT.name}
              </span>
              <a href={CONTACT.phoneHref}>
                <IonIcon icon={callOutline} aria-hidden="true" />
                {CONTACT.phoneDisplay}
              </a>
              <span>
                <IonIcon icon={locationOutline} aria-hidden="true" />
                {CONTACT.address}
              </span>
            </div>
          </div>

          <div className="kez-container landing__footer-bottom">
            <p>© {new Date().getFullYear()} KEZMOTO. All rights reserved.</p>
            <p>Safety first: meet in public places and inspect papers before paying.</p>
          </div>
        </footer>
      </IonContent>
    </IonPage>
  );
};

export default Landing;
