"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const MESSAGES: Record<string, string> = {
  already_booked: "You are already on this one.",
  cancelled: "That class is no longer running.",
  full: "That class just filled up.",
};

/**
 * There is no sign-in yet, so every booking is made as the same member. Adding
 * real auth is a README task; until then this keeps the flow demonstrable.
 */
export function BookButton({
  full,
  sessionId,
}: {
  full: boolean;
  sessionId: string;
}) {
  const [booked, setBooked] = useState(false);
  const [pending, startTransition] = useTransition();

  const book = () => {
    startTransition(async () => {
      const response = await fetch("/api/book", {
        body: JSON.stringify({ sessionId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json();

      if (result.ok) {
        setBooked(true);
        toast.success("Booked. See you there.");
        return;
      }
      toast.error(MESSAGES[result.reason] ?? "That did not work.");
    });
  };

  if (booked) {
    return (
      <Button disabled variant="secondary">
        Booked
      </Button>
    );
  }

  return (
    <Button disabled={full || pending} onClick={book}>
      {full ? "Full" : "Book"}
    </Button>
  );
}
