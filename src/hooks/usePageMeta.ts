import { useEffect } from "react";

type PageMeta = {
  title?: string;
  description?: string;
};

function setNamedMeta(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = descriptionMeta?.content;

    if (title) {
      document.title = title;
    }
    if (description !== undefined) {
      setNamedMeta("description", description);
    }

    return () => {
      document.title = previousTitle;
      if (previousDescription !== undefined) {
        setNamedMeta("description", previousDescription);
      }
    };
  }, [title, description]);
}
