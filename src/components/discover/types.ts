import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../api/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** One entry of the Daily Resonance Queue (discover.queue) */
export type QueueEntry = RouterOutputs['discover']['queue']['entries'][number];
/** Profile shape as returned by the queue (db Profile row) */
export type QueueProfile = QueueEntry['profile'];

/** One incoming like/pulse (likes.received) */
export type ReceivedLike =
  RouterOutputs['likes']['received']['pulses'][number];

export type ReceivedLiker = NonNullable<ReceivedLike['liker']>;

export type Entitlements = RouterOutputs['premium']['entitlements']['entitlement'];

export type LikesRemaining = RouterOutputs['likes']['remaining'];

export type SwipeAction = 'like' | 'pass' | 'pulse' | 'flower';
