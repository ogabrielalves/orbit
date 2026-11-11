import type { TextPart } from "@/bindings";

type HighlightedTextProps = {
  parts: TextPart[];
};

type KeyedPart = {
  key: string;
  part: TextPart;
};

function keyParts(parts: TextPart[]): KeyedPart[] {
  let offset = 0;
  return parts.map((part) => {
    const keyed = { key: `${offset}-${part.isMatch}`, part };
    offset += part.text.length;
    return keyed;
  });
}

export function HighlightedText({ parts }: HighlightedTextProps) {
  return (
    <>
      {keyParts(parts).map(({ key, part }) =>
        part.isMatch ? (
          <mark key={key} className="rounded-xs bg-primary-soft px-px font-semibold text-fg">
            {part.text}
          </mark>
        ) : (
          <span key={key}>{part.text}</span>
        ),
      )}
    </>
  );
}
