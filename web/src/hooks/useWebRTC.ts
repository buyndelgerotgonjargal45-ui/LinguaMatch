"use client";

import type { RTCIceServerLike, SignalPayload } from "@linguamatch/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSocket } from "@/lib/socket";

export type PeerState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

/**
 * Peer-to-peer audio/video between the two room participants. Socket.IO only relays
 * signaling (SDP + ICE); media flows directly between browsers (or via TURN if configured).
 */
export function useWebRTC(socket: AppSocket | null, roomId: string, localStream: MediaStream | null) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const pendingSignals = useRef<SignalPayload[]>([]);
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<PeerState>("idle");

  const close = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    setRemoteStream(null);
  }, []);

  const sendSignal = useCallback(
    (data: SignalPayload) => socket?.emit("signal", { roomId, data }),
    [socket, roomId],
  );

  const flushCandidates = async (pc: RTCPeerConnection) => {
    for (const c of pendingCandidates.current.splice(0)) {
      await pc.addIceCandidate(c).catch((e) => console.warn("[rtc] addIceCandidate", e));
    }
  };

  const handleSignal = useCallback(
    async (data: SignalPayload) => {
      const pc = pcRef.current;
      if (!pc) {
        pendingSignals.current.push(data);
        return;
      }
      try {
        if (data.type === "offer") {
          await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: "answer", sdp: answer.sdp ?? "" });
        } else if (data.type === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
            await flushCandidates(pc);
          }
        } else if (data.type === "candidate") {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate as RTCIceCandidateInit);
          else pendingCandidates.current.push(data.candidate as RTCIceCandidateInit);
        }
      } catch (err) {
        console.error("[rtc] signal handling failed", err);
      }
    },
    [sendSignal],
  );

  /** (Re)creates the peer connection. Called on every room:ready (including after a partner refresh). */
  const start = useCallback(
    async (role: "caller" | "callee", iceServers: RTCIceServerLike[]) => {
      close();
      setState("connecting");
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const stream = localStreamRef.current;
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
      else {
        // Still receive the partner's media even if we couldn't capture our own.
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
      }

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (e) => {
        if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
        setRemoteStream(new MediaStream(remote.getTracks()));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ type: "candidate", candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") setState("connected");
        else if (s === "disconnected") setState("reconnecting");
        else if (s === "failed") setState("failed");
      };

      for (const queued of pendingSignals.current.splice(0)) await handleSignal(queued);

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", sdp: offer.sdp ?? "" });
      }
    },
    [close, handleSignal, sendSignal],
  );

  useEffect(() => {
    if (!socket) return;
    const onSignal = ({ data }: { data: SignalPayload }) => void handleSignal(data);
    socket.on("signal", onSignal);
    return () => {
      socket.off("signal", onSignal);
    };
  }, [socket, handleSignal]);

  useEffect(() => close, [close]);

  return { remoteStream, state, start, close, setState };
}
