"use client";

import { floorLabel } from "@/lib/hms/front-desk-board";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers } from "lucide-react";

export function FrontDeskFloorTabs({
  floors,
  activeFloor,
  onChange,
}: {
  floors: number[];
  activeFloor: number;
  onChange: (floor: number) => void;
}) {
  if (floors.length === 0) return null;

  return (
    <Tabs
      value={String(activeFloor)}
      onValueChange={(value) => onChange(Number(value))}
      className="w-full"
    >
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          Select floor
        </p>
        <TabsList aria-label="Floors">
          {floors.map((floor) => (
            <TabsTrigger key={floor} value={String(floor)}>
              {floorLabel(floor)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
