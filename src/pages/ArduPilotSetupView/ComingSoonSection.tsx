export function ComingSoonSection({ heading, description }: { heading: string; description: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center">
      <p className="text-sm font-medium">{heading}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
