"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { INDICATORS, type ScoreInputValues } from "@/utils/qing";

interface Props {
  values: ScoreInputValues;
  onValuesChange: (v: ScoreInputValues) => void;
  mode: "set" | "add";
  onModeChange: (m: "set" | "add") => void;
}

/** Legitimacy / Military / Economics inputs. Blank boxes are left unchanged. */
export function ScoreInputs({ values, onValuesChange, mode, onModeChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Apply as</Label>
        <NativeSelect
          size="sm"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as "set" | "add")}
        >
          <NativeSelectOption value="set">Set to</NativeSelectOption>
          <NativeSelectOption value="add">Add (+/-)</NativeSelectOption>
        </NativeSelect>
      </div>
      {INDICATORS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs" htmlFor={`score-${key}`}>
            {label}
          </Label>
          <Input
            id={`score-${key}`}
            type="number"
            step="0.1"
            min={mode === "set" ? 0 : undefined}
            max={mode === "set" ? 5 : undefined}
            placeholder="unchanged"
            className="h-7 w-28"
            value={values[key]}
            onChange={(e) => onValuesChange({ ...values, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
