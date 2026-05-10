"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChartViewToggleProps {
  value: "donut" | "bar";
  onChange: (view: "donut" | "bar") => void;
}

export function ChartViewToggle({ value, onChange }: ChartViewToggleProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as "donut" | "bar")}>
      <TabsList className="h-7">
        <TabsTrigger value="donut" className="text-xs px-2">Donut</TabsTrigger>
        <TabsTrigger value="bar" className="text-xs px-2">Bar</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
