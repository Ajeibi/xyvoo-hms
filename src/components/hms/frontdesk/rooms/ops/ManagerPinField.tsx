"use client";

import { Input } from "@/components/ui/input";

export function ManagerPinField({
  requiresPin,
  managerPin,
  onManagerPinChange,
}: {
  requiresPin: boolean;
  managerPin: string;
  onManagerPinChange: (v: string) => void;
}) {
  if (!requiresPin) return null;
  return (
    <Input
      type="password"
      placeholder="Manager PIN"
      value={managerPin}
      onChange={(e) => onManagerPinChange(e.target.value)}
    />
  );
}
