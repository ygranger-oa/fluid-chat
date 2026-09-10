"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { GifResult } from "@/shared/types";
import { api } from "../../api";
import { useI18n } from "../../i18n";

/**
 * GIF search, mirroring EmojiPicker's shape (search box, scrollable grid,
 * pick-and-close). Unlike emoji, a pick is async: `onPick` awaits the caller
 * copying the GIF into our own storage before the popover closes, so a failed
 * import can surface an error instead of silently vanishing.
 */
export function GifPicker({
  workspaceId,
  onPick,
  onClose
}: {
  workspaceId: string;
  onPick: (gif: GifResult) => Promise<void> | void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const term = query.trim();
    setLoading(true);
    setError(false);
    const timer = setTimeout(
      () => {
        const request = term ? api.gifs.search(workspaceId, term) : api.gifs.trending(workspaceId);
        request
          .then(({ gifs }) => {
            if (requestId.current !== id) return;
            setGifs(gifs);
          })
          .catch(() => {
            if (requestId.current !== id) return;
            setError(true);
          })
          .finally(() => {
            if (requestId.current !== id) return;
            setLoading(false);
          });
      },
      term ? 350 : 0
    );
    return () => clearTimeout(timer);
  }, [query, workspaceId]);

  const pick = async (gif: GifResult) => {
    if (sendingId) return;
    setSendingId(gif.id);
    try {
      await onPick(gif);
      onClose?.();
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="gif-picker">
      <div className="emoji-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("gif.search")}
          autoFocus
          aria-label={t("gif.search")}
        />
      </div>

      <div className="emoji-scroll">
        <div className="emoji-section">
          <h4>{query ? t("gif.results") : t("gif.trending")}</h4>
          {loading ? (
            <p className="emoji-empty">{t("gif.loading")}</p>
          ) : error ? (
            <p className="emoji-empty">{t("gif.error")}</p>
          ) : gifs.length === 0 ? (
            <p className="emoji-empty">{t("gif.noneFound")}</p>
          ) : (
            <div className="gif-grid">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  className={sendingId === gif.id ? "is-sending" : ""}
                  title={gif.title ?? undefined}
                  disabled={sendingId !== null}
                  onClick={() => void pick(gif)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gif.previewUrl} alt={gif.title ?? ""} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="emoji-footer gif-footer">
        <span>{t("gif.poweredBy")}</span>
      </footer>
    </div>
  );
}
