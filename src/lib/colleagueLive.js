/* ═══════════════════════════════════════════════════
   Know your colleagues, live on every phone in the group
   ═══════════════════════════════════════════════════

   Only the group leader answers. Their phone broadcasts the quiz as it
   stands — the question, the options, what they picked — on a Realtime
   broadcast channel for the group, and every other member's phone shows
   the same screen. Nothing is stored: a member who opens the app late
   asks for the latest ("sync") and the leader's phone answers, and it
   repeats itself every 15 seconds in case a message was missed.

   The right answer is only sent once the leader has picked, so it can't
   be read off a member's phone first. */

import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const topic = (team) => `colleague-live:${team}`;
const HEARTBEAT_MS = 15000;

/** The leader's phone: sends `state` whenever it changes. */
export function useColleagueBroadcast(teamId, state, enabled) {
  const channel = useRef(null);
  const json = state ? JSON.stringify(state) : null;
  const latest = useRef(json);
  latest.current = json;

  useEffect(() => {
    if (!enabled || !supabase || !teamId) return undefined;
    const ch = supabase.channel(topic(teamId), { config: { broadcast: { self: false } } });
    const send = () => {
      if (latest.current) ch.send({ type: 'broadcast', event: 'state', payload: JSON.parse(latest.current) });
    };
    ch.on('broadcast', { event: 'sync' }, send).subscribe((status) => {
      if (status === 'SUBSCRIBED') { channel.current = ch; send(); }
    });
    const id = setInterval(send, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [enabled, teamId]);

  useEffect(() => {
    if (json && channel.current) {
      channel.current.send({ type: 'broadcast', event: 'state', payload: JSON.parse(json) });
    }
  }, [json]);
}

/** A member's phone: the leader's latest state, or null until it arrives. */
export function useColleagueWatch(teamId, enabled) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !supabase || !teamId) return undefined;
    const ch = supabase.channel(topic(teamId), { config: { broadcast: { self: false } } });
    const askLeader = () => ch.send({ type: 'broadcast', event: 'sync', payload: {} });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => setState(payload)).subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') askLeader();
    });
    /* Back to the app after the screen was off: catch up straight away. */
    const wake = () => { if (document.visibilityState === 'visible') askLeader(); };
    document.addEventListener('visibilitychange', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      supabase.removeChannel(ch);
    };
  }, [enabled, teamId]);

  return { state, connected };
}
