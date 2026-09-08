"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Smile } from "lucide-react";
import type { MessageDto, ReactionSummary } from "@/shared/types";
import { emojiLabel, reactionShortcuts, rememberEmoji } from "../../emoji";
import { useI18n } from "../../i18n";
import { useApp } from "../../store";
import { Popover } from "../ui/primitives";
import { EmojiPicker } from "../ui/emoji-picker";
import { EmojiValue } from "./rich-text";

/** Names beyond this are collapsed into "and N others", as Slack does. */
const NAMES_SHOWN = 8;

/**
 * Reads the reactor list the way a person would say it: you first, then who
 * else, then what they reacted with.
 */
function reactorNames(reaction: ReactionSummary, viewerId: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  const others = reaction.users.filter((user) => user.id !== viewerId).map((user) => user.displayName);
  const names = reaction.reacted ? [t("emoji.you"), ...others] : others;
  const hidden = names.length - NAMES_SHOWN;
  const shown = hidden > 0 ? names.slice(0, NAMES_SHOWN) : names;
  if (hidden > 0) shown.push(hidden === 1 ? t("emoji.other", { count: hidden }) : t("emoji.others", { count: hidden }));
  if (shown.length === 0) return "";
  if (shown.length === 1) return shown[0];
  return t("emoji.namesJoin", { names: shown.slice(0, -1).join(", "), last: shown[shown.length - 1] });
}

export function MessageReactions({ message }: { message: MessageDto }) {
  const { actions } = useApp();
  const { t } = useI18n();
  if (message.reactions.length === 0) return null;

  return (
    <div className="reactions">
      {message.reactions.map((reaction) => (
        <ReactionChip
          key={reaction.emoji}
          reaction={reaction}
          onToggle={() => {
            if (!reaction.reacted) rememberEmoji(reaction.emoji);
            void actions.toggleReaction(message, reaction.emoji);
          }}
        />
      ))}
      <Popover
        width={340}
        trigger={({ toggle, ref }) => (
          <button type="button" className="reaction add-reaction" onClick={toggle} ref={ref} aria-label={t("emoji.addReaction")}>
            <Smile size={14} />
          </button>
        )}
      >
        {(close) => <EmojiPicker onPick={(value) => void actions.toggleReaction(message, value)} onClose={close} />}
      </Popover>
    </div>
  );
}

function ReactionChip({ reaction, onToggle }: { reaction: ReactionSummary; onToggle: () => void }) {
  const { state } = useApp();
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // The card is positioned once, so anything that moves the chip out from under
  // it — a new message scrolling the list, a resize — dismisses it rather than
  // leaving it stranded mid-air.
  useEffect(() => {
    if (!hovered) return;
    const dismiss = () => setHovered(false);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [hovered]);

  const names = reactorNames(reaction, state.session?.id, t);
  const label = emojiLabel(reaction.emoji);
  // Screen readers get the same sentence the hover card shows.
  const description = t("emoji.reactedWith", { names, label });

  return (
    <>
      <button
        type="button"
        ref={ref}
        className={reaction.reacted ? "reaction is-mine" : "reaction"}
        aria-pressed={reaction.reacted}
        aria-label={description}
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <EmojiValue value={reaction.emoji} />
        <span>{reaction.count}</span>
      </button>
      {hovered ? (
        <ReactionTooltip anchor={ref} emoji={reaction.emoji} names={names} label={label} />
      ) : null}
    </>
  );
}

/**
 * Portalled so the card is never clipped by the scrolling message list, and
 * positioned like the popover: above the chip, flipping below when the top of
 * the viewport is closer than the card is tall.
 */
function ReactionTooltip({
  anchor,
  emoji,
  names,
  label
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  emoji: string;
  names: string;
  label: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const trigger = anchor.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const flip = rect.top - gap - margin < height;
    setPosition({
      top: flip ? rect.bottom + gap : rect.top - gap - height,
      left: Math.max(
        margin,
        Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin)
      )
    });
  }, [anchor, names]);

  return createPortal(
    <div className="reaction-tooltip" role="tooltip" ref={cardRef} style={position}>
      <span className="reaction-tooltip-emoji">
        <EmojiValue value={emoji} />
      </span>
      <p>
        <strong>{names}</strong> reacted with <span className="reaction-tooltip-name">{label}</span>
      </p>
    </div>,
    document.body
  );
}

/** Hover-toolbar shortcuts, learned from what this user actually reaches for. */
export function QuickReactions({ message }: { message: MessageDto }) {
  const { actions } = useApp();
  // The frequency list lives in localStorage, so it is read after mount to keep
  // the server and client renders identical.
  const [emoji, setEmoji] = useState<string[]>([]);
  useEffect(() => setEmoji(reactionShortcuts()), []);

  return (
    <>
      {emoji.map((value) => (
        <button
          key={value}
          type="button"
          title={`React with ${emojiLabel(value)}`}
          onClick={() => {
            rememberEmoji(value);
            void actions.toggleReaction(message, value);
          }}
        >
          <EmojiValue value={value} />
        </button>
      ))}
    </>
  );
}
