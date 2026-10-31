/* =========================================================================
   KEZMOTO — Data service layer
   (Phase 2: Supabase; Phase 3: transactions; Phase 4: payments; Phase 5: AI)

   Every screen still imports from this module and nothing else. The mock
   tables are gone; each api object now lives in its own service file and
   talks to Supabase. Signatures, return types and the promise-based contract
   are unchanged from Phase 1, so no component or context had to be
   restructured to move onto real data.

     authApi          → authService.ts          (Supabase Auth + profiles)
     listingsApi      → listingsService.ts      (listings + storage + redactions)
     favoritesApi     → favoritesService.ts
     chatsApi         → chatService.ts          (chats, messages, realtime)
     wantedApi        → wantedService.ts
     usersApi         → usersService.ts
     transactionsApi  → transactionsService.ts  (Phase 3)
     verificationApi  → verificationService.ts  (Phase 3)
     reviewsApi       → reviewsService.ts       (Phase 3)
     paymentsApi      → paymentsService.ts      (Phase 4 — manual GCash confirm, no gateway)
     aiApi            → aiService.ts            (Phase 5 — calls Edge Functions only)
     fraudApi         → fraudService.ts          (Phase 5 — admin fraud flag review)
     userReportsApi   → userReportsService.ts    (customer reports + admin review)
     notificationsApi → notificationsService.ts  (bell feed, realtime)
     listingAppealsApi → listingAppealsService.ts (seller appeals a removed listing)
   ========================================================================= */

export { authApi } from './authService';
export type { RegisterInput } from './authService';
export { listingsApi } from './listingsService';
export { favoritesApi } from './favoritesService';
export { chatsApi } from './chatService';
export { wantedApi } from './wantedService';
export { usersApi } from './usersService';
export { transactionsApi } from './transactionsService';
export { verificationApi } from './verificationService';
export type { VerificationInput } from './verificationService';
export { reviewsApi } from './reviewsService';
export { paymentsApi, commissionAmountFor, COMMISSION_RATE } from './paymentsService';
export { aiApi } from './aiService';
export type {
  AskChatbotResult,
  CheckFraudResult,
  ScoreConditionResult,
  ScoreListingQualityResult,
} from './aiService';
export { fraudApi } from './fraudService';
export { userReportsApi } from './userReportsService';
export { notificationsApi } from './notificationsService';
export type { AppNotification } from './notificationsService';
export { listingAppealsApi } from './listingAppealsService';
