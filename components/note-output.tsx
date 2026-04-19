"use client";

import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CopyButton from "@/components/copy-button";

export interface NoteOutputProps {
  title: string;
  description: string;
  value: string;
  generatedValue: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}

export default function NoteOutput({
  title,
  description,
  value,
  generatedValue,
  placeholder,
  disabled = false,
  onChange,
  onReset,
}: NoteOutputProps) {
  const hasContent = value.trim().length > 0;

  return (
    <Card className="overflow-hidden border-slate-700/80 bg-slate-900/70 text-slate-100">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl text-slate-300">{description}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CopyButton text={disabled ? "" : value} label="Copy" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={disabled || generatedValue.trim().length === 0}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[260px] resize-y text-[15px] leading-7"
          spellCheck={false}
        />
        {!hasContent ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">{placeholder}</p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-start">
        <p className="text-xs text-slate-400">
          Editable text. Reset restores this section to the last AI chart output.
        </p>
      </CardFooter>
    </Card>
  );
}
