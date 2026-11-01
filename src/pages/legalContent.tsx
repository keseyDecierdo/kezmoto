import React from 'react';
import { PLAN_PRICES } from '../utils/plans';

/* KEZMOTO legal pages. Plain-language drafts based on how the system works;
   have them reviewed before going live. Update LEGAL_UPDATED (and
   TERMS_VERSION in authService) whenever the wording changes. */

export const LEGAL_UPDATED = 'November 1, 2026';

export const OPERATOR = {
  name: 'KEZMOTO',
  owner: 'Kesey G. Decierdo',
  address: 'Tablon Zone 4, Cagayan de Oro City, Misamis Oriental, Philippines',
  phone: '0955 807 1389',
  phoneHref: 'tel:+639558071389',
};

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

const contact = (
  <p>
    {OPERATOR.owner}, {OPERATOR.address} · <a href={OPERATOR.phoneHref}>{OPERATOR.phone}</a>
  </p>
);

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    'This policy explains what personal information KEZMOTO collects, why, who processes it, how long it is kept and the rights you have under the Data Privacy Act of 2012 (Republic Act No. 10173).',
  sections: [
    {
      heading: 'Who we are',
      body: (
        <>
          <p>
            KEZMOTO is an online marketplace for second-hand motorcycles operated by {OPERATOR.owner}, who
            is the personal information controller and acts as Data Protection Officer.
          </p>
          {contact}
        </>
      ),
    },
    {
      heading: 'What we collect',
      body: (
        <ul>
          <li>
            <strong>Account details:</strong> first, middle and last name, email address, mobile number,
            birthday, address (region to barangay and street), and sex if you choose to give it.
          </li>
          <li>
            <strong>Identity verification:</strong> a photo of your valid ID and a live face scan. These are
            sensitive personal information and are collected only with your separate consent.
          </li>
          <li>
            <strong>What you post:</strong> listings, photos, OR/CR documents (with the parts you black out
            hidden), Wanted posts, profile photo, bio and Facebook link.
          </li>
          <li>
            <strong>Messages and deals:</strong> chats, photos sent in chat, price offers, transaction
            status, meetups, reviews and reports.
          </li>
          <li>
            <strong>Payments:</strong> GCash reference numbers and receipt screenshots you submit for the
            commission, KEZMOTO Pro or Boosts. We never receive your GCash PIN or card details.
          </li>
          <li>
            <strong>AI assistant:</strong> the questions you ask the buying assistant and its answers.
          </li>
        </ul>
      ),
    },
    {
      heading: 'Why we use it',
      body: (
        <ul>
          <li>To create and secure your account, and to confirm your email (contract and consent).</li>
          <li>To check that you are 18 or older and that your ID matches your name and face, before you can sell.</li>
          <li>To show your listings to buyers and let buyers and sellers talk to each other.</li>
          <li>To run the middleman service, record deals, and collect and confirm payments.</li>
          <li>To score listings and spot possible fraud, keeping the marketplace safer.</li>
          <li>To send you account emails, like your sign-up code and password reset links.</li>
        </ul>
      ),
    },
    {
      heading: 'Who processes it for us',
      body: (
        <>
          <p>We use these service providers. They process your data only to provide their service to KEZMOTO:</p>
          <ul>
            <li>
              <strong>Supabase</strong>: account login, database, file storage and live chat.
            </li>
            <li>
              <strong>Google (Gemini API)</strong>: reads your ID and compares your face scan for verification,
              scores listings, checks for fraud and powers the buying assistant.
            </li>
            <li>
              <strong>Brevo</strong>: sends account emails (verification codes and password resets).
            </li>
            <li>
              <strong>Render</strong>: hosts the KEZMOTO website.
            </li>
          </ul>
          <p>
            Some of these providers store data outside the Philippines. Other users see only what you choose
            to post: your name, location, listings, profile photo and the &ldquo;Verified&rdquo; badge.
            Your email, birthday, ID and face scan are never shown to other users. We do not sell your data.
          </p>
        </>
      ),
    },
    {
      heading: 'How long we keep it',
      body: (
        <ul>
          <li>Account, listings and chats: until you delete your account.</li>
          <li>ID photo and face scan: until you replace them or delete your account.</li>
          <li>
            Payment records (amount, date, GCash reference and receipt): kept for as long as Philippine tax and
            accounting rules require, without your name once your account is deleted.
          </li>
        </ul>
      ),
    },
    {
      heading: 'Cookies and browser storage',
      body: (
        <p>
          KEZMOTO does not use advertising or tracking cookies, and has no analytics. Your browser stores only
          what is needed to keep you logged in (your login session). This is essential for the site to work, so no cookie banner is needed.
        </p>
      ),
    },
    {
      heading: 'Your rights',
      body: (
        <>
          <p>Under the Data Privacy Act you can:</p>
          <ul>
            <li>be informed about, and get a copy of, the personal data we hold about you;</li>
            <li>correct wrong details (most can be edited in Profile &amp; Settings);</li>
            <li>
              withdraw consent or have your data deleted. Use <strong>Delete account</strong> in Profile &amp;
              Settings, or contact us;
            </li>
            <li>object to processing, and complain to the National Privacy Commission (privacy.gov.ph).</li>
          </ul>
          {contact}
        </>
      ),
    },
    {
      heading: 'Age',
      body: <p>KEZMOTO is only for people 18 years old and above. We do not knowingly collect data from minors.</p>,
    },
    {
      heading: 'Security',
      body: (
        <p>
          Data is encrypted in transit, and every table is protected by access rules, so each person can only
          read what they are allowed to. ID photos, face scans, documents and receipts are kept in private
          storage that only you and KEZMOTO admins can open.
        </p>
      ),
    },
    {
      heading: 'Changes',
      body: (
        <p>
          If this policy changes, we will update the date at the top and tell you in the app. For significant
          changes we may ask you to agree again.
        </p>
      ),
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    'These terms are the agreement between you and KEZMOTO when you use the website or app. By creating an account you agree to them.',
  sections: [
    {
      heading: 'What KEZMOTO is',
      body: (
        <p>
          KEZMOTO is a platform where people list and find second-hand motorcycles. The sale is between the
          buyer and the seller. KEZMOTO is not the seller, does not own the units, and does not guarantee any
          unit, document or user, even with a middleman involved.
        </p>
      ),
    },
    {
      heading: 'Your account',
      body: (
        <ul>
          <li>You must be at least 18 years old and give true, current information.</li>
          <li>One account per person. Keep your password private. You are responsible for activity on your account.</li>
          <li>To post a unit, you must verify your identity with a valid ID and a face scan.</li>
        </ul>
      ),
    },
    {
      heading: 'Listing a motorcycle',
      body: (
        <ul>
          <li>Only list a unit you own or are allowed to sell, with genuine OR/CR documents.</li>
          <li>Describe the unit honestly: photos, mileage, condition and price must be accurate.</li>
          <li>No stolen units, units with tampered engine or chassis numbers, or units under an unsettled loan without the lender&apos;s consent.</li>
          <li>KEZMOTO may remove listings that break these rules or are flagged as possible fraud. You can appeal a removal.</li>
        </ul>
      ),
    },
    {
      heading: 'Buying safely',
      body: (
        <p>
          Before paying, check the OR/CR against the seller&apos;s ID, test the unit and meet somewhere public.
          AI scores on listings are estimates from the seller&apos;s own photos and notes, not an inspection.
        </p>
      ),
    },
    {
      heading: 'The middleman service',
      body: (
        <p>
          Either side can request a KEZMOTO admin to join a deal. The admin helps check papers, schedule an
          inspection and guide the meetup. The buyer still pays the seller directly; KEZMOTO does not hold
          the money for the sale. Admins are available on a best-effort basis.
        </p>
      ),
    },
    {
      heading: 'Fees',
      body: (
        <ul>
          <li>Browsing, buying, chatting, offers and Wanted posts are free.</li>
          <li>
            When a unit sells through KEZMOTO, the seller pays a commission of <strong>5%</strong> of the final
            agreed price (<strong>3%</strong> with KEZMOTO Pro), by GCash.
          </li>
          <li>
            Optional: KEZMOTO Pro at ₱{PLAN_PRICES.pro} for 30 days or ₱{PLAN_PRICES.pro_year.toLocaleString()} for
            one year, and Boosts at ₱{PLAN_PRICES.boost} per listing for 7 days.
          </li>
          <li>There are no other fees. Refunds follow the Refund Policy.</li>
        </ul>
      ),
    },
    {
      heading: 'Not allowed',
      body: (
        <ul>
          <li>Scams, fake listings, fake payment receipts or impersonating someone.</li>
          <li>Harassment, threats, hate speech or sharing other people&apos;s private information.</li>
          <li>Moving a deal off KEZMOTO to avoid the commission after agreeing through the app.</li>
          <li>Trying to break, overload or get around the site&apos;s security.</li>
        </ul>
      ),
    },
    {
      heading: 'Suspension and deletion',
      body: (
        <p>
          KEZMOTO may suspend or disable accounts that break these terms. You can delete your account any time
          from Profile &amp; Settings once you have no open deals.
        </p>
      ),
    },
    {
      heading: 'Your content',
      body: (
        <p>
          You keep ownership of your photos and text. You allow KEZMOTO to display them on the platform while
          your listing or account exists.
        </p>
      ),
    },
    {
      heading: 'Limits of responsibility',
      body: (
        <p>
          KEZMOTO is provided &ldquo;as is&rdquo;. To the extent allowed by law, KEZMOTO is not liable for losses
          from deals between users, the condition or legality of a unit, or users&apos; actions. Nothing here
          removes rights you have under the Consumer Act of the Philippines.
        </p>
      ),
    },
    {
      heading: 'Governing law',
      body: (
        <p>
          These terms follow the laws of the Republic of the Philippines. Disputes go to the proper courts of
          Cagayan de Oro City.
        </p>
      ),
    },
    {
      heading: 'Contact',
      body: contact,
    },
  ],
};

export const REFUNDS: LegalDoc = {
  title: 'Refund Policy',
  intro:
    'How refunds work for the commission, KEZMOTO Pro and Boosts. All payments are made by GCash and returned to the same GCash account.',
  sections: [
    {
      heading: 'Payments we could not match',
      body: (
        <p>
          If an admin cannot find your payment (wrong reference number or amount), it is marked &ldquo;Not
          approved&rdquo; and nothing is activated. If money did reach KEZMOTO&apos;s GCash, contact us with the
          reference number and we will refund it or apply it correctly.
        </p>
      ),
    },
    {
      heading: 'Paid twice or paid the wrong amount',
      body: <p>Duplicate payments and overpayments are refunded in full.</p>,
    },
    {
      heading: 'KEZMOTO Pro',
      body: (
        <ul>
          <li>You can ask for a full refund within 3 days of approval if you have not used a Pro benefit (an extra listing or a free Boost).</li>
          <li>After that, Pro is not refundable, but it keeps working until its end date.</li>
          <li>
            If KEZMOTO suspends your account by mistake, or the service is unavailable for a long period, you get
            the unused days back as a refund or added time.
          </li>
        </ul>
      ),
    },
    {
      heading: 'Boosts',
      body: (
        <ul>
          <li>If KEZMOTO removes a boosted listing by mistake, the unused days are refunded or moved to another listing.</li>
          <li>If the listing sells or you remove it yourself, the Boost is used and not refundable.</li>
          <li>Listings removed for breaking the Terms of Service are not refunded.</li>
        </ul>
      ),
    },
    {
      heading: 'Commission',
      body: (
        <p>
          The commission is due once a sale is completed. If the sale is cancelled or reversed afterwards (for
          example the buyer returns the unit), contact us within 7 days. We review each case and refund the
          commission if the sale did not go through.
        </p>
      ),
    },
    {
      heading: 'How to request a refund',
      body: (
        <>
          <p>
            Send your name, the GCash reference number and the reason. Approved refunds are sent within 7 working
            days.
          </p>
          {contact}
        </>
      ),
    },
  ],
};
