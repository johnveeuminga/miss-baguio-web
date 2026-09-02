import { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { BASE } from "@/lib/api";

/**
 * One shared `/scoringHub` connection per token, ref-counted across every
 * component that calls this hook. AdminActiveControl, its nested Scoresheet,
 * and its nested Top7ReadinessCard each used to open their own independent
 * HubConnection — three-plus concurrent connections from one browser tab,
 * all subscribed to overlapping events. SignalR's .on() already supports
 * multiple handlers for the same event on one connection, so there's no
 * need for three sockets; this just gives every caller in the tree the same
 * live connection instead of dialing in separately.
 *
 * The connection is created on the first mount that needs it and torn down
 * once the last consumer unmounts (or the token changes/clears). Returns
 * null until the shared connection exists — callers should guard their
 * .on() registration on a non-null value, same as they'd guard on
 * conn.start() resolving before.
 */
type SharedConnection = {
  connection: signalR.HubConnection;
  refCount: number;
};

const sharedConnections = new Map<string, SharedConnection>();

export function useScoringHubConnection(
  token: string | null | undefined
): signalR.HubConnection | null {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(
    null
  );

  useEffect(() => {
    if (!token) {
      setConnection(null);
      return;
    }

    let entry = sharedConnections.get(token);
    if (!entry) {
      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${BASE}/scoringHub`, { accessTokenFactory: () => token })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();
      entry = { connection: conn, refCount: 0 };
      sharedConnections.set(token, entry);
      void conn.start().catch((err) => {
        console.error("scoringHub connection failed to start", err);
      });
    }

    entry.refCount += 1;
    setConnection(entry.connection);

    return () => {
      const current = sharedConnections.get(token);
      if (!current) return;
      current.refCount -= 1;
      if (current.refCount <= 0) {
        sharedConnections.delete(token);
        void current.connection.stop();
      }
    };
  }, [token]);

  return connection;
}
