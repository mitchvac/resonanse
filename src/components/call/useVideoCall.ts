import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '@/providers/trpc';
import { cameraErrorMessage } from '@/lib/cameraCheck';

/**
 * useVideoCall — real WebRTC 1:1 call over tRPC polling signaling.
 * STUN-only RTCPeerConnection; SDP offers/answers and ICE candidates are
 * exchanged through `videoCall.signal` / `videoCall.poll` (1s interval).
 * Remote candidates received before the remote description lands are
 * buffered and flushed after setRemoteDescription.
 */

export type CallRole = 'caller' | 'callee';
export type CallPhase = 'ringing' | 'connecting' | 'active';
export type CallEndReason = 'self' | 'ended' | 'declined' | 'missed';

type SignalPayload =
  | { type: 'offer'; data: RTCSessionDescriptionInit }
  | { type: 'answer'; data: RTCSessionDescriptionInit }
  | { type: 'candidate'; data: RTCIceCandidateInit | null };

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** @deprecated use cameraErrorMessage() from @/lib/cameraCheck — kept for imports */
export const CAMERA_ERROR = 'Camera unavailable — check browser permissions';

export function useVideoCall({
  sessionId,
  role,
  onEnded,
}: {
  sessionId: number;
  role: CallRole;
  /** fired exactly once, after local teardown */
  onEnded: (reason: CallEndReason, videoVerified: boolean) => void;
}) {
  const [phase, setPhase] = useState<CallPhase>(role === 'caller' ? 'ringing' : 'connecting');
  const [error, setError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [afterId, setAfterId] = useState(0);
  const [done, setDone] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteDescRef = useRef(false);
  const bufferedRef = useRef<RTCIceCandidateInit[]>([]);
  const endedRef = useRef(false);
  const answeredRef = useRef(false);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const signalMut = trpc.videoCall.signal.useMutation();
  const endMut = trpc.videoCall.end.useMutation();
  const signalRef = useRef(signalMut.mutateAsync);
  signalRef.current = signalMut.mutateAsync;
  const endRef = useRef(endMut.mutateAsync);
  endRef.current = endMut.mutateAsync;

  const sendSignal = useCallback(
    async (msg: SignalPayload) => {
      if (endedRef.current) return;
      try {
        await signalRef.current({ sessionId, payload: JSON.stringify(msg) });
      } catch {
        /* transient signaling failure — the peer keeps polling */
      }
    },
    [sessionId],
  );

  const localTeardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
  }, []);

  const teardown = useCallback(
    (reason: CallEndReason, videoVerified = false) => {
      if (endedRef.current) return;
      endedRef.current = true;
      setDone(true);
      localTeardown();
      onEndedRef.current(reason, videoVerified);
    },
    [localTeardown],
  );
  const teardownRef = useRef(teardown);
  teardownRef.current = teardown;

  /* ---- Signal handling (serialized through a promise chain) ---- */
  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = bufferedRef.current.splice(0);
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* stale candidate — safe to drop */
      }
    }
  }, []);

  const handleSignal = useCallback(
    async (raw: { id: number; payload: string }) => {
      const pc = pcRef.current;
      if (!pc || endedRef.current) return;
      let msg: SignalPayload;
      try {
        msg = JSON.parse(raw.payload) as SignalPayload;
      } catch {
        return;
      }
      try {
        if (msg.type === 'offer' && role === 'callee') {
          await pc.setRemoteDescription(msg.data);
          remoteDescRef.current = true;
          await flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal({ type: 'answer', data: answer });
        } else if (msg.type === 'answer' && role === 'caller') {
          await pc.setRemoteDescription(msg.data);
          remoteDescRef.current = true;
          await flushCandidates();
        } else if (msg.type === 'candidate' && msg.data) {
          if (remoteDescRef.current) {
            await pc.addIceCandidate(msg.data);
          } else {
            bufferedRef.current.push(msg.data);
          }
        }
      } catch {
        /* SDP/ICE race — the poll loop stays alive */
      }
    },
    [role, flushCandidates, sendSignal],
  );
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  /* ---- Camera + peer-connection setup (once per retry) ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
          throw new Error('unsupported');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setLocalStream(stream);
        setMicOn(true);
        setCamOn(true);

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.onicecandidate = (e) => {
          if (e.candidate) void sendSignal({ type: 'candidate', data: e.candidate.toJSON() });
        };
        pc.ontrack = (e) => {
          const [s] = e.streams;
          if (s) setRemoteStream(s);
        };

        if (role === 'caller') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal({ type: 'offer', data: offer });
        }
      } catch {
        if (!cancelled) setError(cameraErrorMessage());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryTick, role, sendSignal]);

  /* ---- Poll the session (1s) for remote signals + status ---- */
  const poll = trpc.videoCall.poll.useQuery(
    { sessionId, afterId },
    {
      refetchInterval: 1000,
      enabled: !done && !error,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  /* Session vanished (expired/cleaned up) → tear down quietly */
  useEffect(() => {
    if (poll.error) teardownRef.current('ended');
  }, [poll.error]);

  useEffect(() => {
    const data = poll.data;
    if (!data || endedRef.current) return;
    const signals = [...data.signals].sort((a, b) => a.id - b.id);
    if (signals.length > 0) {
      const maxId = signals[signals.length - 1].id;
      chainRef.current = chainRef.current
        .then(async () => {
          for (const s of signals) await handleSignalRef.current(s);
        })
        .catch(() => {});
      setAfterId((a) => Math.max(a, maxId));
    }
    if (data.answeredAt && !answeredRef.current) {
      answeredRef.current = true;
      setActiveSince(Date.now());
      setPhase('active');
    }
    if (data.status === 'ended') teardownRef.current('ended');
    else if (data.status === 'declined') teardownRef.current('declined');
    else if (data.status === 'missed') teardownRef.current('missed');
  }, [poll.data]);

  /* ---- Teardown on unmount / route change (best-effort server end) ---- */
  useEffect(
    () => () => {
      if (!endedRef.current) {
        endedRef.current = true;
        localTeardown();
        void endRef.current({ sessionId }).catch(() => {});
      }
    },
    [localTeardown, sessionId],
  );

  /* ---- Controls ---- */
  const hangUp = useCallback(async () => {
    if (endedRef.current) return;
    try {
      const res = await endRef.current({ sessionId });
      teardownRef.current('self', res.videoVerified);
    } catch {
      teardownRef.current('self', false);
    }
  }, [sessionId]);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setRetryTick((t) => t + 1);
  }, []);

  return {
    phase,
    error,
    localStream,
    remoteStream,
    micOn,
    camOn,
    activeSince,
    hangUp,
    toggleMic,
    toggleCam,
    retry,
  };
}
