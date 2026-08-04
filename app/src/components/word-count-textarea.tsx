"use client";

import { useState } from "react";

function countWords(text: string) {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function WordCountTextarea(
  props: React.ComponentProps<"textarea">,
) {
  const [count, setCount] = useState(() =>
    countWords(String(props.defaultValue ?? "")),
  );

  return (
    <div>
      <textarea
        {...props}
        onChange={(e) => {
          setCount(countWords(e.target.value));
          props.onChange?.(e);
        }}
        className={`w-full border border-bone bg-transparent p-4
                    focus:border-indigo focus:outline-none ${props.className ?? ""}`}
      />
      <p className="data mt-2 text-sm text-iron">
        {count} {count === 1 ? "word" : "words"}
      </p>
    </div>
  );
}
