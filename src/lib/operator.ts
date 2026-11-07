import { useEffect, useState } from "react";
import { getOperatorSession } from "@/lib/fn/public";

/**
 * A returning operator should land straight in the console, not wait on a blank screen while the
 * browser asks the server "is my cookie still good?". After every successful check we remember
 * (in this browser only) that this browser holds an operator session, plus the little the shell
 * needs to draw itself (name, owner flag). On the next visit the console shell appears at once and
 * the real check runs in the background; if it says the session is gone, the hint is cleared and
 * the operator is sent to the login page. The hint is only a hint: every admin action and every
 * piece of data is still authorised by the server, so a stale or forged hint shows an empty shell
 * and nothing else.
 */
const HINT_KEY = "hifi_operator_hint";

type Who = { name: string | null; owner: boolean; needsAccount: boolean };

function readHint(): Who | null {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Who>;
    return { name: typeof v.name === "string" ? v.name : null, owner: Boolean(v.owner), needsAccount: Boolean(v.needsAccount) };
  } catch {
    return null;
  }
}

function writeHint(who: Who | null) {
  try {
    if (who) window.localStorage.setItem(HINT_KEY, JSON.stringify(who));
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    /* private mode / storage blocked: the check just runs on every visit */
  }
}

/** Call when the operator signs out so the next visit does not show the console for a moment. */
export function clearOperatorHint() {
  writeHint(null);
}

export function useOperatorSession(options?: { trustHint?: boolean }) {
  const trustHint = options?.trustHint ?? true;
  const [isOperator, setIsOperator] = useState(false);
  const [who, setWho] = useState<Who>({ name: null, owner: false, needsAccount: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Returning operator: draw the console immediately, confirm in the background.
    const hint = trustHint ? readHint() : null;
    if (hint) {
      setIsOperator(true);
      setWho(hint);
      setReady(true);
    }

    getOperatorSession()
      .then((result) => {
        if (cancelled) return;

        setIsOperator(result.ok);
        setWho({ name: result.name, owner: result.owner, needsAccount: result.needsAccount });
        setReady(true);
        writeHint(result.ok ? { name: result.name, owner: result.owner, needsAccount: result.needsAccount } : null);
      })
      .catch((error) => {
        console.error("[operator] session check failed:", error);

        if (!cancelled) {
          // No network: keep the console the hint drew rather than throwing the operator out.
          if (!hint) setIsOperator(false);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trustHint]);

  return {
    isPending: !ready,
    isOperator,
    name: who.name,
    isOwner: who.owner,
    needsAccount: who.needsAccount,
  };
}
