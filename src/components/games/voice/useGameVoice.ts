import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  type Participant,
} from 'livekit-client';
import { trpc } from '@/providers/trpc';
import { isMediaCaptureUnavailable, micErrorMessage } from '@/lib/cameraCheck';

/**
 * useGameVoice — LiveKit voice for a game table.
 *
 * The room is `game-{game}-{matchId}` and only the two matched members can
 * receive a token (server enforces membership + blocks). Joining IS the
 * consent: voice is off until you tap enable, and you hear the other player
 * only after they tap too. Either side can mute or hang up at any time.
 * Nothing is recorded — LiveKit relays live encrypted audio only.
 */

export type VoiceState =
  | 'idle' // not joined — mic untouched
  | 'requesting' // asking the browser for the mic
  | 'connecting' // joining the room
  | 'waiting' // in the room alone, peer hasn't enabled voice
  | 'live' // peer present — talking
  | 'error';

export interface VoicePeer {
  identity: string;
  name: string;
  speaking: boolean;
  micMuted: boolean;
}

export function useGameVoice({
  matchId,
  game,
}: {
  /** null → bot table: voice stays unavailable, no token request is made */
  matchId: number | null;
  game: string;
}) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const roomRef = useRef<Room | null>(null);
  const mountedRef = useRef(true);

  const configQuery = trpc.voice.config.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const joinMut = trpc.voice.join.useMutation();

  const describePeers = useCallback((room: Room) => {
    const list: VoicePeer[] = [];
    room.remoteParticipants.forEach((p: Participant) => {
      list.push({
        identity: p.identity,
        name: p.name || 'Player',
        speaking: p.isSpeaking,
        micMuted: !p.isMicrophoneEnabled,
      });
    });
    return list;
  }, []);

  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
    }
    if (mountedRef.current) {
      setState('idle');
      setPeers([]);
      setMicOn(true);
    }
  }, []);

  const join = useCallback(async () => {
    if (!matchId || roomRef.current) return;
    setError(null);

    if (isMediaCaptureUnavailable()) {
      setError(micErrorMessage());
      setState('error');
      return;
    }

    setState('requesting');
    try {
      const { url, token } = await joinMut.mutateAsync({ matchId, game });
      if (!mountedRef.current) return;

      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      const syncPeers = () => {
        if (!mountedRef.current) return;
        const list = describePeers(room);
        setPeers(list);
        setState((s) =>
          s === 'error' || s === 'idle'
            ? s
            : list.length > 0
              ? 'live'
              : room.state === ConnectionState.Connected
                ? 'waiting'
                : s,
        );
      };
      room
        .on(RoomEvent.ParticipantConnected, syncPeers)
        .on(RoomEvent.ParticipantDisconnected, syncPeers)
        .on(RoomEvent.ActiveSpeakersChanged, syncPeers)
        .on(RoomEvent.TrackMuted, syncPeers)
        .on(RoomEvent.TrackUnmuted, syncPeers)
        .on(RoomEvent.Disconnected, () => {
          if (mountedRef.current) {
            setState('idle');
            setPeers([]);
          }
        });

      setState('connecting');
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!mountedRef.current) {
        void room.disconnect();
        return;
      }
      setMicOn(true);
      syncPeers();
    } catch (e) {
      if (!mountedRef.current) return;
      roomRef.current?.removeAllListeners();
      void roomRef.current?.disconnect();
      roomRef.current = null;
      const msg =
        e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')
          ? micErrorMessage()
          : e instanceof Error && e.message
            ? e.message
            : "Couldn't start voice — try again.";
      setError(msg);
      setState('error');
    }
  }, [matchId, game, joinMut, describePeers]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    if (mountedRef.current) setMicOn(next);
  }, [micOn]);

  // hard teardown on unmount — a live mic never survives leaving the page
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        void room.disconnect();
      }
    };
  }, []);

  return {
    state,
    error,
    micOn,
    peers,
    configured: configQuery.data?.enabled ?? false,
    join,
    leave,
    toggleMic,
  };
}
