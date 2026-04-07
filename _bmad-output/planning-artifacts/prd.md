---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - product-brief-rentingapp-distillate.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: web_app
  domain: general
  complexity: low-medium
  projectContext: greenfield
---

# Product Requirements Document — RentingApp

**Author:** Clint
**Date:** 2026-03-28

## Executive Summary

RentingApp is a web-based operational backbone for independent rental operators, starting with equipment rentals in the Utah market. It solves the operational chaos that independent operators face today: juggling text messages across platforms, losing bookings to no-shows, managing availability manually, and presenting an unprofessional experience to potential renters.

Rather than forcing operators onto a new marketplace or into bloated enterprise SaaS, RentingApp plugs into the distribution channels operators already use — KSL Classifieds, Facebook Marketplace, and Craigslist. Operators create listings once, get platform-tailored ad copy and booking links, and funnel all renter interactions into a single management hub. Renters who click through land on a professional booking page with real-time availability, instant scheduling, digital contract signing, and payment holds via Stripe — eliminating back-and-forth and preventing no-shows through financial commitment at booking time.

The platform is web-first with no native mobile app for MVP. Communication between renters and operators flows through Twilio-powered SMS, unified in a single message hub regardless of which classifieds platform the renter originated from.

### What Makes This Special

RentingApp is built by an operator, for operators. The product philosophy rejects the "all or nothing" approach taken by competitors like Booqable (overbuilt, overpriced enterprise SaaS) and Fat Llama (closed marketplace requiring operators to drive renters to their platform). Instead, RentingApp grows methodically — small scope, deeply tailored by region.

The regional expansion model (Utah → Idaho → state by state) creates a product that feels custom to each market rather than a generic, cold tool taking a "good enough" approach. The architecture is category-agnostic from day one, but launch is deliberately equipment-only in Utah to prove the model before expanding. RentingApp earns only when operators earn — a per-transaction revenue model aligned with operator success.

## Project Classification

- **Project Type:** Web Application (responsive, SPA)
- **Domain:** Rental operations / marketplace-adjacent tooling
- **Complexity:** Low-medium — core infrastructure (payments, SMS) handled by Stripe and Twilio; complexity concentrated in booking lifecycle, scheduling logic, and multi-channel communication
- **Project Context:** Greenfield — new product, no existing codebase

## Success Criteria

### User Success

- **Operator:** RentingApp becomes the default tool for every rental — meaningfully better than the manual workflow of juggling texts, tracking availability in your head, and hoping renters show up. Listings are created once with generated ad copy ready to post across platforms in minutes.
- **Renter:** The experience from classifieds link click to confirmed booking (with signed contract and payment hold) is frictionless and professional. No back-and-forth texting, no uncertainty about availability, no wondering if the owner saw your message.

### Business Success

- **Primary metric:** Break even financially for 3 consecutive months — revenue from transaction fees covers Stripe processing costs, Twilio SMS costs, and infrastructure/hosting.
- **Revenue model:** 5–8% per-transaction take rate on completed bookings, inclusive of payment processing fees.
- **Early stage:** Subsidizing operational costs is acceptable while learning real-world usage patterns and cost profiles.

### Technical Success

- Booking flow completes end-to-end without manual intervention: renter books → contract signed → payment held → operator notified.
- No double-bookings — real-time availability enforcement is non-negotiable.
- All renter communications from all classifieds channels funnel into a single hub with no messages lost.
- Payment holds work reliably — authorization at booking, capture/release per cancellation policy.
- Cost per transaction must be trackable so the revenue model can be tuned.

### Measurable Outcomes

- Operator can go from new listing to posted ad copy + booking link in under 5 minutes.
- Renter can go from classifieds link to confirmed booking in a single session.
- Zero double-bookings in production.
- 100% of renter messages across channels visible in the unified hub.
- Break-even within the first year of operation.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — built by the operator, for the operator. The goal is a complete end-to-end rental management tool that one person (Clint) can use for real equipment rentals in Utah. Every feature must earn its place by solving a real problem in the current manual workflow.

**Resource Requirements:** Solo developer. This constrains scope aggressively — every feature must be implementable and maintainable by one person. Lean on third-party services (Stripe, Twilio) to avoid building infrastructure.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Journey 1: Operator creates listing and posts to classifieds (template-based ad copy, not AI-generated)
- Journey 2: Renter discovers listing, views availability, authenticates via phone OTP, books with contract + payment hold
- Journey 3: Renter extends rental via manage-my-rental dashboard (self-service, within 4-day buffer)
- Journey 4: No-show handling with hold capture per contract terms
- Journey 5: Lean admin via Stripe/Twilio dashboards + in-app listing/booking management

**Must-Have Capabilities:**
- Listing creation: photos, description, pricing (daily rate), availability calendar
- Posting assistant: template-based ad copy generation (fill-in-the-blank per platform) + shareable booking links for KSL, Facebook Marketplace, Craigslist
- Renter-facing booking page: professional listing view, live availability calendar, date selection (no auth required to browse)
- Renter authentication: phone number + SMS OTP via Twilio (required before booking)
- Digital contract: single standard rental agreement template with e-signature (terms, liability, rental period, pricing, cancellation/no-show policy)
- Payment hold: Stripe authorization at booking, capture on completion or no-show, release on cancellation
- Cancellation policy: simple flat rule (e.g., full refund if cancelled 48+ hours before rental, no refund within 48 hours) — platform-standard, not operator-configurable
- Renter self-service cancellation: cancel booking via manage-my-rental dashboard, refund per flat cancellation policy
- Scheduling engine: real-time double-booking prevention, automatic calendar updates on booking/extension/cancellation, 5-day buffer enforcement (4 extension + 1 maintenance)
- SMS communication hub: unified inbox for renter-operator messages across all classifieds channels, automated notifications (booking confirmation, return reminders, extension confirmations)
- Manage-my-rental dashboard: universal URL behind phone OTP auth — view rentals, extend rental, check in equipment (damage reporting, condition confirmation), cancel booking
- Operator notifications: real-time alerts for bookings, extensions, check-ins, cancellations, no-shows

**Explicitly Deferred from MVP:**
- AI-generated ad copy (template-based for MVP)
- Customizable contract templates (single standard template for MVP)
- Operator-configurable cancellation policies (flat platform rule for MVP)
- Multi-operator support (Clint only for MVP)

### Post-MVP Features (Phase 2 — Growth)

- AI-generated ad copy optimized per classifieds platform
- AI customer service agent for renter Q&A on listed products
- Customizable contract templates per listing/equipment type
- Operator-configurable cancellation and no-show policies
- Review and reputation system for building trust
- Multi-operator onboarding and support
- Analytics dashboard for operator insights (booking volume, revenue, utilization rates)

### Future Vision (Phase 3 — Expansion)

- Insurance and damage protection options for high-value rentals
- State-by-state geographic expansion (Utah → Idaho → repeat) with regional tailoring
- Category expansion: equipment → vehicles → housing → recreational gear (category-agnostic architecture from day one)
- Multi-user / team accounts for operators with employees
- Native mobile app
- Operator-configurable pricing rules (hourly, weekly, custom rates, seasonal pricing)

### Risk Mitigation Strategy

**Technical Risks:**
- *Stripe authorization hold lifecycle complexity* — holds expire after 7 days by default. For rentals longer than 7 days, the system needs to handle hold re-authorization or incremental authorization. Mitigation: research Stripe's extended authorization options early; for MVP, limit rental duration to 7 days max if needed.
- *Twilio SMS costs at scale* — unknown cost profile per transaction. Mitigation: track SMS count per booking from day one to model unit economics.
- *Solo developer bottleneck* — one person building, maintaining, and operating. Mitigation: lean heavily on managed services (Stripe, Twilio, managed hosting), minimize custom infrastructure.

**Market Risks:**
- *Demand validation* — will renters actually use the booking flow instead of just texting directly? Mitigation: Clint uses it for his own rentals first, measures conversion from classifieds link click to completed booking.
- *Take rate sensitivity* — 5–8% may feel high for low-margin equipment rentals. Mitigation: start at the low end, monitor operator willingness to pay as value becomes clear.

**Resource Risks:**
- *Solo dev scope creep* — biggest risk is building too much before validating. Mitigation: the MVP scope above is deliberately tight — one operator, one equipment type, one market, template-based copy, single contract template, flat cancellation policy. Ship and learn.

## User Journeys

### Journey 1: Clint Lists His Mini Excavator (Operator — Happy Path)

Clint has a mini excavator sitting idle most weekdays. He's been renting it out through KSL Classifieds, but the process is painful — he posts an ad, gets flooded with texts, plays phone tag to coordinate schedules, and has had two renters no-show after he turned others away. He's done with the chaos.

He signs into RentingApp and creates a listing: uploads photos of the excavator, writes a quick description, sets his daily rate at $350, and blocks out the weekends he needs it for his own projects on the availability calendar. The posting assistant generates three versions of ad copy — one tailored for KSL, one for Facebook Marketplace, one for Craigslist — each with a unique booking link. Clint copies the KSL version, posts it on KSL in under two minutes, and does the same for Facebook. Total time: five minutes. He's live on two platforms with professional copy and a booking link that handles everything.

Over the next few days, messages from interested renters arrive in his unified hub. He can see which platform each message came from, respond via SMS without switching apps, and every conversation is threaded. When a renter books through the link, Clint gets a notification: booking confirmed, contract signed, payment held. No phone tag. No wondering if they'll show up. The excavator is booked for next Tuesday through Thursday, and the calendar updates automatically — no one else can book those days.

**Climax:** Clint checks his phone Tuesday morning and sees a notification: "Your mini excavator rental has started. $1,050 hold confirmed." He didn't exchange a single text to make this happen.

**Resolution:** Clint's new reality — he posts once, bookings flow in, and he spends zero time coordinating. The excavator earns money while he focuses on his day job.

### Journey 2: Marcus Books an Excavator (Renter — Happy Path)

Marcus is digging a trench for a sprinkler system this weekend. He searches KSL Classifieds for "mini excavator rental" and finds Clint's listing — it stands out because the ad copy is polished, the photos are clear, and there's a direct booking link instead of "text me for details."

He clicks the link and lands on a professional booking page. He sees the excavator's specs, daily rate, and a live availability calendar. Saturday and Sunday are open. He selects both days and reviews the total ($700). The system prompts him to enter his phone number, sends an OTP code via SMS, and he authenticates. He proceeds through a digital contract — rental terms, liability, return expectations — and signs with a tap. He enters his card, and the system places a $700 hold (not a charge). He gets an SMS confirmation with the booking details, pickup instructions, and a link to his manage-my-rental dashboard where he can view his rental details, extend his rental, or handle check-in when the time comes.

Saturday morning, Marcus picks up the excavator. No awkward "are you the guy?" texts. The contract covers everything. He digs his trench, and on Sunday evening he receives an SMS: "Your rental return is scheduled for today. Manage your rental here: [link]." He clicks through to the familiar manage-my-rental dashboard, confirms the excavator is returned to the right spot, notes that everything operated fine, and submits. Done.

**Climax:** Marcus booked a $700 rental in under three minutes from a classifieds ad — and it felt like booking a hotel room, not haggling with a stranger.

**Resolution:** Marcus tells his neighbor about the experience. The neighbor has a stump to grind next month and asks for the link.

### Journey 3: Marcus Extends His Rental (Renter — Extension Path)

It's Sunday morning and Marcus realizes the trench isn't done — he underestimated the rocky soil. He gets the return reminder SMS and clicks the manage-my-rental link. Instead of checking in the equipment, he selects "Extend Rental." The interface shows he can add up to 4 additional days (Monday through Thursday — Friday is blocked as Clint's maintenance day). He picks Monday, the hold is extended by $350 to $1,050 total, and he gets an updated confirmation.

Clint receives a notification: "Marcus extended his rental by 1 day. New return date: Monday. Updated hold: $1,050." No back-and-forth. No renegotiation. Clint's calendar automatically blocks Monday, and the 1-day maintenance buffer shifts to Tuesday.

**Climax:** What would have been a stressful "hey can I keep it another day?" text exchange was a 30-second self-service action.

**Resolution:** Marcus finishes the trench Monday, returns the excavator, and checks in through the manage-my-rental dashboard. Clint has Tuesday to clean and inspect before the next booking.

### Journey 4: The No-Show (Operator — Edge Case)

Clint gets a booking for next Saturday — contract signed, $350 held. He turns away two other inquiries for that day. Saturday morning, the renter doesn't show up. No text, no call. In the old world, Clint would have lost a day's revenue and been furious.

With RentingApp, the no-show policy in the signed contract kicks in. The system flags the rental as a no-show when the renter doesn't confirm pickup. Per the contract terms, Clint can capture the full held amount. He initiates the capture from his dashboard, the $350 is charged, and the day is freed up on the calendar for future bookings.

**Climax:** Clint lost the rental day but not the revenue. The hold-based system did exactly what it was designed to do.

**Resolution:** Clint no longer fears no-shows. The financial commitment at booking time means renters have skin in the game, and the ones who do no-show are covered by the contract they signed.

### Journey 5: Platform Operations (Admin — MVP)

For MVP, Clint is both operator and platform admin. Admin needs are minimal — Stripe dashboard handles transaction monitoring and payout details, Twilio dashboard shows SMS activity and costs. Within RentingApp, Clint can view all his listings, see upcoming and past bookings, and review the unified message hub.

If a dispute arises (renter claims they returned equipment damaged, operator disagrees), the check-in record from the manage-my-rental flow provides documented evidence — the renter's own damage report or confirmation of good condition. For MVP, dispute resolution beyond this documentation is handled offline.

**Climax:** The system generates enough documentation (contracts, check-in reports, payment records) that Clint has a paper trail without building a dedicated admin console.

**Resolution:** MVP admin is lean by design. As more operators join, dedicated admin tooling becomes a growth feature.

## Web App Specific Requirements

### Project-Type Overview

RentingApp is a single-page application (SPA) serving two distinct user experiences: an operator-facing dashboard for listing management, booking oversight, and communication, and a renter-facing booking flow for availability viewing, contract signing, and payment. Renters arrive exclusively via classifieds links — organic search discovery is not part of the MVP strategy.

### Technical Architecture Considerations

- **Application Type:** Single Page Application (SPA)
- **Rendering Strategy:** Client-side rendering. No SSR/SSG needed — SEO is not a priority since renters arrive via direct classifieds links, not search engines.
- **Authentication:**
  - **Operator:** Standard authentication required for dashboard access.
  - **Renter:** Phone number + SMS OTP code via Twilio. No passwords, no traditional account creation. Renters can view listings and check availability without auth. Authentication required before booking (contract signing / payment hold).
  - **Manage-my-rental dashboard:** Single universal URL. Renter logs in with phone number + SMS OTP and sees all their rentals (current, past, upcoming).

### Renter Booking Flow

1. Renter clicks classifieds link → views listing, photos, pricing, availability calendar (no auth required)
2. Renter selects dates and proceeds to book → prompted to enter phone number → receives SMS OTP → authenticates
3. Renter signs contract, payment hold placed → booking confirmed
4. All rentals accessible via universal manage-my-rental dashboard (same auth flow)

### Browser Support

- **Target:** Modern browsers only — Chrome, Safari, Firefox, Edge (latest 2 major versions)
- **No support required for:** Internet Explorer, legacy mobile browsers
- **Mobile web:** Responsive design required — renters will frequently access booking pages from mobile devices via classifieds apps

### Responsive Design

- **Renter booking page:** Mobile-first — primary access path is tapping a link from a classifieds app on a phone. Professional, trustworthy appearance on all screen sizes.
- **Operator dashboard:** Desktop-optimized with functional mobile support. Operators need to manage bookings and respond to messages on the go, but primary management is expected from desktop/tablet.
- **Manage-my-rental dashboard:** Mobile-first — accessed via SMS links on the renter's phone.

### SEO Strategy

- **MVP:** None. Renters arrive via classifieds booking links, not organic search. No investment in meta tags, structured data, or search indexing beyond basic defaults.
- **Future consideration:** If organic search becomes a growth channel post-MVP, SSR or pre-rendering can be added for renter-facing pages.

### Accessibility

- **Target:** Standard best practices (semantic HTML, keyboard navigation, sufficient color contrast, screen reader compatibility for core flows).
- **No formal WCAG certification** targeted for MVP, but accessible patterns followed as a baseline.

### Implementation Considerations

- **SMS OTP:** Twilio handles both communication SMS and authentication OTP codes — single provider for both.
- **Routing:** Unique booking page URLs per listing (shareable from classifieds), single universal manage-my-rental route behind renter auth.
- **Session:** Lightweight renter sessions — phone-number-based identity, OTP on every login (no persistent passwords to manage).
- **State management:** Booking flow state (date selection → contract → payment) must be resilient to page refreshes — renters shouldn't lose progress mid-booking.
- **Offline:** No offline support required for MVP. All interactions require connectivity.

## Functional Requirements

### Listing Management

- FR1: Operator can create a rental listing with photos, description, daily pricing, and availability calendar
- FR2: Operator can edit an existing listing's details, photos, pricing, and availability
- FR3: Operator can block dates on the availability calendar for personal use
- FR4: Operator can delete a listing
- FR5: Operator can view all their listings in one place

### Posting Assistant

- FR6: Operator can generate template-based ad copy for a listing, tailored per classifieds platform (KSL, Facebook Marketplace, Craigslist)
- FR7: Operator can copy generated ad copy to clipboard for manual posting
- FR8: System generates a unique shareable booking link per listing for use in classifieds ads

### Renter Discovery & Booking

- FR9: Renter can view a listing page with photos, description, pricing, and live availability calendar without authentication
- FR10: Renter can select desired rental dates and see the total cost before committing
- FR11: Renter can authenticate via phone number and SMS OTP code to proceed with booking
- FR12: Renter can review and e-sign a standard rental agreement (terms, liability, rental period, pricing, cancellation/no-show policy)
- FR13: System places a Stripe authorization hold on the renter's payment method upon booking confirmation
- FR14: Renter receives SMS confirmation with booking details, pickup instructions, and a link to the manage-my-rental dashboard
- FR15: System prevents booking on dates that are already booked, blocked, or within a maintenance buffer

### Manage-My-Rental Dashboard

- FR16: Renter can log in to a universal manage-my-rental dashboard via phone number + SMS OTP
- FR17: Renter can view all their rentals (current, upcoming, past) from the dashboard — past rentals are visible for 45 days after completion, then removed
- FR18: Renter can extend a current rental by up to 4 additional days within the extension buffer (self-service, no operator approval required)
- FR19: System extends the existing payment hold when a renter extends their rental
- FR20: Renter can cancel a booking via the dashboard, with refund applied per the flat cancellation policy
- FR21: Renter can check in returned equipment through the dashboard (confirm return, report damage, comment on machine operation quality)
- FR22: Renter receives SMS return reminder on return date/time with a link to the manage-my-rental dashboard

### Scheduling & Availability

- FR23: System enforces real-time double-booking prevention across all booking and extension actions
- FR24: System automatically updates the availability calendar when a booking is created, extended, or cancelled
- FR25: System enforces a 5-day post-rental buffer (4 days available for renter extension + 1 mandatory maintenance day)
- FR26: System shifts the maintenance buffer when a rental is extended

### Payment Lifecycle

- FR27: System authorizes a payment hold via Stripe at booking time
- FR28: System captures the held funds upon rental completion (operator-initiated or automatic)
- FR29: System releases the held funds when a booking is cancelled per the flat cancellation policy
- FR30: Operator can initiate hold capture for no-show bookings per contract terms
- FR31: System tracks cost per transaction (Stripe fees, Twilio SMS costs) for unit economics monitoring
- FR32: System applies the platform transaction fee (5–8%) on completed bookings

### Digital Contracts

- FR33: System generates a standard rental agreement from a single platform-wide template, populated with listing-specific and booking-specific details
- FR34: Renter can review and e-sign the contract as part of the booking flow
- FR35: Operator and renter can access signed contracts for any booking

### Communication Hub

- FR36: Operator can view all renter messages in a unified inbox regardless of originating classifieds platform
- FR37: Operator can respond to renter messages via the hub, delivered as SMS to the renter
- FR38: Renter can send SMS messages to the operator, routed through the platform via Twilio
- FR39: System sends automated SMS notifications for: booking confirmation, return reminders, extension confirmations, cancellation confirmations
- FR40: Operator receives real-time notifications for bookings, extensions, check-ins, cancellations, and no-shows

### Operator Authentication & Dashboard

- FR41: Operator can register and log in to the platform
- FR42: Operator can view upcoming, active, and past bookings across all listings
- FR43: Operator can view equipment check-in reports submitted by renters (damage reports, condition confirmations)
- FR44: Operator can flag a rental as a no-show and initiate hold capture

### Renter Identity & Privacy

- FR45: Renter can flag unrecognized rentals on their dashboard ("I don't recognize these rentals"), which disassociates the prior rental history from their phone number

## Non-Functional Requirements

### Performance

- Renter-facing booking page loads in under 3 seconds on mobile networks
- Availability calendar reflects current state within 5 seconds of any booking, extension, or cancellation
- SMS OTP delivery within 30 seconds of request (dependent on Twilio SLA)
- Booking flow (date selection → auth → contract → payment hold) completable in under 3 minutes with no system-induced delays

### Security

- All data encrypted in transit (TLS) and at rest
- Payment security delegated entirely to Stripe — no card numbers stored or processed by RentingApp
- Phone numbers stored securely — used as renter identity, must be protected
- Signed contracts stored immutably — no modification after signing
- OTP codes expire after 5 minutes and are single-use
- Operator authentication uses standard secure practices (hashed passwords, session management)
- Renter phone number disassociation (FR45) must not delete the underlying rental records — only the link to the phone number

### Reliability

- Target uptime: 99% (~7 hours downtime per month acceptable for MVP)
- No data loss on system failure — bookings, contracts, and payment states must be durable
- Stripe webhook handling must be resilient — missed webhooks must be recoverable to avoid payment state drift
- SMS delivery failures must be logged — if a return reminder or booking confirmation fails to send, the operator should be notified

### Data Retention

- Operator-side records (bookings, contracts, check-in reports, transaction history) retained for 3 years
- Renter dashboard visibility: 45 days post-completion, then removed from renter view (records still retained operator-side)
- Disassociated rental records (via FR45) retained for the full 3-year period but no longer linked to a phone number

### Integration

- **Stripe:** Core dependency for payment holds, captures, releases, and transaction fee processing. Must handle webhook events reliably for payment state synchronization. Standard Connect or direct integration — no custom payment processing.
- **Twilio:** Core dependency for bidirectional SMS (renter-operator communication), automated notifications (booking, return, extension, cancellation), and OTP authentication. Single provider for all SMS needs. Must handle delivery failures gracefully.
- No other third-party integrations required for MVP
